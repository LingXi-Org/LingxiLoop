import { productConversationId } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, authorizeAudienceRead } from '../../agents/tools.js'
import { queueNativeEvents } from '../../agents/native-events.js'
import { createPermissionService } from '../access/public.js'
import { DocumentsApplication } from './application.js'
import { createDocumentCollaborationApplication, readDocumentSnapshot, type DocumentImageStorage } from './collaboration-application.js'
import { agentDocumentSchemas, type DocumentChangedEvent, type DocumentUpdateEvent } from './contracts.js'

async function scope(context: ActionContext, documentId?: string) {
  const { work } = context
  const db = context.database as Queryable
  const { rows } = await db.query<{ project_id: string }>('SELECT project_id FROM conversations WHERE company_id=$1 AND id=$2 FOR SHARE', [work.tenantId,productConversationId(work)])
  const projectId = rows[0]?.project_id
  if (!projectId || !work.principalId) throw new NoEffectError('document project scope is unavailable', 'forbidden')
  const method = context.action.action.split('.')[1]
  const permission = ['list','recent','read'].includes(method) ? 'document:read' : method === 'delete' ? 'document:delete' : 'document:write'
  const permissions = createPermissionService(db, { lockDependencies: true })
  await permissions.assertCan({ actorUserId: work.principalId, companyId: work.tenantId, projectId,
    action: permission, resource: { type: documentId ? 'document' : 'project', id: documentId ?? projectId } })
  await authorizeAudienceRead(context,{ projectId, action: 'document:read', resource: { type: documentId ? 'document' : 'project', id: documentId ?? projectId } })
  if (documentId) {
    const current = await db.query<{ conversation_id: string | null }>('SELECT conversation_id FROM documents WHERE company_id=$1 AND project_id=$2 AND id=$3 FOR SHARE', [work.tenantId,projectId,documentId])
    if (!current.rows[0]) throw new NoEffectError('document is outside this project', 'not_found')
    if (current.rows[0].conversation_id) await permissions.assertCan({ actorUserId: work.principalId,
      companyId: work.tenantId, projectId, action: 'conversation:read', resource: { type: 'conversation', id: current.rows[0].conversation_id } })
    if (current.rows[0].conversation_id) await authorizeAudienceRead(context,{ projectId,action: 'conversation:read',resource: { type: 'conversation',id: current.rows[0].conversation_id } })
  }
  return { companyId: work.tenantId, projectId, userId: work.agentId }
}

