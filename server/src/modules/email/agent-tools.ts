import { productConversationId } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { NoEffectError, type ActionContext, type ActionResult, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource, authorizeAudienceRead } from '../../agents/tools.js'
import { createPermissionService } from '../access/public.js'
import { readAgentChannelMessages } from '../../im/public.js'
import { createNativeEmailApplications } from './facade.js'
import { agentEmailSchemas as schemas, outboundAttachmentSchema, type OutboundAttachmentInput, type AgentEmailDeliveryResult } from './contracts.js'
import { findCompletedOutboundByKey, findEmailReplyTarget } from './repository.js'
import { parseAddress } from './addressing.js'
import type { SendEmailPreview, ReplyEmailPreview } from './application.js'

const db = (context: ActionContext) => context.database as Queryable
const scope = (context: ActionContext) => ({ companyId: context.work.tenantId, userId: context.work.agentId })
const key = (context: ActionContext) => `native:${createHash('sha256').update(context.action.idempotencyKey).digest('hex')}`
const application = (context: ActionContext) => createNativeEmailApplications(db(context))
async function authorize(context: ActionContext, input: Record<string, unknown> = {}) {
  const method = context.action.action.split('.')[1]
  await authorizeAudienceRead(context,{ action: ['whoami','contacts','inbox'].includes(method) ? 'agent:read' : 'email:read',
    resource: ['whoami','contacts','inbox'].includes(method) ? { type: 'agent',id: context.work.agentId }
      : { type: 'conversation',id: typeof input.conversationId === 'string' ? input.conversationId : productConversationId(context.work) } })
  await createPermissionService(db(context), { lockDependencies: true }).assertCan({ actorUserId: context.work.principalId!, companyId: context.work.tenantId,
    action: ['send','reply'].includes(method) ? 'email:write' : ['whoami','contacts','inbox'].includes(method) ? 'agent:read' : 'email:read',
    resource: ['whoami','contacts','inbox'].includes(method) ? { type: 'agent', id: context.work.agentId }
      : { type: 'conversation', id: typeof input.conversationId === 'string' ? input.conversationId : productConversationId(context.work) } })
}
async function attachments(context: ActionContext, refs: string[]): Promise<OutboundAttachmentInput[]> {
  const messages = refs.length ? await readAgentChannelMessages({ companyId: context.work.tenantId, agentId: context.work.agentId,
    channelId: productConversationId(context.work), messageIds: refs, signal: context.signal }) : []
  const resolved = refs.map(ref => {
    const message = messages?.find(row => row.clientMsgNo === ref && row.payload.kind === 'attachment'), data = message?.payload.data
    if (typeof data?.key !== 'string' || !data.key.startsWith(`attachments/${context.work.tenantId}/`)) throw new NoEffectError('committed attachment is unavailable')
    return outboundAttachmentSchema.parse({ key: data.key, filename: data.name, mimeType: data.mime, sizeBytes: data.size })
  })
  if (resolved.reduce((sum, item) => sum + item.sizeBytes, 0) > 25 * 1024 * 1024) throw new NoEffectError('email attachments exceed 25 MiB')
  return resolved
}
function delivered(value: AgentEmailDeliveryResult): ActionResult {
  return value.transportStatus === 'sent' ? { ok: true, value }
    : { ok: false, executionState: 'unknown', code: 'email_delivery_unconfirmed', error: 'Email delivery was not confirmed; inspect the native delivery record before retrying' }
}
async function reconcile(context: ActionContext): Promise<ActionResult | null> {
  const result = await findCompletedOutboundByKey(db(context), context.work.tenantId, key(context))
  return result?.transportStatus === 'sent' ? delivered({ ...result, replayed: true, ...(result.error ? { error: result.error } : { error: undefined }) }) : null
}
async function verify(context: ActionContext, input: { body: string }, value: unknown) {
  const expected = value as AgentEmailDeliveryResult
  const { rows } = await context.database.query(`SELECT body,subject,transport_status AS "transportStatus",to_addrs AS "to",cc_addrs AS "cc"
    FROM email_messages WHERE company_id=$1 AND message_id=$2 AND author_id=$3`, [context.work.tenantId,expected.messageId,context.work.agentId])
  const row = rows[0]
  if (!row) return { status: 'failed' as const, evidence: { resource: `email:${expected.messageId}`, reason: 'Native email receipt is missing' } }
  const normalize = (addresses: unknown) => (addresses as string[]).map(address => parseAddress(address)?.addr ?? address)
  return compareResource(`email:${expected.messageId}`, { body: input.body, subject: expected.subject, transportStatus: 'sent',
    to: normalize(expected.to), cc: normalize(expected.cc) }, { ...row, to: normalize(row.to), cc: normalize(row.cc) })
}

