import { productConversationId } from '../../agent-runtime/identity.js'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource } from '../../agents/tools.js'
import { queueNativeEvents, type NativeEvent } from '../../agents/native-events.js'
import { attachmentMetadata } from '../../im/attachments.js'
import { nativeAttachments } from '../../im/message-types.js'
import { missingAgentChannelMessageIds, readAgentChannelMessages } from '../../im/public.js'
import { parseAttachmentRefId, unavailableAttachmentIds } from '../../agent-runtime/attachments.js'
import { audienceHumanIds } from '../../agents/tools.js'
import { storage } from '../../storage.js'
import { createPermissionService } from '../access/public.js'
import { createArtifactApplication } from './application.js'
import { checkArtifact } from './check.js'
import { agentArtifactSchemas } from './contracts.js'
import { createArtifactExecution, type ArtifactRunRow } from './execution.js'
import { artifactKind, type ArtifactKind } from './kinds.js'
import { publishArtifactProgress } from './progress.js'
import { artifactById, conversationDesignId, conversationSlidesId, lockReportWork, type ArtifactRow } from './repository.js'
import { readArtifactReference } from './skills.js'
import { listing, putBlob, sha256, type WireEntry } from './store.js'

type Control = Parameters<typeof createArtifactExecution>[0]
const reportMethods = { submit_report: 'specialist', submit_verification: 'verifier' } as const
/** Tools that read, or only change the files and comments any member may edit. */
const READ_METHODS = new Set(['current', 'available_agents', 'read_file', 'check', 'read_reference', 'comments'])
const WORKSPACE_METHODS = new Set(['stop_workspace', 'stop_assignment', 'submit_report', 'submit_verification'])

