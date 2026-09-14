import { productConversationId, assertFrozenAudience } from '../agent-runtime/identity.js'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { nativeTool, compareResource, authorizeAudienceRead } from '../agents/tools.js'
import { queueNativeEvents, type NativeEvent } from '../agents/native-events.js'
import { createPermissionService } from '../modules/access/public.js'
import { createMessagesApplication } from '../modules/messages/facade.js'
import { reactionsForWukongMessages } from '../modules/messages/repository.js'
import { createImMessagesApplication } from './messages-facade.js'
import { agentMessageSchemas } from './agent-contracts.js'
import type { LingxiMessageV1 } from './message-types.js'
import { appendReadReceiptAdvance } from './read-receipts-repository.js'

const identity = ({ work }: ActionContext) => ({ companyId: work.tenantId, userId: work.agentId, channelId: productConversationId(work) })
const application = (context: ActionContext) => createImMessagesApplication(context.signal)
async function authorize(context: ActionContext) {
  if (context.work.conversation?.internal && ['chat.send','chat.ask'].includes(context.action.action)) throw new NoEffectError('internal delegates return results to their parent','forbidden')
  if (['chat.send','chat.ask'].includes(context.action.action)) await assertFrozenAudience(context.database as Queryable,context.work)
  await authorizeAudienceRead(context,{ action: 'conversation:read',resource: { type: 'conversation',id: productConversationId(context.work) } })
  await createPermissionService(context.database as Queryable, { lockDependencies: true }).assertCan({ actorUserId: context.work.principalId!,
    companyId: context.work.tenantId, action: ['chat.history','chat.inbox','chat.search'].includes(context.action.action) ? 'conversation:read' : 'conversation:write',
    resource: { type: 'conversation', id: productConversationId(context.work) } })
}

async function read(context: ActionContext, messageId: string) {
  const messages = await application(context).readMessages({ ...identity(context), messageIds: [messageId], signal: context.signal })
  return messages?.[0] ?? null
}

function payload(context: ActionContext, input: Record<string, unknown>): LingxiMessageV1 {
  const ask = context.action.action === 'chat.ask', clientMsgNo = `${ask ? 'questionnaire' : 'action'}-${context.action.idempotencyKey}`
  const reply = (input.replyToClientMsgNo as string | undefined) ?? context.work.threadId
  return { version: 1, kind: ask ? 'questionnaire' : 'text', clientMsgNo, body: String(ask ? input.title : input.body),
    ...(reply ? { replyToClientMsgNo: reply } : {}), refs: { runId: context.work.id, agentId: context.work.agentId },
    ...(ask ? { data: { questionnaire: { ...input, items: (input.items as Array<Record<string, unknown>>).map((item, index) => ({ ...item, name: item.name ?? `question_${index + 1}` })) } } } : {}) }
}

const communication = {
  effect: 'uncertain' as const, approval: false, authorize,
  async execute(context: ActionContext, input: Record<string, unknown>) {
    const outgoing = payload(context, input)
    const result = await application(context).acceptAgentMessage({ ...identity(context), clientNonce: outgoing.clientMsgNo, payload: outgoing,
      ...(outgoing.kind === 'text' ? { rejectVerbatimPeerBody: outgoing.body } : {}) })
    if (result.kind !== 'accepted') throw new NoEffectError(`message rejected: ${result.kind}`, result.kind)
    return { ok: true as const, value: { ...result.echo, duplicate: result.duplicate } }
  },
  async reconcile(context: ActionContext, input: Record<string, unknown>) {
    const outgoing = payload(context, input), message = await read(context, outgoing.clientMsgNo)
    if (!message || message.fromUid !== context.work.agentId) return null
    const check = compareResource(`message:${outgoing.clientMsgNo}`, { kind: outgoing.kind, body: outgoing.body }, message.payload)
    return check.status === 'passed' ? { ok: true as const, value: message } : null
  },
  async verify(context: ActionContext, input: Record<string, unknown>) {
    await authorize(context)
    const outgoing = payload(context, input), message = await read(context, outgoing.clientMsgNo)
    return compareResource(`message:${outgoing.clientMsgNo}`, { fromUid: context.work.agentId, kind: outgoing.kind, body: outgoing.body,
      ...(outgoing.data?.questionnaire ? { questionnaire: outgoing.data.questionnaire } : {}) },
    { fromUid: message?.fromUid, kind: message?.payload.kind, body: message?.payload.body, questionnaire: message?.payload.data?.questionnaire })
  },
}

