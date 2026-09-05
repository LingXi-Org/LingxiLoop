import { createHash, randomUUID } from 'node:crypto'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import { parseMentions } from '../mentions.js'
import { resolveLearningAgentRecipients } from './routing.js'
import {
  completeWebhookReceipt,
  containsManagedTeacherAgent,
  enqueueWebhookWork,
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
  emitQueued(input: { companyId: string; channelId: string; channelType: number; agentId: string; workId: string }): Promise<void>
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
    const outcome = await this.infrastructure.transaction(async (db) => {
      const receipt = await lockWebhookReceipt(db, {
        eventId: input.eventId,
        eventType: input.eventType,
        payloadHash,
      })
      if (receipt.payloadHash !== payloadHash) {
        throw Object.assign(new Error('event_id was reused with a different payload'), { status: 409 })
      }
      if (receipt.processed) return { response: { ok: true, duplicate: true }, queued: [] }
      if (input.eventType !== 'msg.notify' && !input.eventType.includes('message')) {
        await completeWebhookReceipt(db, input.eventId)
        return { response: { ok: true, ignored: true }, queued: [] }
      }
      if (input.payload.data?.suppressAgentWake === true) {
        await completeWebhookReceipt(db, input.eventId)
        return { response: { ok: true, ignored: true, reason: 'product-state update' }, queued: [] }
      }
      const binding = await webhookBinding(db, input.channelId)
      if (!binding) throw Object.assign(new Error('WuKong channel is not bound yet; retry webhook'), { status: 503 })
      const profileMembers = Array.isArray(binding.profile.members) ? binding.profile.members.map(String) : []
      const members = await webhookMembers(db, { companyId: binding.company_id, memberIds: profileMembers })
      if (!members.some((member) => member.id === input.fromUid)) {
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
          throw new Error('only the registered Pulse Agent may write as an Agent in this room')
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
        throw new Error('teacher room can wake only its registered Pulse Agent')
      }
      if (!teacherRoom && await containsManagedTeacherAgent(db, {
        companyId: binding.company_id,
        agentIds: recipients,
      })) throw new Error('Pulse can only be invoked from its registered teacher room')
      const wakeRecipients = recipients.map((agentId) => ({
        agentId,
        reason: input.payload.kind === 'handoff'
          ? 'handoff'
          : mentionedIds.includes(agentId) || mentionAll ? 'mention' : 'message',
      }))
      let deferAgentWake = false
      let knowledgeSourceId: string | undefined
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
            recipients: wakeRecipients,
          })
          deferAgentWake = ingestion.deferAgentWake
          knowledgeSourceId = ingestion.sourceId
        }
      }
      const queued: Array<{ workId: string; agentId: string }> = []
      for (const { agentId, reason } of deferAgentWake ? [] : wakeRecipients) {
        const workId = await enqueueWebhookWork(db, {
          workId: randomUUID(),
          companyId: binding.company_id,
          authorizationUserId: input.fromUid,
          agentId,
          channelId: input.channelId,
          threadRootClientMsgNo: input.payload.replyToClientMsgNo ?? null,
          triggerClientMsgNo: input.clientMsgNo,
          reason,
          executionRole: binding.leader_agent_id === agentId ? 'coordinator' : 'specialist',
        })
        if (workId) queued.push({ workId, agentId })
      }
      await completeWebhookReceipt(db, input.eventId)
      return {
        response: {
          ok: true,
          recipients,
          deferAgentWake,
          ...(knowledgeSourceId ? { knowledgeSourceId } : {}),
        },
        queued: queued.map((item) => ({
          ...item,
          companyId: binding.company_id,
          channelId: input.channelId,
          channelType: Number(binding.profile.channelType ?? 2),
        })),
      }
    })
    await Promise.allSettled(outcome.queued.map((item) => this.infrastructure.emitQueued(item)))
    return outcome.response
  }
}
