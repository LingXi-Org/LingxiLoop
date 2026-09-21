import { createHash } from 'node:crypto'
import type { LingxiMessageV1 } from './message-types.js'
import type { Queryable } from '../db/queryable.js'
import { parseMentions } from '../mentions.js'
import { resolveLearningAgentRecipients } from './routing.js'
import {
  completeWebhookReceipt,
  containsManagedTeacherAgent,
  lockWebhookReceipt,
  teacherRoomForWebhook,
  webhookBinding,
  webhookConversation,
  webhookMembers,
} from './webhook-repository.js'

interface KnowledgeJobInput {
  companyId: string
  projectId: string
  conversationId: string
  clientMsgNo: string
  createdBy: string
  title: string
  mime: string
  size: number
  storageKey: string
  threadRootClientMsgNo?: string
  recipients: Array<{ agentId: string; reason: string }>
}

export interface WukongWebhookInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  verify(raw: Buffer, signature?: string, token?: string): boolean
  isKnowledgeAttachment(mime: string, size: number): boolean
  createKnowledgeJob(db: Queryable, input: KnowledgeJobInput): Promise<{ deferAgentWake: boolean; sourceId: string }>
  enqueueAgentWakes(db: Queryable, input: {
    eventId: string; companyId: string; channelId: string; clientMsgNo: string
    payload: LingxiMessageV1; recipients: string[]; knowledgeSourceId?: string
  }): Promise<number>
  flushAgentWakes(eventId: string): Promise<number>
}

