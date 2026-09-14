import { productConversationId } from '../../agent-runtime/identity.js'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { storage } from '../../storage.js'
import { nativeTool, nativeContext, compareResource, authorizeAudienceRead } from '../../agents/tools.js'
import { readAgentChannelMessages } from '../../im/public.js'
import { createPermissionService } from '../access/public.js'
import { createKnowledgeAgentApplication } from './agent-application.js'
import { agentKnowledgeSchemas as schemas } from './contracts.js'
import { findKnowledgeRetrievalProject } from './retrieval-repository.js'

const db = (context: ActionContext) => context.database as Queryable
const application = (context: ActionContext) => createKnowledgeAgentApplication(db(context), {
  storage, transaction: async operation => { context.signal.throwIfAborted(); return operation(db(context)) },
})
async function authorize(context: ActionContext, input: Record<string, unknown> = {}) {
  const projectId = await findKnowledgeRetrievalProject(db(context), context.work.tenantId, productConversationId(context.work), context.work.principalId!)
  if (!projectId) throw new NoEffectError('knowledge requires an authorized workspace conversation', 'forbidden')
  await authorizeAudienceRead(context,{ projectId,action: 'knowledge:read',
    ...(typeof input.sourceId === 'string' ? { resource: { type: 'knowledge_source',id: input.sourceId } } : {}) })
  const method = context.action.action.split('.')[1]
  await createPermissionService(db(context), { lockDependencies: true }).assertCan({ actorUserId: context.work.principalId!, companyId: context.work.tenantId, projectId,
    action: ['list_sources','check_source'].includes(method) ? 'knowledge:read' : ['retry_ingestion','set_source_enabled','delete_source'].includes(method) ? 'knowledge:manage' : 'knowledge:write',
    ...(typeof input.sourceId === 'string' ? { resource: { type: 'knowledge_source', id: input.sourceId } } : {}) })
}
async function read(context: ActionContext, sourceId: string) {
  await authorizeAudienceRead(context,{ action: 'knowledge:read',resource: { type: 'knowledge_source',id: sourceId } })
  const sources = await application(context).listKnowledgeSourcesForAgent(nativeContext(context))
  return sources.find((source): source is Record<string, unknown> => !!source && typeof source === 'object' && Reflect.get(source, 'id') === sourceId)
}
async function verifyCreated(context: ActionContext, input: Record<string, unknown>, value: unknown) {
  const sourceId = String((value as { id: string }).id), actual = await read(context, sourceId)
  return compareResource(`knowledge:${sourceId}`, { id: sourceId, ...(typeof input.title === 'string' ? { title: input.title } : {}) }, actual ?? {})
}
const transaction = { effect: 'transaction' as const, approval: false, authorize }
export const knowledgeTools: ToolDefinition[] = [
  nativeTool('knowledge.list_sources', schemas.list_sources, { description: 'Read sources visible to the original human in the current workspace.', effect: 'read', approval: false, authorize,
    async execute(context) {
      const sources = await application(context).listKnowledgeSourcesForAgent(nativeContext(context))
      for (const source of sources) if (source && typeof source === 'object' && typeof Reflect.get(source,'id') === 'string') {
        await authorizeAudienceRead(context,{ action: 'knowledge:read',resource: { type: 'knowledge_source',id: String(Reflect.get(source,'id')) } })
      }
      return { ok: true,value: sources }
    } }),
  nativeTool('knowledge.check_source', schemas.check_source, { description: 'Read back selected source fields against expected values.', effect: 'read', approval: false, authorize,
    async execute(context, input) {
      const actual = await read(context, input.sourceId), check = compareResource(`knowledge:${input.sourceId}`, input.expected, actual ?? {})
      return { ok: true, value: { scope: 'knowledge_source_fields', sourceId: input.sourceId,
        status: !actual ? 'not_observed' : check.status === 'passed' ? 'pass' : 'fail', observed: check.evidence.observed,
        limitation: 'Only the requested source fields were checked; this does not verify the whole goal.' } }
    } }),
  nativeTool('knowledge.add_text', schemas.add_text, { ...transaction, description: 'Create an authorized text source and queue its native ingestion.',
    async execute(context, input) { return { ok: true, value: await application(context).addKnowledgeText(nativeContext(context), { ...input, idempotencyKey: context.action.idempotencyKey }) } }, verify: verifyCreated }),
  nativeTool('knowledge.add_url', schemas.add_url, { ...transaction, description: 'Create a public URL source and queue its native ingestion.',
    async execute(context, input) { return { ok: true, value: await application(context).addKnowledgeUrl(nativeContext(context), {
      title: input.title || input.url, url: input.url, idempotencyKey: context.action.idempotencyKey }) } }, verify: verifyCreated }),
  nativeTool('knowledge.add_file', schemas.add_file, { ...transaction, description: 'Use a committed attachment as a knowledge source.', async execute(context, input) {
    const messages = await readAgentChannelMessages({ companyId: context.work.tenantId, agentId: context.work.agentId, channelId: productConversationId(context.work),
      messageIds: [input.clientMsgNo], signal: context.signal })
    const data = messages?.find(message => message.clientMsgNo === input.clientMsgNo && message.payload.kind === 'attachment')?.payload.data
    if (!data || typeof data.key !== 'string' || !data.key.startsWith(`attachments/${context.work.tenantId}/`) || typeof data.mime !== 'string'
      || !Number.isSafeInteger(data.size) || Number(data.size) < 0) throw new NoEffectError('committed attachment is unavailable')
    return { ok: true, value: await application(context).addKnowledgeFile(nativeContext(context), { title: input.title || String(data.name ?? 'Attachment'),
      storageKey: data.key, mime: data.mime, size: Number(data.size), idempotencyKey: context.action.idempotencyKey }) }
  }, verify: verifyCreated }),
  nativeTool('knowledge.retry_ingestion', schemas.retry_ingestion, { ...transaction, description: 'Queue another native ingestion attempt.',
    async execute(context, input) { return { ok: true, value: await application(context).retryKnowledgeSourceForAgent(nativeContext(context), input.sourceId) } },
    async verify(context, input) {
      const { rows } = await context.database.query('SELECT status FROM knowledge_source_jobs WHERE source_id=$1', [input.sourceId])
      return { status: rows.length ? 'passed' as const : 'failed' as const, evidence: { resource: `knowledge:${input.sourceId}:ingestion`, observed: rows[0] ?? null } }
    } }),
  nativeTool('knowledge.set_source_enabled', schemas.set_source_enabled, { ...transaction, approval: true, description: 'Change source selection after approval of the current source version.',
    async preview(context, input) { const source = await read(context, input.sourceId); if (!source) throw new NoEffectError('source is unavailable'); return { source, enabled: input.enabled } },
    async execute(context, input) { return { ok: true, value: await application(context).setKnowledgeSourceEnabled(nativeContext(context), input.sourceId, input.enabled) } },
    async verify(context, input) { return compareResource(`knowledge:${input.sourceId}`, { enabled: input.enabled }, await read(context, input.sourceId) ?? {}) } }),
  nativeTool('knowledge.delete_source', schemas.delete_source, { ...transaction, approval: true, description: 'Delete the approved source and queue native asset cleanup.',
    async preview(context, input) { const source = await read(context, input.sourceId); if (!source) throw new NoEffectError('source is unavailable'); return { source } },
    async execute(context, input) { return { ok: true, value: await application(context).deleteKnowledgeSourceForAgent(nativeContext(context), input.sourceId) } },
    async verify(context, input) {
      const source = await read(context, input.sourceId)
      return { status: source ? 'failed' as const : 'passed' as const, evidence: { resource: `knowledge:${input.sourceId}`, fields: ['deleted'], mismatches: source ? ['deleted'] : [], observed: { deleted: !source } } }
    } }),
]
