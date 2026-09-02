import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { projectKindBelongsToCompanyType } from '../../domain/public.js'
import { createPermissionService, knowledgeSourceVisibilityScope } from '../access/public.js'
import { recordProjectVisit } from '../briefings/public.js'
import type {
  CreateSourceInput,
  KnowledgeScope,
  PresignSourceInput,
  ProjectPatch,
  UpdateSourceInput,
} from './contracts.js'
import {
  enqueueSourceJob,
  findCourseReviewSource,
  findSource,
  insertPersonalLearningProject,
  insertSource,
  listCourseReviewSources,
  listConversationSources,
  listProjects,
  listSources,
  lockProjectCompanyType,
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
  publicUrl(key: string): Promise<string>
  maxSourceBytes: number
}

const EXTENSIONS: Record<PresignSourceInput['mime'], string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
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

  async createPersonalLearningProject(args: {
    companyId: string; userId: string; name: string; description: string; color?: string | null
  }) {
    const id = `p-${randomUUID().slice(0, 10)}`
    const project = await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: args.userId,
        action: 'project:create_personal_learning',
        companyId: args.companyId,
      })
      const companyType = await lockProjectCompanyType(db, args.companyId)
      if (!companyType) throw new KnowledgeApplicationError('not_found', 'company not found')
      if (!projectKindBelongsToCompanyType('PERSONAL_LEARNING', companyType)) {
        throw new KnowledgeApplicationError('forbidden', 'Personal Learning Projects require a Personal Company')
      }
      return insertPersonalLearningProject(db, { ...args, id, color: args.color ?? null })
    })
    let knowledgeState: 'disabled' | 'ready' | 'failed' = 'disabled'
    if (this.infrastructure.notebookEnabled()) {
      try {
        await this.infrastructure.ensureNotebook(id, args.companyId)
        knowledgeState = 'ready'
      } catch {
        knowledgeState = 'failed'
      }
    }
    return {
      ...project,
      lastVisitedAt: null,
      sourceCount: 0,
      conversationCount: 0,
      documentCount: 0,
      calendarEventCount: 0,
      canvasCount: 0,
      canManage: true,
      knowledgeState,
    }
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
    const management = await access.can({
      actorUserId: userId, action: 'learning:manage', companyId, projectId,
    })
    await recordProjectVisit(this.db, {
      companyId, projectId, userId,
      briefingEligible: context.project.kind === 'TEACHING' && management.allowed,
    })
    return { ok: true as const }
  }

  async sources(scope: KnowledgeScope) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
    })
    return listSources(this.db, scope.companyId, scope.projectId, scope.userId)
  }

  async courseReviewSources(scope: KnowledgeScope) {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'learning:review', companyId: scope.companyId, projectId: scope.projectId,
    })
    if (context.project?.kind === 'PERSONAL_LEARNING') {
      throw new KnowledgeApplicationError('forbidden', 'course resource review requires a course')
    }
    return listCourseReviewSources(this.db, scope.companyId, scope.projectId)
  }

  async conversationSources(scope: KnowledgeScope, conversationId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'conversation', id: conversationId },
    })
    return listConversationSources(this.db, { ...scope, conversationId })
  }

  async source(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:read', companyId: scope.companyId, projectId: scope.projectId,
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    const { storageKey, ...payload } = source
    const extractedText = source.status === 'ready'
      ? await this.infrastructure.sourceText(sourceId, scope.companyId, scope.projectId, scope.userId)
      : null
    const originalFileUrl = source.kind === 'file' && storageKey
      ? await this.infrastructure.publicUrl(storageKey)
      : null
    return { ...payload, extractedText, originalFileUrl }
  }

  async courseReviewSource(scope: KnowledgeScope, sourceId: string) {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'learning:review', companyId: scope.companyId, projectId: scope.projectId,
    })
    if (context.project?.kind === 'PERSONAL_LEARNING') {
      throw new KnowledgeApplicationError('forbidden', 'course resource review requires a course')
    }
    const source = await findCourseReviewSource(this.db, scope.companyId, scope.projectId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    const { storageKey, ...payload } = source
    const extractedText = source.status === 'ready'
      ? await this.infrastructure.sourceText(sourceId, scope.companyId, scope.projectId, scope.userId)
      : null
    const originalFileUrl = source.kind === 'file' && storageKey
      ? await this.infrastructure.publicUrl(storageKey)
      : null
    return { ...payload, extractedText, originalFileUrl }
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
    if (input.size > this.infrastructure.maxSourceBytes) {
      throw new KnowledgeApplicationError('too_large', 'file size is outside the 200 MB limit')
    }
    const id = `ks-${createHash('sha256').update(`${scope.companyId}:${scope.projectId}:${scope.userId}:${input.idempotencyKey}`).digest('hex').slice(0, 16)}`
    const replay = await findSource(this.db, scope.companyId, scope.projectId, scope.userId, id)
    if (replay?.storageKey) {
      const signed = await this.infrastructure.presignPut(replay.storageKey, input.mime, input.size)
      return { id, uploadUrl: signed.uploadUrl, mime: input.mime, size: input.size }
    }
    const key = `knowledge-sources/${scope.companyId}/${scope.projectId}/${id}.${EXTENSIONS[input.mime]}`
    const signed = await this.infrastructure.presignPut(key, input.mime, input.size)
    await this.infrastructure.transaction(async (db) => {
      const access = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
      })
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
    if (!source || source.status !== 'upload_pending' || !source.storageKey) {
      throw new KnowledgeApplicationError('not_found', 'pending source upload not found')
    }
    const metadata = await this.infrastructure.statObject(source.storageKey)
    const declaredContentType = typeof source.mimeType === 'string' ? source.mimeType : null
    if (metadata.sizeBytes !== source.sizeBytes
      || metadata.sizeBytes > this.infrastructure.maxSourceBytes
      || normalizedContentType(metadata.contentType) !== normalizedContentType(declaredContentType)) {
      throw new KnowledgeApplicationError('upload_size_mismatch', 'uploaded object metadata does not match the declaration')
    }
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
        resource: { type: 'knowledge_source', id: sourceId },
      })
      const pending = await findSource(db, scope.companyId, scope.projectId, scope.userId, sourceId)
      if (!pending || pending.status !== 'upload_pending' || !pending.storageKey) {
        throw new KnowledgeApplicationError('not_found', 'pending source upload not found')
      }
      await enqueueSourceJob(db, { sourceId, ...scope })
    })
    return { ok: true as const, id: sourceId, status: 'queued' as const }
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