export interface WukongCommittedEvent {
  raw: Buffer
  eventId: string
  eventType: string
  channelId: string
  clientMsgNo: string
  fromUid: string
  payload: LingxiMessageV1
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export class WukongWebhookApplication {
  constructor(private readonly infrastructure: WukongWebhookInfrastructure) {}

  verify(raw: Buffer, signature?: string, token?: string): boolean {
    return this.infrastructure.verify(raw, signature, token)
  }

  async process(input: WukongCommittedEvent): Promise<Record<string, unknown>> {
    const payloadHash = createHash('sha256').update(input.raw).digest('hex')
    const result = await this.infrastructure.transaction(async (db) => {
      const receipt = await lockWebhookReceipt(db, {
        eventId: input.eventId,
        eventType: input.eventType,
        payloadHash,
      })
      if (receipt.payloadHash !== payloadHash) {
        throw Object.assign(new Error('event_id was reused with a different payload'), { status: 409 })
      }
      if (receipt.processed) return { ok: true, duplicate: true }
      if (input.eventType !== 'msg.notify' && !input.eventType.includes('message')) {
        await completeWebhookReceipt(db, input.eventId)
        return { ok: true, ignored: true }
      }
      if (input.payload.data?.suppressAgentWake === true && input.payload.kind !== 'attachment') {
        await completeWebhookReceipt(db, input.eventId)
        return { ok: true, ignored: true, reason: 'product-state update' }
      }
      const binding = await webhookBinding(db, input.channelId)
      if (!binding) throw Object.assign(new Error('WuKong channel is not bound yet; retry webhook'), { status: 503 })
      const profileMembers = Array.isArray(binding.profile.members) ? binding.profile.members.map(String) : []
      const members = await webhookMembers(db, { companyId: binding.company_id, memberIds: profileMembers })
      const calendarDispatch = input.fromUid === 'calendar' && input.payload.kind === 'system'
        && typeof input.payload.data?.calendarEventId === 'string'
        && typeof input.payload.data?.scheduledFor === 'string'
      if (!members.some((member) => member.id === input.fromUid) && !calendarDispatch) {
        throw new Error('message author is not a bound channel member')
      }
      const teacherRoom = await teacherRoomForWebhook(db, {
        channelId: input.channelId,
        authorId: input.fromUid,
        companyId: binding.company_id,
      })
      if (teacherRoom) {
        if (teacherRoom.status !== 'active') {
          throw new Error('teacher room is read-only')
        }
        const author = members.find((member) => member.id === input.fromUid)
        if (author?.kind === 'human' && !teacherRoom.is_teacher) {
          throw new Error('teacher room requires current course teacher membership')
        }
        if (author?.kind === 'agent' && input.fromUid !== teacherRoom.agent_id) {
          throw new Error('only the registered 望远 Agent may write as an Agent in this room')
        }
      }
      const refs = input.payload.refs ?? {}
      const parsedMentions = parseMentions(input.payload.body ?? '', members)
      const mentionedIds = [...new Set([
        ...(Array.isArray(input.payload.data?.mentionedIds) ? input.payload.data.mentionedIds.map(String) : []),
        ...parsedMentions.mentionedIds,
      ])]
      const mentionAll = input.payload.data?.mentionAll === true || parsedMentions.mentionAll
      const recipients = resolveLearningAgentRecipients({
        authorId: input.fromUid,
        channelType: Number(binding.profile.channelType ?? 2),
        members: members.map((member) => ({ id: member.id, kind: member.kind, presetKey: member.preset_key })),
        mentionedIds,
        mentionAll,
        replyAuthorId: typeof input.payload.data?.replyAuthorId === 'string'
          ? input.payload.data.replyAuthorId : undefined,
        leaderAgentId: binding.leader_agent_id ?? undefined,
        handoffTargetId: input.payload.kind === 'handoff' && typeof refs.toAgentId === 'string'
          ? refs.toAgentId : undefined,
      })
      if (teacherRoom && recipients.some((agentId) => agentId !== teacherRoom.agent_id)) {
        throw new Error('teacher room can wake only its registered 望远 Agent')
      }
      if (!teacherRoom && await containsManagedTeacherAgent(db, {
        companyId: binding.company_id,
        agentIds: recipients,
      })) throw new Error('望远 can only be invoked from its registered teacher room')
      let knowledgeSourceId: string | undefined
      let deferAgentWake = false
      if (input.payload.kind === 'attachment' && !teacherRoom) {
        const attachment = record(input.payload.data)
        const mime = String(attachment.mime ?? '').toLowerCase()
        const size = Number(attachment.size ?? 0)
        const storageKey = String(attachment.key ?? '')
        const conversation = await webhookConversation(db, {
          channelId: input.channelId,
          companyId: binding.company_id,
        })
        if (conversation?.kind === 'group' && conversation.projectId
          && storageKey.startsWith(`attachments/${binding.company_id}/`)
          && this.infrastructure.isKnowledgeAttachment(mime, size)) {
          const ingestion = await this.infrastructure.createKnowledgeJob(db, {
            companyId: binding.company_id,
            projectId: conversation.projectId,
            conversationId: input.channelId,
            clientMsgNo: input.clientMsgNo,
            createdBy: input.fromUid,
            title: String(attachment.name ?? '聊天附件'),
            mime,
            size,
            storageKey,
            ...(input.payload.replyToClientMsgNo
              ? { threadRootClientMsgNo: input.payload.replyToClientMsgNo }
              : {}),
            recipients: [],
          })
          knowledgeSourceId = ingestion.sourceId
          deferAgentWake = ingestion.deferAgentWake
        }
      }
      const queued = await this.infrastructure.enqueueAgentWakes(db, {
        eventId: input.eventId,
        companyId: binding.company_id,
        channelId: input.channelId,
        clientMsgNo: input.clientMsgNo,
        payload: input.payload,
        recipients,
        ...(knowledgeSourceId ? { knowledgeSourceId } : {}),
      })
      await completeWebhookReceipt(db, input.eventId)
      return {
        ok: true,
        recipients,
        deferAgentWake,
        agentRuntimeAvailable: true,
        queued,
        ...(knowledgeSourceId ? { knowledgeSourceId } : {}),
      }
    })
    await this.infrastructure.flushAgentWakes(input.eventId)
    return result
  }
}