export const emailTools: ToolDefinition[] = [
  nativeTool('email.whoami', schemas.whoami, { description: 'Read this agent’s workspace email identity.', effect: 'read', approval: false, authorize,
    async execute(context) { return { ok: true, value: await application(context).agent.whoami(scope(context)) } } }),
  nativeTool('email.contacts', schemas.contacts, { description: 'Search workspace email contacts.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await application(context).agent.contacts(scope(context), input.query) } } }),
  nativeTool('email.inbox', schemas.inbox, { description: 'Read email threads authorized for the original human.', effect: 'read', approval: false, authorize,
    async execute(context, input) {
      const value = await application(context).agent.inbox(scope(context), input)
      for (const thread of value) await authorizeAudienceRead(context,{ action: 'email:read', resource: { type: 'conversation', id: thread.conversationId } })
      return { ok: true, value }
    } }),
  nativeTool('email.show', schemas.show, { description: 'Read an authorized email thread.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await application(context).agent.thread(scope(context), input.conversationId, input.limit) } } }),
  nativeTool('email.send', schemas.send, { description: 'Send email after the original human approves resolved recipients, content and attachments.',
    effect: 'uncertain', approval: true, authorize, async preview(context, input) {
      const project = await context.database.query('SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2', [productConversationId(context.work),context.work.tenantId])
      return { email: await application(context).delivery.previewSend(scope(context), input), body: input.body,
        attachments: await attachments(context, input.attachmentClientMsgNos), projectId: project.rows[0]?.project_id ?? null }
    }, async execute(context, input) {
      const preview = context.approvedPreview
      if (!preview) throw new NoEffectError('approved email preview is required')
      return delivered(await application(context).delivery.sendFromAgent(scope(context), { ...input, idempotencyKey: key(context),
        attachments: preview.attachments as OutboundAttachmentInput[] }, { autoSubmitted: 'auto-generated', reviewed: preview.email as SendEmailPreview,
        ...(typeof preview.projectId === 'string' ? { projectId: preview.projectId } : {}), nativeActionId: context.action.idempotencyKey, signal: context.signal }))
    }, reconcile, verify }),
  nativeTool('email.reply', schemas.reply, { description: 'Reply to a stable email message after approval of recipients and content.', effect: 'uncertain', approval: true,
    async authorize(context, input) {
      await authorize(context, input)
      const target = await findEmailReplyTarget(db(context), context.work.tenantId, input.messageId)
      if (target?.conversation_id !== input.conversationId || !target.members?.includes(context.work.agentId)) throw new NoEffectError('reply message is outside the authorized thread', 'forbidden')
    }, async preview(context, input) { return { email: await application(context).delivery.previewReply(scope(context), input.messageId, input),
      body: input.body, attachments: await attachments(context, input.attachmentClientMsgNos) } }, async execute(context, input) {
      const preview = context.approvedPreview
      if (!preview) throw new NoEffectError('approved email preview is required')
      return delivered(await application(context).delivery.replyFromAgent(scope(context), input.messageId, { body: input.body, cc: input.cc,
        idempotencyKey: key(context), attachments: preview.attachments as OutboundAttachmentInput[] },
      { autoSubmitted: 'auto-replied', reviewed: preview.email as ReplyEmailPreview, nativeActionId: context.action.idempotencyKey, signal: context.signal }))
    }, reconcile, verify }),
]