export function createArtifactTools(kind: ArtifactKind, control: Control): ToolDefinition[] {
  const definition = artifactKind(kind)
  const method = (context: ActionContext) => context.action.action.slice(kind.length + 1)
  const conversation = (context: ActionContext) => productConversationId(context.work)

  /** The artifact this action means: an assigned run's own artifact, else the conversation's canvas or the named deck. */
  async function resolve(context: ActionContext, artifactId?: string): Promise<ArtifactRow | null> {
    const db = context.database as Queryable, { work } = context
    const bound = (await db.query<{ artifact_id: string }>(`SELECT run.artifact_id FROM artifact_agent_runs run JOIN artifacts artifact
      ON artifact.id=run.artifact_id WHERE run.work_id=$1 AND run.company_id=$2 AND artifact.kind=$3 AND ($4::text IS NULL OR run.artifact_id=$4)
      LIMIT 1`, [work.id, work.tenantId, kind, artifactId ?? null])).rows[0]?.artifact_id
    const id = bound ?? (kind === 'design'
      ? await conversationDesignId(db, work.tenantId, conversation(context))
      : await conversationSlidesId(db, work.tenantId, conversation(context), artifactId))
    if (kind === 'design' && artifactId && id && artifactId !== id) throw new NoEffectError('artifact is outside this conversation', 'forbidden')
    const artifact = id ? await artifactById(db, work.tenantId, id) : null
    return artifact && artifact.conversation_id === conversation(context) ? artifact : null
  }

  async function scope(context: ActionContext, input: { artifactId?: string }) {
    const { work } = context, db = context.database as Queryable, name = method(context)
    const write = !READ_METHODS.has(name)
    await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: work.principalId!, companyId: work.tenantId,
      action: write ? 'artifact:write' : 'conversation:read', resource: { type: 'conversation', id: conversation(context) } })
    const artifact = await resolve(context, input.artifactId)
    if (artifact && WORKSPACE_METHODS.has(name) && !['active','summarizing'].includes(artifact.status)) {
      throw new NoEffectError('Artifact workspace is no longer active', 'artifact_stopped')
    }
    const assigned = await db.query('SELECT 1 FROM artifact_agent_runs WHERE work_id=$1 AND company_id=$2 AND assignment_id IS NOT NULL', [work.id,work.tenantId])
    if (assigned.rows.length) {
      const binding = artifact && await lockReportWork(db, { workId: work.id, companyId: work.tenantId, agentId: work.agentId, artifactId: artifact.id })
      if (!binding || binding.principal_id !== work.principalId) throw new NoEffectError('Artifact assignment was replaced or revoked', 'forbidden')
    }
    const reportRole = reportMethods[name as keyof typeof reportMethods]
    if (reportRole) {
      const binding = artifact && await lockReportWork(db, { workId: work.id, companyId: work.tenantId, agentId: work.agentId, artifactId: artifact.id })
      if (!binding || binding.principal_id !== work.principalId || binding.execution_role !== reportRole) {
        throw new NoEffectError('report tool requires the current assigned role', 'forbidden')
      }
    }
    return artifact
  }

  function application(context: ActionContext) {
    const db = context.database as Queryable, events: NativeEvent[] = []
    const execution = createArtifactExecution(control)
    const api = createArtifactApplication({ db, transaction: run => run(db), withArtifactFence: (_id, run) => run(db),
      execution,
      missingChannelMessageIds: input => missingAgentChannelMessageIds({ ...input, agentId: input.actorId, signal: context.signal }),
      publishEvent: async event => { events.push(event) },
      // Agents reply to comments; only a person sends one to the agent.
      deliverComment: async () => undefined,
    })
    return { api, events, execution }
  }

  /** The conversation's canvas is created on first write; a deck must exist (slides.create). */
  async function required(context: ActionContext, input: { artifactId?: string }) {
    const artifact = await scope(context, input)
    if (artifact) return artifact
    if (kind === 'design' && !READ_METHODS.has(method(context))) {
      const snapshot = await application(context).api.ensureConversationDesign(context.work.tenantId, conversation(context), context.work.principalId!)
      return (await artifactById(context.database as Queryable, context.work.tenantId, snapshot.id))!
    }
    throw new NoEffectError(kind === 'design' ? 'this conversation has no Design canvas yet' : 'no Slides deck in this conversation; create one with slides.create', 'not_found')
  }

  const actor = (context: ActionContext) => ({ companyId: context.work.tenantId, actorId: context.work.agentId, actorKind: 'agent' as const })
  const author = (context: ActionContext) => ({ kind: 'agent' as const, name: context.work.agentId, id: context.work.agentId })
  async function result(context: ActionContext, native: ReturnType<typeof application>, value: object, artifact: ArtifactRow) {
    await queueNativeEvents(context, native.events)
    await publishArtifactProgress(context.database as Queryable,context.work.tenantId,artifact.id)
    return { ok: true as const, value: { result: value, artifactId: artifact.id } }
  }
  const authorize = async (context: ActionContext, input: Record<string, unknown>) => {
    await scope(context, { artifactId: typeof input.artifactId === 'string' ? input.artifactId : undefined })
  }

  async function publishFiles(context: ActionContext, artifact: ArtifactRow, files: Record<string, WireEntry>) {
    const native = application(context)
    const outcome = await native.api.publishArtifactFiles({ ...actor(context), artifactId: artifact.id, files })
    if (outcome.status !== 200) {
      throw new NoEffectError(outcome.body.message ?? `${outcome.body.code}: ${JSON.stringify(outcome.body.paths ?? [])}`,
        outcome.status === 409 ? 'conflict' : outcome.status === 413 ? 'too_large' : 'invalid_input')
    }
    return result(context, native, { version: outcome.body.version, seq: outcome.body.seq, shas: outcome.body.shas }, artifact)
  }

  const verify: ToolDefinition['verify'] = async (context, input, value) => {
    const receipt = value as { artifactId: string; result: Record<string, unknown> & { shas?: Record<string, string>; id?: string; thread?: { id: string; messages: unknown[] } } }
    const db = context.database as Queryable, name = method(context)
    const artifact = await artifactById(db, context.work.tenantId, receipt.artifactId)
    if (!artifact || artifact.conversation_id !== conversation(context) || artifact.kind !== kind) throw new Error('Artifact scope changed')
    if (name === 'write_files' || name === 'edit_file') {
      const files = (await listing(db, artifact.id)).files
      const expected = Object.fromEntries(Object.entries((input as { files?: Record<string, { delete?: boolean }> }).files ?? {})
        .map(([path, entry]) => [path, entry.delete ? null : receipt.result.shas?.[path] ?? null]))
      if (name === 'edit_file') expected[(input as { path: string }).path] = receipt.result.shas?.[(input as { path: string }).path] ?? null
      return compareResource(`artifact:${artifact.id}`, expected, Object.fromEntries(Object.keys(expected).map(path => [path, files[path]?.sha256 ?? null])))
    }
    if (name === 'submit_report' || name === 'submit_verification') {
      const row = (await db.query('SELECT finding FROM artifact_assignment_reports WHERE id=$1 AND artifact_id=$2', [receipt.result.id,artifact.id])).rows[0]
      return compareResource(`artifact:${receipt.result.id}`, { finding: receipt.result.finding }, row ?? {})
    }
    if (name === 'comment_reply' || name === 'comment_resolve') {
      const { doc } = await application(context).api.listComments(context.work.tenantId, artifact.id, true)
      const thread = doc.threads.find(item => item.id === receipt.result.thread?.id)
      return compareResource(`artifact_comment:${receipt.result.thread?.id}`, { messages: receipt.result.thread?.messages.length }, { messages: thread?.messages.length })
    }
    if (name === 'import_asset') {
      const row = (await db.query('SELECT id FROM artifact_blobs WHERE artifact_id=$1 AND id=$2', [artifact.id,receipt.result.id])).rows[0]
      return compareResource(`artifact_blob:${receipt.result.id}`, { id: receipt.result.id }, row ?? {})
    }
    const snapshot = await application(context).api.getArtifactSnapshot(context.work.tenantId, artifact.id)
    const expected = name === 'stop_workspace' ? { status: 'stopped' } : { id: artifact.id }
    return compareResource(`artifact:${artifact.id}`, expected, snapshot)
  }

  async function submitReport(context: ActionContext, input: Record<string, unknown>) {
    const artifact = await required(context, input), native = application(context), db = context.database as Queryable
    const role = reportMethods[method(context) as keyof typeof reportMethods]
    const { rows } = await db.query<ArtifactRunRow>(`UPDATE artifact_agent_runs SET request_version=$3
      WHERE work_id=$1 AND artifact_id=$2 AND principal_id=$4 AND execution_role=$5 RETURNING *`,
      [context.work.id,artifact.id,context.requestVersion,context.work.principalId,role])
    if (!rows[0]) throw new NoEffectError('report tool requires the current assigned role', 'forbidden')
    const { artifactId: _target, ...report } = input as Parameters<typeof native.api.submitArtifactReport>[0] & { artifactId?: string }
    return result(context, native, await native.api.submitArtifactReport({ ...report, companyId: context.work.tenantId,
      artifactId: artifact.id, workId: context.work.id, agentId: context.work.agentId, principalId: context.work.principalId!,
      requestVersion: context.requestVersion!, actionId: context.action.idempotencyKey, executionRole: rows[0].execution_role, signal: context.signal }), artifact)
  }

  const label = kind === 'design' ? 'Design canvas' : 'Slides deck'
  const tools: ToolDefinition[] = [
    nativeTool(`${kind}.current`, agentArtifactSchemas.current, { description: `Read the ${label} of this conversation: title, project files with sha256, assignments and reports.${kind === 'slides' ? ' Lists every deck this conversation made.' : ''}`, effect: 'read', approval: false, authorize,
      async execute(context, input) {
        const artifact = await scope(context, input), api = application(context).api
        const value = artifact ? await api.getArtifactSnapshot(context.work.tenantId, artifact.id) : null
        if (kind === 'design') return { ok: true, value }
        const project = (await (context.database as Queryable).query<{ project_id: string }>('SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2', [conversation(context), context.work.tenantId])).rows[0]
        const decks = project ? await api.listArtifacts({ companyId: context.work.tenantId, projectId: project.project_id, kind: 'slides',
          readerId: context.work.principalId!, conversationId: conversation(context) }) : []
        return { ok: true, value: { deck: value, decks } }
      } }),
    nativeTool(`${kind}.read_file`, agentArtifactSchemas.read_file, { description: `Read one project file of the ${label} and its sha256. Read right before you edit: people edit in the editor too.`, effect: 'read', approval: false, authorize,
      async execute(context, input) {
        const artifact = await required(context, input)
        const file = await application(context).api.readArtifactFile(context.work.tenantId, artifact.id, input.path)
        if (!file) throw new NoEffectError(`${input.path} does not exist`, 'not_found')
        return { ok: true, value: { path: file.path, sha256: file.sha256, text: file.bytes.toString('utf8') } }
      } }),
    nativeTool(`${kind}.write_files`, agentArtifactSchemas.write_files, { description: `Save whole project files of the ${label} in one all-or-nothing publish; {"delete": true} removes a file. ifMatch is the sha256 you read (null: the file must not exist).`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input)
        const files: Record<string, WireEntry> = {}
        for (const [path, entry] of Object.entries(input.files)) {
          files[path] = 'delete' in entry ? { delete: true, ...(entry.ifMatch ? { ifMatch: entry.ifMatch } : {}) }
            : { base64: Buffer.from(entry.content, 'utf8').toString('base64'), contentType: 'text/plain', ...(entry.ifMatch !== undefined ? { ifMatch: entry.ifMatch } : {}) }
        }
        return publishFiles(context, artifact, files)
      } }),
    nativeTool(`${kind}.edit_file`, agentArtifactSchemas.edit_file, { description: `Replace exact text in one project file of the ${label}, against its current content.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input)
        const file = await application(context).api.readArtifactFile(context.work.tenantId, artifact.id, input.path)
        if (!file) throw new NoEffectError(`${input.path} does not exist`, 'not_found')
        const text = file.bytes.toString('utf8'), count = text.split(input.oldString).length - 1
        if (count === 0) throw new NoEffectError(`oldString was not found in ${input.path}; read the file again`, 'invalid_input')
        if (count > 1 && !input.replaceAll) throw new NoEffectError(`oldString occurs ${count} times in ${input.path}; give more context or set replaceAll`, 'invalid_input')
        const next = input.replaceAll ? text.split(input.oldString).join(input.newString) : text.replace(input.oldString, () => input.newString)
        return publishFiles(context, artifact, { [input.path]: { base64: Buffer.from(next, 'utf8').toString('base64'), contentType: 'text/plain', ifMatch: sha256(file.bytes) } })
      } }),
    nativeTool(`${kind}.import_asset`, agentArtifactSchemas.import_asset, { description: `Store an image or font attachment (id from files.list) in the ${label}; use its /_blob/<id> url verbatim.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input), db = context.database as Queryable
        const request = await context.requestSnapshot()
        const selected = [...request.attachments, ...[...(request.inheritedRevisions ?? []), ...request.revisions].flatMap(revision => revision.attachments ?? [])]
        if (!selected.some(item => item.id === input.attachmentId)) throw new NoEffectError('attachment is not part of this request', 'not_found')
        const ref = parseAttachmentRefId(input.attachmentId)
        const denied = await unavailableAttachmentIds(db, context.work.tenantId, conversation(context), [ref], await audienceHumanIds(context))
        if (denied.size) throw new NoEffectError('attachment is unavailable', 'forbidden')
        const [message] = await readAgentChannelMessages({ companyId: context.work.tenantId, agentId: context.work.agentId,
          channelId: conversation(context), messageIds: [ref.clientMsgNo], signal: context.signal }) ?? []
        const file = message && nativeAttachments(message.payload).find(item => item.id === ref.attachmentId)
        if (!file) throw new NoEffectError('attachment is unavailable', 'not_found')
        const data = await attachmentMetadata(file, context.work.tenantId)
        if (data.size > definition.layout.maxBlobBytes) throw new NoEffectError('attachment is larger than 20 MB', 'too_large')
        const bytes = await storage.readObjectBounded(data.key, definition.layout.maxBlobBytes, context.signal)
        const stored = await putBlob(db, definition, artifact.id, bytes, data.mime)
        return result(context, application(context), stored, artifact)
      } }),
    nativeTool(`${kind}.check`, agentArtifactSchemas.check, { description: `Check the ${label}'s files with the format checker; fix what it names until problems is 0.`, effect: 'read', approval: false, authorize,
      async execute(context, input) {
        const artifact = await required(context, input)
        return { ok: true, value: await checkArtifact(context.database as Queryable, artifact, context.signal) }
      } }),
    nativeTool(`${kind}.read_reference`, agentArtifactSchemas.read_reference, { description: `Read a ${label} format reference page (artifact-type/reference/<page>).`, effect: 'read', approval: false, authorize,
      async execute(_context, input) {
        try { return { ok: true, value: { page: input.page, text: await readArtifactReference(kind, input.page) } } }
        catch (error) { throw new NoEffectError((error as Error).message, 'not_found') }
      } }),
    nativeTool(`${kind}.comments`, agentArtifactSchemas.comments, { description: `List the ${label}'s comment threads (open ones, or all).`, effect: 'read', approval: false, authorize,
      async execute(context, input) {
        const artifact = await required(context, input)
        return { ok: true, value: { threads: (await application(context).api.listComments(context.work.tenantId, artifact.id, input.all)).views } }
      } }),
    nativeTool(`${kind}.comment_reply`, agentArtifactSchemas.comment_reply, { description: `Reply on a ${label} comment thread after the change is written; resolve closes it.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input), native = application(context)
        const thread = await native.api.replyComment({ companyId: context.work.tenantId, artifactId: artifact.id, author: author(context),
          commentId: input.commentId, text: input.text, ...(input.resolve ? { resolve: true } : {}) })
        return result(context, native, { thread }, artifact)
      } }),
    nativeTool(`${kind}.comment_resolve`, agentArtifactSchemas.comment_resolve, { description: `Resolve (or reopen) a ${label} comment thread.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input), native = application(context)
        const thread = await native.api.setCommentStatus({ companyId: context.work.tenantId, artifactId: artifact.id, commentId: input.commentId, status: input.reopen ? 'open' : 'resolved' })
        return result(context, native, { thread }, artifact)
      } }),
    nativeTool(`${kind}.available_agents`, agentArtifactSchemas.available_agents, { description: `List agents in this room that can work on the ${label}.`, effect: 'read', approval: false, authorize,
      async execute(context) { return { ok: true, value: await application(context).api.listArtifactAvailableAgents(context.work.tenantId, conversation(context), kind) } } }),
    nativeTool(`${kind}.start_workspace`, agentArtifactSchemas.start_workspace, { description: `Create shared ${label} assignments. Start each contribution with an explicit @id in your final group reply.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input), native = application(context), work = context.work
        const snapshot = await native.api.startArtifactWorkspace({ title: input.title, goal: input.goal, members: input.members, artifactId: artifact.id,
          companyId: work.tenantId, initiatorAgentId: work.agentId, conversationId: conversation(context), triggerClientMsgNo: work.threadId ?? work.triggerRef,
          idempotencyKey: context.action.idempotencyKey, authorizationUserId: work.principalId! })
        return result(context, native, snapshot, artifact)
      } }),
    nativeTool(`${kind}.stop_assignment`, agentArtifactSchemas.stop_assignment, { description: `Stop a ${label} assignment and its descendants.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input), native = application(context)
        await native.api.stopArtifactAssignment({ agentId: input.agentId, companyId: context.work.tenantId, artifactId: artifact.id })
        return result(context, native, { agentId: input.agentId, status: 'cancelled' }, artifact)
      } }),
    nativeTool(`${kind}.stop_workspace`, agentArtifactSchemas.stop_workspace, { description: `Stop the ${label}'s shared workspace and its execution.`, effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) {
        const artifact = await required(context, input), native = application(context)
        await native.api.stopArtifactWorkspace({ companyId: context.work.tenantId, artifactId: artifact.id })
        return result(context, native, { status: 'stopped' }, artifact)
      } }),
    nativeTool(`${kind}.submit_report`, agentArtifactSchemas.submit_report, { description: 'Persist your assigned specialist finding backed by observed evidence versions.', effect: 'transaction', approval: false, authorize, verify, execute: submitReport }),
    nativeTool(`${kind}.submit_verification`, agentArtifactSchemas.submit_verification, { description: 'Persist an independent verification of the assigned specialist report, including disconfirming checks and a verdict.', effect: 'transaction', approval: false, authorize, verify, execute: submitReport }),
  ]
  if (kind === 'slides') tools.splice(1, 0, nativeTool('slides.create', agentArtifactSchemas.create, { description: 'Create a new Slides deck in this conversation\'s project, with its empty project/deck.json. Name it as the person would.', effect: 'transaction', approval: false, authorize, verify,
    async execute(context, input) {
      const db = context.database as Queryable, native = application(context)
      const project = (await db.query<{ project_id: string | null }>('SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2', [conversation(context), context.work.tenantId])).rows[0]
      if (!project?.project_id) throw new NoEffectError('Slides need a project conversation', 'forbidden')
      const snapshot = await native.api.createSlides({ companyId: context.work.tenantId, projectId: project.project_id, conversationId: conversation(context),
        title: input.title, actorId: context.work.principalId!, origin: 'agent_os', idempotencyKey: context.action.idempotencyKey })
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { result: snapshot, artifactId: snapshot.id } }
    } }))
  return tools
}
