import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { projectKindBelongsToCompanyType } from '../../domain/public.js'
import { createPermissionService } from '../access/public.js'
import type { CreateSourceInput, KnowledgeScope, PresignSourceInput, ProjectPatch } from './contracts.js'
import {
  enqueueSourceJob,
  findSource,
  insertPersonalLearningProject,
  insertSource,
  listConversationSources,
  listProjects,
  listSources,
  lockProjectCompanyType,
  moveConversation,
  replaceSourceExclusions,
  updateProject,
} from './repository.js'
import { recordProjectVisit } from '../briefings/public.js'

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
  sourceText(sourceId: string, companyId: string, projectId: string): Promise<string | null>
  retrySource(sourceId: string, companyId: string, projectId: string): Promise<void>
  deleteSource(sourceId: string, companyId: string, projectId: string): Promise<void>
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
  presignPut(key: string, contentType: string): Promise<{ uploadUrl: string }>
  readObject(key: string): Promise<Buffer>
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
    return listSources(this.db, scope.companyId, scope.projectId)
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
    const source = await findSource(this.db, scope.companyId, scope.projectId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    const { storageKey, ...payload } = source
    const extractedText = source.status === 'ready'
      ? await this.infrastructure.sourceText(sourceId, scope.companyId, scope.projectId)
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
    const replay = await findSource(this.db, scope.companyId, scope.projectId, id)
    if (replay) return { id, kind: replay.kind, title: replay.title, status: replay.status, stage: replay.stage }
    const text = input.kind === 'text' ? input.text : null
    const originalUrl = input.kind === 'url' ? input.url : null
    const size = text ? Buffer.byteLength(text, 'utf8') : 0
    if (size > this.infrastructure.maxSourceBytes) {
      throw new KnowledgeApplicationError('too_large', 'source exceeds 25 MB')
    }
    const title = input.title || (input.kind === 'url' ? input.url : '粘贴文本')
    const storageKey = text ? `knowledge-sources/${scope.companyId}/${scope.projectId}/${id}.txt` : null
    if (text && storageKey) await this.infrastructure.putObject(storageKey, Buffer.from(text, 'utf8'), 'text/plain')
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
      })
      await insertSource(db, {
        id, ...scope, conversationId, kind: input.kind, title, mime: input.kind === 'text' ? 'text/plain' : null,
        size, storageKey, originalUrl, status: 'queued',
      })
      await enqueueSourceJob(db, id)
    })
    return { id, kind: input.kind, title, status: 'queued' as const, stage: 'queued' as const }
  }

  async presignSource(scope: KnowledgeScope, conversationId: string | null, input: PresignSourceInput) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
    })
    if (input.size > this.infrastructure.maxSourceBytes) {
      throw new KnowledgeApplicationError('too_large', 'file size is outside the 25 MB limit')
    }
    const id = `ks-${createHash('sha256').update(`${scope.companyId}:${scope.projectId}:${scope.userId}:${input.idempotencyKey}`).digest('hex').slice(0, 16)}`
    const replay = await findSource(this.db, scope.companyId, scope.projectId, id)
    if (replay?.storageKey) {
      const signed = await this.infrastructure.presignPut(replay.storageKey, input.mime)
      return { id, uploadUrl: signed.uploadUrl, mime: input.mime, size: input.size }
    }
    const key = `knowledge-sources/${scope.companyId}/${scope.projectId}/${id}.${EXTENSIONS[input.mime]}`
    const signed = await this.infrastructure.presignPut(key, input.mime)
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId,
      })
      await insertSource(db, {
        id, ...scope, conversationId, kind: 'file', title: input.name, mime: input.mime,
        size: input.size, storageKey: key, originalUrl: null, status: 'upload_pending',
      })
    })
    return { id, uploadUrl: signed.uploadUrl, mime: input.mime, size: input.size }
  }

  async completeUpload(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'knowledge_source', id: sourceId },
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, sourceId)
    if (!source || source.status !== 'upload_pending' || !source.storageKey) {
      throw new KnowledgeApplicationError('not_found', 'pending source upload not found')
    }
    const body = await this.infrastructure.readObject(source.storageKey)
    if (body.length !== source.sizeBytes || body.length > this.infrastructure.maxSourceBytes) {
      throw new KnowledgeApplicationError('upload_size_mismatch', 'uploaded object size does not match the declaration')
    }
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
        resource: { type: 'knowledge_source', id: sourceId },
      })
      await enqueueSourceJob(db, sourceId)
    })
    return { ok: true as const, id: sourceId, status: 'queued' as const }
  }

  async retry(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'knowledge_source', id: sourceId },
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    await this.infrastructure.retrySource(sourceId, scope.companyId, scope.projectId)
    return { ok: true as const }
  }

  async delete(scope: KnowledgeScope, sourceId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
      resource: { type: 'knowledge_source', id: sourceId },
    })
    const source = await findSource(this.db, scope.companyId, scope.projectId, sourceId)
    if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
    await this.infrastructure.deleteSource(sourceId, scope.companyId, scope.projectId)
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
