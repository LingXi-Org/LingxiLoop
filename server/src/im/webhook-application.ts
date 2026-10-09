import { attachmentMetadata, assertOwnedMessageAttachments } from './attachments.js'
import { createHash } from 'node:crypto'
import { assertUiInteractionAdmission } from './interactive-ui-admission.js'
import { nativeText, nativeData, nativeAttachments, userMessageSchema, type NativeMessage } from './message-types.js'
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
  attachmentId: string
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
    payload: NativeMessage; recipients: string[]; knowledgeSourceIds?: string[]
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
  payload: NativeMessage
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
      const custom = input.payload.metadata.custom
      const binding = await webhookBinding(db, input.channelId)
      if (!binding) throw Object.assign(new Error('WuKong channel is not bound yet; retry webhook'), { status: 503 })
      const profileMembers = Array.isArray(binding.profile.members) ? binding.profile.members.map(String) : []
      const members = await webhookMembers(db, { companyId: binding.company_id, memberIds: profileMembers })
      const calendarDispatch = input.fromUid === 'calendar' && input.payload.role === 'system'
        && typeof custom.calendarEventId === 'string'
        && typeof custom.scheduledFor === 'string'
      if (!members.some((member) => member.id === input.fromUid) && !calendarDispatch) {
        throw new Error('message author is not a bound channel member')
      }
      const author = members.find(member => member.id === input.fromUid)
      await assertUiInteractionAdmission({ companyId: binding.company_id, userId: input.fromUid, channelId: input.channelId,
        clientNonce: input.clientMsgNo, payload: input.payload }, db)
      if (author?.kind === 'human' && !userMessageSchema.safeParse(input.payload).success) {
        // Human-labelled product notices must have passed the server's acceptance boundary.
        const accepted = await db.query(`SELECT 1 FROM im_send_acceptances WHERE company_id=$1 AND user_id=$2
          AND channel_id=$3 AND client_nonce=$4 AND payload=$5::jsonb`,
        [binding.company_id,input.fromUid,input.channelId,input.clientMsgNo,JSON.stringify(input.payload)])
        if (!accepted.rows.length) throw Object.assign(new Error('invalid human message'), { status: 403 })
      }
      if (custom.suppressAgentWake === true) {
        await completeWebhookReceipt(db, input.eventId)
        return { ok: true, ignored: true, reason: 'product-state update' }
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
      const refs = record(custom.refs)
      if (input.payload.role === 'user') await assertOwnedMessageAttachments(db, { companyId: binding.company_id, userId: input.fromUid, payload: input.payload })
      const parsedMentions = custom.uiInteraction ? { mentionedIds: [], mentionAll: false } : parseMentions(nativeText(input.payload), members)
      const mentionedIds = [...new Set([
        ...(Array.isArray(custom.mentionedIds) ? custom.mentionedIds.map(String) : []),
        ...parsedMentions.mentionedIds,
      ])]
      const mentionAll = !custom.uiInteraction && (custom.mentionAll === true || parsedMentions.mentionAll)
      const recipients = resolveLearningAgentRecipients({
        authorId: input.fromUid,
        channelType: Number(binding.profile.channelType ?? 2),
        members: members.map((member) => ({ id: member.id, kind: member.kind, presetKey: member.preset_key })),
        mentionedIds,
        mentionAll,
        replyAuthorId: typeof custom.replyAuthorId === 'string'
          ? custom.replyAuthorId : undefined,
        leaderAgentId: binding.leader_agent_id ?? undefined,
        handoffTargetId: nativeData(input.payload,'handoff') !== undefined && typeof refs.toAgentId === 'string'
          ? refs.toAgentId : undefined,
      })
      if (teacherRoom && recipients.some((agentId) => agentId !== teacherRoom.agent_id)) {
        throw new Error('teacher room can wake only its registered 望远 Agent')
      }
      if (!teacherRoom && await containsManagedTeacherAgent(db, {
        companyId: binding.company_id,
        agentIds: recipients,
      })) throw new Error('望远 can only be invoked from its registered teacher room')
      const knowledgeSourceIds: string[] = []
      const attachments = nativeAttachments(input.payload)
      if (attachments.length && !teacherRoom) {
        const conversation = await webhookConversation(db, { channelId: input.channelId, companyId: binding.company_id })
        if (conversation?.kind === 'group' && conversation.projectId) for (const attachment of attachments) {
          const metadata = await attachmentMetadata(attachment,binding.company_id)
          if (!this.infrastructure.isKnowledgeAttachment(metadata.mime, metadata.size)) continue
          const ingestion = await this.infrastructure.createKnowledgeJob(db, {
            companyId: binding.company_id, projectId: conversation.projectId, conversationId: input.channelId,
            clientMsgNo: input.clientMsgNo, attachmentId: attachment.id, createdBy: input.fromUid, title: metadata.name,
            mime: metadata.mime, size: metadata.size, storageKey: metadata.key,
            ...(typeof custom.replyToClientMsgNo === 'string' ? { threadRootClientMsgNo: custom.replyToClientMsgNo } : {}), recipients: [],
          })
          knowledgeSourceIds.push(ingestion.sourceId)
        }
      }
      const queued = await this.infrastructure.enqueueAgentWakes(db, {
        eventId: input.eventId,
        companyId: binding.company_id,
        channelId: input.channelId,
        clientMsgNo: input.clientMsgNo,
        payload: input.payload,
        recipients,
        knowledgeSourceIds,
      })
      await completeWebhookReceipt(db, input.eventId)
      return {
        ok: true,
        recipients,
        deferAgentWake: knowledgeSourceIds.length > 0,
        agentRuntimeAvailable: true,
        queued,
        knowledgeSourceIds,
      }
    })
    await this.infrastructure.flushAgentWakes(input.eventId)
    return result
  }
}