export function createDocumentTools(imageStorage: DocumentImageStorage): ToolDefinition[] {
  function application(context: ActionContext) {
    const db = context.database as Queryable
    const events: Array<DocumentChangedEvent | DocumentUpdateEvent> = []
    const collaboration = createDocumentCollaborationApplication({ transaction: fn => fn(db),
      instanceId: `agent:${context.action.idempotencyKey}`, imageStorage,
      bus: { publish: async event => { if (event.type === 'doc.update') events.push(event) },
        subscribe: async () => { throw new Error('transaction editor cannot subscribe') } },
    })
    return { events, application: new DocumentsApplication(db, { publish: async event => { events.push(event) } },
      { readText: async (id, companyId) => (await readDocumentSnapshot(db, id, companyId)).body, applyEdit: collaboration.applyAgentEdit }) }
  }
  async function read(context: ActionContext, documentId: string) {
    const currentScope = await scope({ ...context, action: { ...context.action, action: 'documents.read' } }, documentId)
    const { application: app } = application(context)
    const document = await app.get(currentScope, documentId)
    const snapshot = await readDocumentSnapshot(context.database as Queryable, documentId, currentScope.companyId)
    return { ...document, ...snapshot, bodySha256: createHash('sha256').update(snapshot.body).digest('hex') }
  }
  async function writeResult(context: ActionContext, documentId: string, events: Array<DocumentChangedEvent | DocumentUpdateEvent>) {
    const document = await read(context, documentId)
    await queueNativeEvents(context, events)
    const artifact = await context.createArtifact({ path: `documents/${documentId}.md`, mime: 'text/markdown', bytes: Buffer.from(document.body),
      source: { ref: `document:${documentId}`, version: document.revision } })
    return { ok: true as const, executionState: 'succeeded' as const, artifacts: [artifact],
      value: { documentId, title: document.title, revision: document.revision, bodySha256: document.bodySha256, notification: 'queued' } }
  }
  const authorize = async (context: ActionContext, input: Record<string, unknown>) => { await scope(context, input.documentId as string | undefined) }
  const verify: ToolDefinition['verify'] = async (context, _input, value) => {
    const receipt = value as { documentId: string; title: string; revision: string; bodySha256: string }
    const document = await read(context, receipt.documentId)
    const mismatches = (['title','revision','bodySha256'] as const).filter(key => document[key] !== receipt[key])
    return { status: mismatches.length ? 'failed' : 'passed', evidence: { resource: `document:${receipt.documentId}`,
      fields: ['title','revision','bodySha256'], mismatches, revision: document.revision, bodySha256: document.bodySha256 } }
  }
  return [
    nativeTool('documents.list', agentDocumentSchemas.list, { description: 'List authorized project documents.', effect: 'read', approval: false, authorize,
      async execute(context) { const documents = await application(context).application.list(await scope(context)); for (const document of documents.slice(0,100)) await scope(context,document.id); return { ok: true, value: { documents: documents.slice(0,100), truncated: documents.length > 100 } } } }),
    nativeTool('documents.recent', agentDocumentSchemas.recent, { description: 'List recent document creations by other participants.', effect: 'read', approval: false, authorize,
      async execute(context, input) { const documents = await application(context).application.listRecentCreationsByOthers(await scope(context), input.sinceMinutes); for (const document of documents.slice(0,100)) await scope(context,document.id); return { ok: true, value: { documents: documents.slice(0,100), truncated: documents.length > 100 } } } }),
    nativeTool('documents.read', agentDocumentSchemas.read, { description: 'Read current document content, revision and content hash.', effect: 'read', approval: false, authorize,
      async execute(context, input) { const document = await read(context, input.documentId); return { ok: true, value: { ...document, body: document.body.slice(0,64_000), bodyTruncated: document.body.length > 64_000 } } } }),
    nativeTool('documents.create', agentDocumentSchemas.create, { description: 'Create a document and downloadable content snapshot.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const documentId = 'doc_' + createHash('sha256').update(context.action.idempotencyKey).digest('hex')
        const native = application(context)
        const result = await native.application.createForAgent(await scope(context), { ...input, id: documentId })
        if (result.replayed) throw new NoEffectError('document identity already exists; reconcile the original action', 'identity_conflict')
        return writeResult(context, documentId, native.events)
      } }),
    nativeTool('documents.edit', agentDocumentSchemas.edit, { description: 'Edit document content at its observed revision.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const current = await context.database.query('SELECT updated_at::text AS revision FROM documents WHERE company_id=$1 AND id=$2 FOR UPDATE', [context.work.tenantId,input.documentId])
        if (current.rows[0]?.['revision'] !== input.expectedRevision) throw new NoEffectError('document revision changed; read it again', 'resource_conflict')
        const native = application(context)
        await native.application.editForAgent(await scope(context, input.documentId), input.documentId, input.operations)
        return writeResult(context, input.documentId, native.events)
      } }),
    nativeTool('documents.rename', agentDocumentSchemas.rename, { description: 'Rename a document if its title has not changed.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const current = await context.database.query('SELECT title FROM documents WHERE company_id=$1 AND id=$2 FOR UPDATE', [context.work.tenantId,input.documentId])
        if (current.rows[0]?.['title'] !== input.expectedTitle) throw new NoEffectError('document title changed; read it again', 'resource_conflict')
        const native = application(context)
        await native.application.rename(await scope(context, input.documentId), input.documentId, input.title)
        return writeResult(context, input.documentId, native.events)
      } }),
    nativeTool('documents.delete', agentDocumentSchemas.delete, { description: 'Request approval to delete a document created by this agent.', effect: 'transaction', approval: true, authorize,
      async preview(context, input) { const document = await read(context, input.documentId); if (document.createdBy !== context.work.agentId || document.revision !== input.expectedRevision) throw new NoEffectError('document ownership or revision changed'); return { documentId: input.documentId, title: document.title, revision: document.revision, bodySha256: document.bodySha256 } },
      async execute(context, input) {
        const native = application(context)
        await native.application.deleteForAgent(await scope(context, input.documentId), input.documentId)
        await queueNativeEvents(context, native.events)
        return { ok: true, value: { documentId: input.documentId, deleted: true } }
      },
      async verify(context, input) { const currentScope = await scope(context); const exists = await application(context).application.exists(currentScope, input.documentId); return { status: exists ? 'failed' : 'passed', evidence: { resource: `document:${input.documentId}`, fields: ['deleted'], deleted: !exists } } },
    }),
  ]
}