export const messageTools: ToolDefinition[] = [
  nativeTool('chat.send', agentMessageSchemas.send, { ...communication, description: 'Send an original message in this conversation.' }),
  nativeTool('chat.ask', agentMessageSchemas.ask, { ...communication, description: 'Send an interactive questionnaire with unique questions and choices.' }),
  nativeTool('chat.history', agentMessageSchemas.history, { description: 'Read a bounded page of messages and advance the agent’s read receipt.', effect: 'transaction', approval: false, authorize,
    async execute(context, input) {
      const messages = await application(context).history({ ...identity(context), ...input })
      if (!messages) throw new NoEffectError('conversation is unavailable', 'not_found')
      const readThroughSeq = Math.max(0, ...messages.map(message => message.messageSeq))
      const advance = await appendReadReceiptAdvance(context.database as Queryable, { ...identity(context), readerId: context.work.agentId, readThroughSeq })
      if (advance) await queueNativeEvents(context, [{ type: 'im.read_receipt', advance }])
      return { ok: true, value: { messages, readThroughSeq } }
    },
    async verify(context, _input, value) {
      await authorize(context)
      const { rows } = await context.database.query('SELECT COALESCE(MAX(read_through_seq),0)::text AS sequence FROM im_read_receipt_advances WHERE company_id=$1 AND channel_id=$2 AND reader_id=$3',
        [context.work.tenantId,productConversationId(context.work),context.work.agentId])
      const reached = Number(rows[0]?.sequence) >= Number((value as { readThroughSeq: number }).readThroughSeq)
      return compareResource(`read:${productConversationId(context.work)}:${context.work.agentId}`, { reached: true }, { reached })
    } }),
  nativeTool('chat.inbox', agentMessageSchemas.inbox, { description: 'Read recent unread messages from authorized conversations.', effect: 'read', approval: false, authorize,
    async execute(context, input) {
      const items = await application(context).inbox({ ...identity(context), ...input })
      for (const item of items) await authorizeAudienceRead(context,{ action: 'conversation:read', resource: { type: 'conversation', id: item.channelId } })
      return { ok: true, value: items }
    } }),
  nativeTool('chat.search', agentMessageSchemas.search, { description: 'Search authoritative messages in this conversation.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await application(context).search({ ...identity(context), ...input }) } } }),
  nativeTool('chat.ack', agentMessageSchemas.ack, { description: 'Clear the agent’s unread count for this conversation.', effect: 'idempotent', approval: false, authorize,
    async execute(context) {
      if (!await application(context).clearChannelUnread(identity(context))) throw new NoEffectError('conversation is unavailable', 'not_found')
      return { ok: true, value: { cleared: true } }
    },
    async verify(context) { await authorize(context); const inbox = await application(context).inbox({ ...identity(context), limit: 50 });
      return compareResource(`unread:${productConversationId(context.work)}`, { cleared: true }, { cleared: !inbox.some(item => item.channelId === productConversationId(context.work)) }) } }),
  nativeTool('chat.react', agentMessageSchemas.react, { description: 'Toggle this agent’s reaction on a committed message.', effect: 'transaction', approval: false, authorize,
    async execute(context, input) {
      const message = await read(context, input.messageId)
      if (!message) throw new NoEffectError('message is unavailable', 'not_found')
      const db = context.database as Queryable, events: NativeEvent[] = []
      const result = await createMessagesApplication(db, work => work(db), async event => { events.push(event) }).toggleWukongReaction({
        ...identity(context), conversationId: productConversationId(context.work), messageId: message.messageId, messageSeq: message.messageSeq, messageAuthorId: message.fromUid, emoji: input.emoji })
      await queueNativeEvents(context, events)
      return { ok: true, value: { messageId: message.messageId, reactions: result.reactions } }
    },
    async verify(context, _input, value) {
      await authorize(context)
      const receipt = value as { messageId: string; reactions: unknown }
      const reactions = await reactionsForWukongMessages(context.database as Queryable, context.work.tenantId, productConversationId(context.work), [receipt.messageId])
      return compareResource(`reaction:${receipt.messageId}`, { reactions: receipt.reactions }, { reactions: reactions[receipt.messageId] ?? [] })
    } }),
]
