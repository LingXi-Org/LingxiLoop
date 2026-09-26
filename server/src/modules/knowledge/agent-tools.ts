import { productConversationId } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { storage } from '../../storage.js'
import { nativeTool, nativeContext, compareResource, authorizeAudienceRead, audienceHumanIds } from '../../agents/tools.js'
import { readAgentChannelMessages } from '../../im/public.js'
import { createPermissionService } from '../access/public.js'
import { createKnowledgeAgentApplication } from './agent-application.js'
import { agentKnowledgeSchemas as schemas } from './contracts.js'
import { findKnowledgeRetrievalProject } from './retrieval-repository.js'
import { getKnowledgeSourceText, retrieveKnowledgeState } from './runtime.js'
import { OpenNotebookError } from './provider.js'

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
    action: ['list_sources','check_source','search','read_source'].includes(method) ? 'knowledge:read' : ['retry_ingestion','set_source_enabled','delete_source'].includes(method) ? 'knowledge:manage' : 'knowledge:write',
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
  nativeTool('knowledge.search', schemas.search, { description: 'Search the enabled knowledge sources visible to every reader in this conversation. Returns source excerpts; cite the runtime-assigned #cite-Sn markers and use read_source for more context.',
    effect: 'read', approval: false, authorize, async execute(context, input) {
      const retrieval = await retrieveKnowledgeState({ companyId: context.work.tenantId, conversationId: productConversationId(context.work),
        authorizationUserId: context.work.principalId!, audienceUserIds: await audienceHumanIds(context), ...input, signal: context.signal }).catch(error => {
          context.signal.throwIfAborted()
          if (!(error instanceof OpenNotebookError)) throw error
          return { status: 'unavailable' as const, citations: [] }
        })
      const hits = retrieval.citations
      const sources = await application(context).listKnowledgeSourcesForAgent(nativeContext(context)) as Array<{ id: string; version: string }>
      const versions = new Map(sources.map(source => [source.id,source.version]))
      for (const hit of hits) {
        if (!versions.has(hit.sourceId)) throw new NoEffectError('knowledge source changed during search','resource_conflict')
        await authorizeAudienceRead(context,{ action: 'knowledge:read',resource: { type: 'knowledge_source',id: hit.sourceId } })
      }
      const evidence = hits.map(hit => ({ sourceId: hit.sourceId, sourceVersion: versions.get(hit.sourceId)!,
        chunkId: hit.chunkId, title: hit.sourceTitle, excerpt: hit.excerpt, truncated: true,
        ...(hit.sourceUrl ? { url: hit.sourceUrl } : {}) }))
      return { ok: true, value: { status: retrieval.status, matches: evidence,
        ...('processingSources' in retrieval ? { processingSources: retrieval.processingSources } : {}) }, evidence }
    } }),
  nativeTool('knowledge.read_source', schemas.read_source, { description: 'Read a bounded range of an enabled source in this workspace. Returns actual text, version and nextOffset; continue reading when truncated. Metadata alone is not source content.',
    effect: 'read', approval: false, authorize, async execute(context, input) {
      const source = await read(context,input.sourceId)
      const excluded = await db(context).query(`SELECT 1 FROM conversation_source_exclusions WHERE source_id=$1
        AND conversation_id=$2 AND user_id=ANY($3::text[]) LIMIT 1`,
      [input.sourceId,productConversationId(context.work),await audienceHumanIds(context)])
      if (!source || source.enabled !== true || excluded.rows.length) throw new NoEffectError('knowledge source is unavailable or excluded','forbidden')
      if (source.status !== 'ready') return { ok: true, value: { sourceId: input.sourceId, status: source.status, textAvailable: false } }
      const projectId = await findKnowledgeRetrievalProject(db(context),context.work.tenantId,productConversationId(context.work),context.work.principalId!)
      let text: string | null
      try { text = await getKnowledgeSourceText(input.sourceId,context.work.tenantId,projectId!,context.work.principalId!) }
      catch (error) {
        if (!(error instanceof OpenNotebookError)) throw error
        return { ok: true, value: { sourceId: input.sourceId, status: 'unavailable', textAvailable: false } }
      }
      if (!text?.trim()) return { ok: true, value: { sourceId: input.sourceId, status: 'empty', textAvailable: false } }
      if (input.offset > text.length) throw new NoEffectError('source offset exceeds text length')
      const excerpt = text.slice(input.offset,input.offset+input.limit), nextOffset = input.offset + excerpt.length
      const sourceVersion = `sha256:${createHash('sha256').update(text).digest('hex')}`
      const evidence = excerpt.trim() ? [{ sourceId: input.sourceId, sourceVersion, title: String(source.title),
        chunkId: `${input.sourceId}:${input.offset}:${nextOffset}`, excerpt, truncated: input.offset > 0 || nextOffset < text.length }] : []
      return { ok: true, value: { sourceId: input.sourceId, sourceVersion, status: 'ready', text: excerpt,
        offset: input.offset, nextOffset, textLength: text.length, truncated: nextOffset < text.length }, evidence }
    } }),
  nativeTool('knowledge.list_sources', schemas.list_sources, { description: 'Read sources visible to every conversation reader in the current workspace.', effect: 'read', approval: false, authorize,
    async execute(context) {
      const sources = await application(context).listKnowledgeSourcesForAgent(nativeContext(context))
      const readers = await audienceHumanIds(context), permissions = createPermissionService(db(context), { lockDependencies: true })
      const excluded = new Set((await db(context).query<{ source_id: string }>(`SELECT source_id FROM conversation_source_exclusions
        WHERE conversation_id=$1 AND user_id=ANY($2::text[])`,[productConversationId(context.work),readers])).rows.map(row => row.source_id))
      const visible = []
      for (const source of sources) if (source && typeof source === 'object' && typeof Reflect.get(source,'id') === 'string') {
        const id = String(Reflect.get(source,'id'))
        const allowed = await Promise.all(readers.map(actorUserId => permissions.can({ actorUserId, companyId: context.work.tenantId,
          action: 'knowledge:read', resource: { type: 'knowledge_source', id } })))
        if (allowed.every(result => result.allowed)) visible.push({ ...source, enabled: Reflect.get(source,'enabled') === true && !excluded.has(id) })
      }
      return { ok: true,value: visible }
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
