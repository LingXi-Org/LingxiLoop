import { createHash, } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService, knowledgeSourceCapabilities, knowledgeSourceVisibilityScope } from '../access/public.js'
import { KNOWLEDGE_ATTACHMENT_MIMES, SOURCE_FILE_EXTENSIONS, sourceFileSignatureMatches } from './policy.js'
import type {
  CreateSourceInput,
  KnowledgeScope,
  MaterialSpace,
  PresignSourceInput,
  ProjectPatch,
  UpdateSourceInput,
} from './contracts.js'
import {
  enqueueSourceJob,
  findSource,
  insertSource,
  listConversationSources,
  listProjects,
  listSources,
  markSourceStored,
  moveConversation,
  replaceSourceExclusions,
  updateProject,
  updateSourceTitle,
} from './repository.js'

export type KnowledgeErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'too_large'
  | 'upload_size_mismatch'
  | 'invalid_upload'
  | 'workspace_read_only'
  | 'unavailable'

export class KnowledgeApplicationError extends Error {
  constructor(readonly code: KnowledgeErrorCode, message: string) {
    super(message)
  }
}

export interface KnowledgeInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  notebookEnabled(): boolean
  ensureNotebook(projectId: string, companyId: string): Promise<void>
  syncNotebookMetadata(projectId: string): Promise<void>
  sourceText(sourceId: string, companyId: string, projectId: string, userId: string): Promise<string | null>
  retrySource(sourceId: string, companyId: string, projectId: string, userId: string): Promise<void>
  deleteSource(sourceId: string, companyId: string, projectId: string, userId: string): Promise<void>
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
  presignPut(key: string, contentType: string, contentLength: number): Promise<{ uploadUrl: string }>
  statObject(key: string): Promise<{ sizeBytes: number; contentType: string | null }>
  readObjectBounded(key: string, maxBytes: number): Promise<Buffer>
  publicUrl(key: string): Promise<string>
  maxSourceBytes: number
}

function normalizedContentType(value: string | null | undefined): string | null {
  const contentType = value?.split(';', 1)[0]?.trim().toLowerCase()
  return contentType || null
}

export class KnowledgeApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: KnowledgeInfrastructure) {}

  assertAvailable(): void {
    if (!this.infrastructure.notebookEnabled()) {
      throw new KnowledgeApplicationError('unavailable', 'Open Notebook knowledge engine is disabled')
    }
  }

  async projects(companyId: string, userId: string) {
    await createPermissionService(this.db).assertCan({ actorUserId: userId, action: 'project:list', companyId })
    const projects = await listProjects(this.db, companyId, userId)
    const permissions = createPermissionService(this.db)
    const visible = await Promise.all(projects.map(async (project: { id: string }) => ({
      project,
      decision: await permissions.can({ actorUserId: userId, action: 'project:read', companyId, projectId: project.id }),
    })))
    return visible.filter(({ decision }) => decision.allowed).map(({ project }) => project)
  }

  async editProject(scope: KnowledgeScope, patch: ProjectPatch) {
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId,
        action: 'project:update',
        companyId: scope.companyId,
        projectId: scope.projectId,
      })
      if (!await updateProject(db, scope.companyId, scope.projectId, patch)) {
        throw new KnowledgeApplicationError('not_found', 'not found')
      }
    })
    await this.infrastructure.syncNotebookMetadata(scope.projectId).catch(() => undefined)
    return { ok: true as const }
  }

  async openProject(companyId: string, projectId: string, userId: string) {
    const access = createPermissionService(this.db)
    const context = await access.assertCan({
      actorUserId: userId, action: 'project:read', companyId, projectId,
    })
    if (!context.project) throw new KnowledgeApplicationError('not_found', 'Project not found')
    await this.db.query(`INSERT INTO project_visits(company_id,project_id,user_id,visited_at)
      VALUES($1,$2,$3,NOW()) ON CONFLICT(company_id,project_id,user_id) DO UPDATE SET visited_at=NOW()`, [companyId,projectId,userId])
    return { ok: true as const }
  }

  async sources(scope: KnowledgeScope) {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
    })
    const sources = await listSources(this.db, scope.companyId, scope.projectId, scope.userId)
    return sources.map(source => ({ ...source, capabilities: knowledgeSourceCapabilities(context, source) }))
  }

  async materials(scope: KnowledgeScope, space: MaterialSpace) {
    const permissions = createPermissionService(this.db)
    const context = await permissions.assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
    })
    const write = await permissions.can({
      actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
    })
    const role = context.projectMembership?.role
    const canUpload = write.allowed && (space === 'public' ? role === 'TEACHER' : role === 'STUDENT')
    const sources = await listSources(this.db, scope.companyId, scope.projectId, scope.userId, space)
    return { space, capabilities: { canUpload },
      sources: sources.map(source => ({ ...source, capabilities: knowledgeSourceCapabilities(context, source) })) }
  }

  async conversationSources(scope: KnowledgeScope, conversationId: string) {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'conversation', id: conversationId },
    })
    const sources = await listConversationSources(this.db, { ...scope, conversationId })
    return sources.map(source => ({ ...source, capabilities: knowledgeSourceCapabilities(context, source) }))
  }

  async source(scope: KnowledgeScope, sourceId: string) {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    const { storageKey, ...payload } = source
    const extractedText = source.status === 'ready' && this.infrastructure.notebookEnabled()
      ? await this.infrastructure.sourceText(sourceId, scope.companyId, scope.projectId, scope.userId).catch(() => null)
      : null
    const originalFileUrl = source.kind === 'file' && source.status !== 'upload_pending' && storageKey
      ? await this.infrastructure.publicUrl(storageKey)
      : null
    return { ...payload, extractedText, originalFileUrl, capabilities: knowledgeSourceCapabilities(context, source) }
  }

  async createSource(scope: KnowledgeScope, conversationId: string | null, input: CreateSourceInput) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
    })
    const id = `ks-${createHash('sha256').update(`${scope.companyId}:${scope.projectId}:${scope.userId}:${input.idempotencyKey}`).digest('hex').slice(0, 16)}`
    const replay = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, id)
    if (replay) return { id, kind: replay.kind, title: replay.title, status: replay.status, stage: replay.stage }
    const text = input.kind === 'text' ? input.text : null
    const originalUrl = input.kind === 'url' ? input.url : null
    const size = text ? Buffer.byteLength(text, 'utf8') : 0
    if (size > this.infrastructure.maxSourceBytes) {
      throw new KnowledgeApplicationError('too_large', 'source exceeds 200 MB')
    }
    const title = input.title || (input.kind === 'url' ? input.url : '粘贴文本')
    const storageKey = text ? `knowledge-sources/${scope.companyId}/${scope.projectId}/${id}.txt` : null
    if (text && storageKey) await this.infrastructure.putObject(storageKey, Buffer.from(text, 'utf8'), 'text/plain')
    await this.infrastructure.transaction(async (db) => {
      const access = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
      })
      await insertSource(db, {
        id, ...scope, conversationId, kind: input.kind, title, mime: input.kind === 'text' ? 'text/plain' : null,
        size, storageKey, originalUrl, status: 'queued',
        visibilityScope: knowledgeSourceVisibilityScope(access),
      })
      await enqueueSourceJob(db, { sourceId: id, ...scope })
    })
    return { id, kind: input.kind, title, status: 'queued' as const, stage: 'queued' as const }
  }

  async presignSource(scope: KnowledgeScope, conversationId: string | null, input: PresignSourceInput) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
    })
    if (input.size <= 0 || input.size > this.infrastructure.maxSourceBytes) {
      throw new KnowledgeApplicationError('too_large', 'file size is outside the 200 MB limit')
    }
    const id = `ks-${createHash('sha256').update(`${scope.companyId}:${scope.projectId}:${scope.userId}:${input.idempotencyKey}`).digest('hex').slice(0, 16)}`
    const replay = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, id)
    if (replay?.storageKey) {
      if (replay.ownerUserId !== scope.userId || replay.status !== 'upload_pending'
        || replay.mimeType !== input.mime || replay.sizeBytes !== input.size || replay.title !== input.name) {
        throw new KnowledgeApplicationError('invalid_upload', 'upload key was already used; start a new upload')
      }
      const signed = await this.infrastructure.presignPut(replay.storageKey, input.mime, input.size)
      return { id, uploadUrl: signed.uploadUrl, mime: input.mime, size: input.size }
    }
    const key = `knowledge-sources/${scope.companyId}/${scope.projectId}/${id}.${SOURCE_FILE_EXTENSIONS[input.mime]}`
    const signed = await this.infrastructure.presignPut(key, input.mime, input.size)
    await this.infrastructure.transaction(async (db) => {
      const access = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
      })
      if (!access.projectMembership) throw new KnowledgeApplicationError('forbidden', 'course membership is required to upload files')
      await insertSource(db, {
        id, ...scope, conversationId, kind: 'file', title: input.name, mime: input.mime,
        size: input.size, storageKey: key, originalUrl: null, status: 'upload_pending',
        visibilityScope: knowledgeSourceVisibilityScope(access),
      })
    })
    return { id, uploadUrl: signed.uploadUrl, mime: input.mime, size: input.size }
  }

  async completeUpload(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'knowledge_source', id: sourceId },
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, sourceId)
    if (!source || !source.storageKey || source.kind !== 'file') {
      throw new KnowledgeApplicationError('not_found', 'pending source upload not found')
    }
    if (source.status !== 'upload_pending') return { ok: true as const, id: sourceId, status: source.status }
    const metadata = await this.infrastructure.statObject(source.storageKey)
    const declaredContentType = typeof source.mimeType === 'string' ? source.mimeType : null
    if (metadata.sizeBytes !== source.sizeBytes
      || metadata.sizeBytes > this.infrastructure.maxSourceBytes
      || normalizedContentType(metadata.contentType) !== normalizedContentType(declaredContentType)) {
      throw new KnowledgeApplicationError('upload_size_mismatch', 'uploaded object metadata does not match the declaration')
    }
    const bytes = await this.infrastructure.readObjectBounded(source.storageKey, this.infrastructure.maxSourceBytes)
    if (bytes.byteLength !== source.sizeBytes || !sourceFileSignatureMatches(declaredContentType ?? '', bytes)) {
      throw new KnowledgeApplicationError('invalid_upload', 'uploaded file content does not match its declared format or size')
    }
    const canIndex = this.infrastructure.notebookEnabled() && KNOWLEDGE_ATTACHMENT_MIMES.has(declaredContentType ?? '')
    const status = await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
        resource: { type: 'knowledge_source', id: sourceId },
      })
      const pending = await findSource(db, scope.companyId, scope.projectId, scope.userId, sourceId)
      if (!pending || !pending.storageKey) {
        throw new KnowledgeApplicationError('not_found', 'pending source upload not found')
      }
      if (pending.status !== 'upload_pending') return pending.status
      if (canIndex) await enqueueSourceJob(db, { sourceId, ...scope })
      else await markSourceStored(db, { sourceId, ...scope })
      return canIndex ? 'queued' : 'stored'
    })
    return { ok: true as const, id: sourceId, status }
  }

  async editSource(scope: KnowledgeScope, sourceId: string, input: UpdateSourceInput) {
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId,
        projectId: scope.projectId, resource: { type: 'knowledge_source', id: sourceId },
      })
      if (!await updateSourceTitle(db, { sourceId, ...scope, title: input.title })) {
        throw new KnowledgeApplicationError('not_found', 'source not found')
      }
    })
    return { ok: true as const }
  }

  async retry(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'knowledge_source', id: sourceId },
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    if (source.kind === 'file' && !KNOWLEDGE_ATTACHMENT_MIMES.has(String(source.mimeType))) {
      throw new KnowledgeApplicationError('invalid_upload', 'this format only supports original-file storage')
    }
    this.assertAvailable()
    await this.infrastructure.retrySource(sourceId, scope.companyId, scope.projectId, scope.userId)
    return { ok: true as const }
  }

  async delete(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'knowledge_source', id: sourceId },
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    await this.infrastructure.deleteSource(sourceId, scope.companyId, scope.projectId, scope.userId)
    return { ok: true as const }
  }

  async selectSources(scope: KnowledgeScope, conversationId: string, excludedSourceIds: string[]) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'conversation', id: conversationId },
    })
    const accepted = await this.infrastructure.transaction((db) => replaceSourceExclusions(db, {
      ...scope, conversationId, sourceIds: [...new Set(excludedSourceIds)],
    }))
    return { ok: true as const, excludedSourceIds: accepted }
  }

  async moveConversation(args: KnowledgeScope & { conversationId: string; targetProjectId: string }) {
    await createPermissionService(this.db).assertCan({
      actorUserId: args.userId, action: 'conversation:manage', companyId: args.companyId, projectId: args.projectId,
      resource: { type: 'conversation', id: args.conversationId },
    })
    await createPermissionService(this.db).assertCan({
      actorUserId: args.userId, action: 'knowledge:write', companyId: args.companyId, projectId: args.targetProjectId,
    })
    const result = await this.infrastructure.transaction((db) => moveConversation(db, {
      companyId: args.companyId, conversationId: args.conversationId,
      userId: args.userId, projectId: args.targetProjectId,
    }))
    if (result === 'not_found') throw new KnowledgeApplicationError('not_found', 'not found')
    if (result === 'not_member') throw new KnowledgeApplicationError('forbidden', 'only members can change the project')
    return { ok: true as const, projectId: args.targetProjectId }
  }
}
