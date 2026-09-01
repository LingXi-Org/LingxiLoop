import { pool } from '../../db/pool.js'
import type { Queryable } from '../../db/queryable.js'
import { withTransaction } from '../../db/transaction.js'
import { inc } from '../../metrics.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { storage } from '../../storage.js'
import { createPermissionService, knowledgeSourceVisibilityScope } from '../access/public.js'
import {
  type AttachmentKnowledgeJobInput,
  cancelIngestionJob,
  claimIngestionJob,
  completeIngestion,
  findIngestionSource,
  findTenantSourceAssets,
  findVisibleSourceExternalId,
  type IngestionSourceRow,
  insertAttachmentKnowledgeJob,
  type KnowledgeSourceStatus,
  listDeletedSourceAssets,
  listReferencedStorageKeys,
  markDeletedSourceAssetsClean,
  markExternalSource,
  recordExternalRetryCommand,
  recordIngestionFailure,
  releaseDeferredWakeState,
  renewIngestionLease,
  requeueIngestion,
  resetIngestionAttempts,
  softDeleteTenantSource,
} from './ingestion-repository.js'
import {
  acquireNotebookLock,
  findKnowledgeProject,
  findReadyNotebookId,
  markNotebookFailed,
  markNotebookPending,
  markNotebookReady,
  releaseNotebookLock,
} from './notebook-repository.js'
import {
  MAX_SOURCE_BYTES,
  openNotebookEnabled,
  validateKnowledgeUrl,
} from './policy.js'
import {
  fuseKnowledgeSearchHits,
  OpenNotebookError,
  type OpenNotebookSearchHit,
  type OpenNotebookSource,
  openNotebookClient,
} from './provider.js'
import { enqueueSourceJob } from './repository.js'
import { findKnowledgeRetrievalProject, listKnowledgeRetrievalSources } from './retrieval-repository.js'

const LEASE_MS = 2 * 60_000
const MAX_ATTEMPTS = 5
const POLL_MS = 5_000
const DEFAULT_WAKE_TIMEOUT_MS = 10 * 60_000

interface IngestionLease {
  sourceId: string
  leaseToken: string
}

class IngestionLeaseLostError extends Error {
  constructor() {
    super('knowledge ingestion lease was lost')
    this.name = 'IngestionLeaseLostError'
  }
}

async function renewLease(lease: IngestionLease): Promise<void> {
  if (!await renewIngestionLease(pool, { ...lease, leaseMs: LEASE_MS })) {
    throw new IngestionLeaseLostError()
  }
}

async function withLeaseRenewal<T>(lease: IngestionLease, work: () => Promise<T>): Promise<T> {
  await renewLease(lease)
  let renewal = Promise.resolve()
  let renewalError: unknown = null
  const timer = setInterval(() => {
    renewal = renewal.then(async () => {
      try {
        await renewLease(lease)
      } catch (error) {
        renewalError ??= error
      }
    })
  }, Math.max(1_000, Math.floor(LEASE_MS / 3)))
  timer.unref?.()
  try {
    const result = await work()
    await renewal
    if (renewalError) throw renewalError
    await renewLease(lease)
    return result
  } finally {
    clearInterval(timer)
  }
}

export type { KnowledgeSourceStatus } from './ingestion-repository.js'

export interface KnowledgeCitation {
  sourceId: string
  sourceTitle: string
  chunkId: string
  excerpt: string
  sourceUrl?: string
  position: number
  marker: string
}

function requireAuthorizationUserId(authorizationUserId: string): string {
  const normalized = authorizationUserId.trim()
  if (!normalized) throw new Error('knowledge operation has no persisted human authorization principal')
  return normalized
}

export async function knowledgeEngineHealth(): Promise<void> {
  if (!openNotebookEnabled()) throw new Error('Open Notebook integration is disabled')
  if (!await openNotebookClient.ready()) throw new Error('Open Notebook readiness check failed')
}

function externalKey(projectId: string): string { return `lingxiloop:project:${projectId}` }

/** Idempotently provision the one Open Notebook notebook owned by a Project. */
export async function ensureProjectNotebook(projectId: string, companyId?: string): Promise<string> {
  if (!openNotebookEnabled()) throw new OpenNotebookError('Open Notebook integration is disabled', 503)
  const client = await pool.connect()
  try {
    await acquireNotebookLock(client, projectId)
    const existingId = await findReadyNotebookId(client, projectId)
    if (existingId) return existingId
    const project = await findKnowledgeProject(client, projectId, companyId)
    if (!project) throw new Error('workspace not found')
    await markNotebookPending(client, {
      projectId,
      companyId: project.companyId,
      externalKey: externalKey(projectId),
    })
    const found = await openNotebookClient.createNotebook({
      name: project.name,
      description: project.description?.trim() ?? '',
      externalKey: externalKey(projectId),
    })
    await markNotebookReady(client, projectId, found.id)
    inc('knowledge.notebook.provisioned')
    return found.id
  } catch (error) {
    await markNotebookFailed(client, projectId, error instanceof Error ? error.message : String(error)).catch(() => undefined)
    inc('knowledge.notebook.provision_failed')
    throw error
  } finally {
    await releaseNotebookLock(client, projectId).catch(() => undefined)
    client.release()
  }
}

export async function syncProjectNotebookMetadata(projectId: string): Promise<void> {
  if (!openNotebookEnabled()) return
  const project = await findKnowledgeProject(pool, projectId)
  if (!project) return
  const id = await ensureProjectNotebook(projectId, project.companyId)
  await openNotebookClient.updateNotebook(id, {
    name: project.name,
    description: project.description?.trim() ?? '',
    archived: project.status === 'ARCHIVED',
  })
}

export async function enqueueKnowledgeSource(
  sourceId: string,
  companyId: string,
  projectId: string,
  authorizationUserId: string,
): Promise<void> {
  const actorUserId = requireAuthorizationUserId(authorizationUserId)
  await createPermissionService(pool).assertCan({
    actorUserId,
    action: 'knowledge:write',
    companyId,
    projectId,
  })
  await withTransaction(pool, (db) => enqueueSourceJob(db, {
    sourceId,
    companyId,
    projectId,
    userId: actorUserId,
  }))
}

function normalizedStatus(status: string | null | undefined): KnowledgeSourceStatus {
  if (status === 'completed' || status === 'complete' || status === 'ready' || status === 'succeeded') return 'ready'
  if (status === 'failed' || status === 'error' || status === 'cancelled') return 'failed'
  if (status === 'running' || status === 'processing' || status === 'pending') return 'processing'
  return 'queued'
}

async function releaseDeferredWake(sourceId: string, failure?: string): Promise<void> {
  const status = await withTransaction(pool, (db) => releaseDeferredWakeState(db, sourceId, failure))
  if (status !== 'none') inc('knowledge.attachment.agent_wake', { status })
}

export async function cancelKnowledgeSourceJob(sourceId: string, reason: string): Promise<void> {
  const status = await withTransaction(pool, async (db) => {
    await cancelIngestionJob(db, sourceId, reason)
    return releaseDeferredWakeState(db, sourceId, reason)
  })
  if (status !== 'none') inc('knowledge.attachment.agent_wake', { status })
}

async function createExternalSource(source: IngestionSourceRow, notebookId: string): Promise<OpenNotebookSource> {
  if (source.kind === 'file') {
    if (!source.storage_key) throw new Error('file source has no storage key')
    const metadata = await storage.statObject(source.storage_key)
    if (metadata.sizeBytes !== source.size_bytes || metadata.sizeBytes > MAX_SOURCE_BYTES) {
      throw new Error('source object size no longer matches its declaration')
    }
    return openNotebookClient.createFileSource({
      notebookId,
      title: source.title,
      mime: source.mime_type ?? 'application/octet-stream',
      storageKey: source.storage_key,
      size: source.size_bytes,
      idempotencyKey: source.id,
      companyId: source.company_id,
    })
  }
  if (source.kind === 'url') {
    if (!source.original_url) throw new Error('URL source has no URL')
    return openNotebookClient.createUrlSource({
      notebookId,
      title: source.title,
      url: await validateKnowledgeUrl(source.original_url),
      idempotencyKey: source.id,
      companyId: source.company_id,
    })
  }
  if (!source.storage_key) throw new Error('text source has no storage key')
  const bytes = await storage.readObjectBounded(source.storage_key, Math.min(source.size_bytes, MAX_SOURCE_BYTES))
  if (bytes.length !== source.size_bytes) throw new Error('source object size no longer matches its declaration')
  const content = bytes.toString('utf8')
  return openNotebookClient.createTextSource({
    notebookId,
    title: source.title,
    content,
    idempotencyKey: source.id,
    companyId: source.company_id,
  })
}

async function processSource(lease: IngestionLease): Promise<'ready' | 'pending' | 'failed'> {
  const { sourceId, leaseToken } = lease
  const source = await findIngestionSource(pool, sourceId)
  if (!source) {
    await cancelKnowledgeSourceJob(sourceId, '资料已在摄取完成前被移除')
    return 'failed'
  }
  const notebookId = await withLeaseRenewal(
    lease,
    () => ensureProjectNotebook(source.project_id, source.company_id),
  )
  let external: OpenNotebookSource
  if (!source.external_source_id) {
    external = await withLeaseRenewal(lease, () => createExternalSource(source, notebookId))
    if (!await markExternalSource(pool, {
      sourceId,
      leaseToken,
      externalSourceId: external.id,
      externalCommandId: external.command_id ?? null,
    })) throw new IngestionLeaseLostError()
  } else if (source.stage === 'retrying') {
    external = await withLeaseRenewal(lease, () => openNotebookClient.retrySource(source.external_source_id!))
    if (!await recordExternalRetryCommand(pool, {
      sourceId,
      leaseToken,
      externalCommandId: external.command_id ?? null,
    })) throw new IngestionLeaseLostError()
  } else {
    external = await withLeaseRenewal(lease, () => openNotebookClient.getSource(source.external_source_id!))
  }
  const upstreamStatus = external.status ?? (
    await withLeaseRenewal(lease, () => openNotebookClient.getSourceStatus(external.id))
  ).status
  const status = normalizedStatus(upstreamStatus)
  const embeddedChunks = Number(external.embedded_chunks ?? 0)
  const error = status === 'failed'
    ? String(external.processing_info?.error ?? 'Open Notebook source processing failed').slice(0, 2_000)
    : null
  if (status === 'ready') {
    if (!Number.isInteger(embeddedChunks) || embeddedChunks < 1) {
      throw new Error('Open Notebook completed without embedded source chunks')
    }
    const clearStorageKey = source.kind === 'text' && source.storage_key !== null
    const completed = await withTransaction(pool, (db) => completeIngestion(db, {
      sourceId,
      leaseToken,
      status,
      stage: 'ready',
      error,
      chunkCount: embeddedChunks,
      externalCommandId: external.command_id ?? null,
      clearStorageKey,
    }))
    if (!completed) throw new IngestionLeaseLostError()
    if (clearStorageKey) {
      try {
        await storage.deleteObject(source.storage_key!)
      } catch (cleanupError) {
        console.error('[knowledge] staging object cleanup failed after ingestion completed', cleanupError)
      }
    }
    await releaseDeferredWake(sourceId)
    inc('knowledge.source.processed', { status: 'ready' })
    return 'ready'
  }
  if (status === 'failed') {
    throw new Error(error ?? 'Open Notebook source processing failed')
  }
  const requeued = await withTransaction(pool, (db) => requeueIngestion(db, {
    sourceId,
    leaseToken,
    status,
    stage: 'processing',
    error,
    chunkCount: external.embedded_chunks ?? 0,
    externalCommandId: external.command_id ?? null,
    delayMs: POLL_MS,
  }))
  if (!requeued) throw new IngestionLeaseLostError()
  return 'pending'
}

async function claimJob(workerId: string): Promise<{
  sourceId: string; deadlinePassed: boolean; leaseToken: string
} | null> {
  return withTransaction(pool, (db) => claimIngestionJob(db, workerId, LEASE_MS))
}

export async function runKnowledgeWorkerOnce(workerId = `open-notebook-${process.pid}`): Promise<boolean> {
  if (!openNotebookEnabled()) return false
  const job = await claimJob(workerId)
  if (!job) return false
  const startedAt = Date.now()
  if (job.deadlinePassed) await releaseDeferredWake(job.sourceId, '附件知识索引超过 10 分钟，资料仍在后台处理')
  try {
    await processSource(job)
  } catch (error) {
    if (error instanceof IngestionLeaseLostError) {
      inc('knowledge.source.processed', { status: 'lease_lost' })
      return true
    }
    const message = error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)
    const failure = await withTransaction(pool, (db) => recordIngestionFailure(db, {
      sourceId: job.sourceId,
      leaseToken: job.leaseToken,
      message,
      maxAttempts: MAX_ATTEMPTS,
    }))
    if (!failure) return true
    if (failure.final) await releaseDeferredWake(job.sourceId, message)
    inc('knowledge.source.processed', { status: failure.final ? 'failed' : 'retry' })
  } finally { inc('knowledge.source.processing_ms', undefined, Date.now() - startedAt) }
  return true
}

export function startKnowledgeWorker(): WorkerTaskHandle | null {
  if (!openNotebookEnabled()) return null
  let stopped = false
  let running = false
  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      for (let i = 0; i < 4 && await runKnowledgeWorkerOnce(); i++); // bounded drain
    } catch (error) { console.warn('[knowledge] Open Notebook worker tick failed', error) }
    finally { running = false }
  }
  const timer = setInterval(() => void tick(), 1_500)
  timer.unref?.()
  void tick()
  return { stop: () => { stopped = true; clearInterval(timer) } }
}

async function cleanupDeletedSources(): Promise<void> {
  for (const source of await listDeletedSourceAssets(pool)) {
    try {
      if (source.externalSourceId) await openNotebookClient.deleteSource(source.externalSourceId)
      if (source.storageKey) await storage.deleteObject(source.storageKey)
      await markDeletedSourceAssetsClean(pool, source.sourceId)
    } catch (error) {
      if (!(error instanceof OpenNotebookError && error.status === 404)) {
        console.warn('[knowledge] deferred source cleanup failed', error)
        continue
      }
      if (source.storageKey) await storage.deleteObject(source.storageKey)
      await markDeletedSourceAssetsClean(pool, source.sourceId)
    }
  }
}

export async function runKnowledgeStorageGcOnce(): Promise<{ inspected: number; deleted: number }> {
  await cleanupDeletedSources()
  const objects = await storage.listObjectsByPrefix('knowledge-sources/')
  const referenced = new Set(await listReferencedStorageKeys(pool))
  let deleted = 0
  for (const object of objects) {
    if (referenced.has(object.key) || Date.now() - object.lastModifiedMs < 24 * 60 * 60_000) continue
    await storage.deleteObject(object.key); deleted++
  }
  return { inspected: objects.length, deleted }
}

export function startKnowledgeStorageGc(): WorkerTaskHandle | null {
  const interval = Number(process.env.KNOWLEDGE_STORAGE_GC_INTERVAL_MS ?? 24 * 60 * 60_000)
  if (!interval) return null
  const timer = setInterval(() => void runKnowledgeStorageGcOnce().catch((error) => console.warn('[knowledge] storage GC failed', error)), interval)
  const deletedSourceTimer = setInterval(
    () => void cleanupDeletedSources().catch((error) => console.warn('[knowledge] source cleanup failed', error)),
    30_000,
  )
  timer.unref?.()
  deletedSourceTimer.unref?.()
  return { stop: () => { clearInterval(timer); clearInterval(deletedSourceTimer) } }
}

function hitExcerpt(hit: OpenNotebookSearchHit): string {
  const value = hit.matches ?? hit.content ?? ''
  return (Array.isArray(value) ? value.join('\n') : String(value)).replace(/`/g, '').trim().slice(0, 2_000)
}

export async function retrieveKnowledge(args: {
  companyId: string; conversationId: string; authorizationUserId: string; query: string; contextQuery?: string; limit?: number
}): Promise<KnowledgeCitation[]> {
  const authorizationUserId = requireAuthorizationUserId(args.authorizationUserId)
  if (!openNotebookEnabled() || !args.query.trim()) return []
  const projectId = await findKnowledgeRetrievalProject(
    pool,
    args.companyId,
    args.conversationId,
    authorizationUserId,
  )
  if (!projectId) return []
  await createPermissionService(pool).assertCan({
    actorUserId: authorizationUserId,
    action: 'knowledge:read',
    companyId: args.companyId,
    projectId,
  })
  const sources = await listKnowledgeRetrievalSources(pool, {
    companyId: args.companyId,
    projectId,
    conversationId: args.conversationId,
    authorizationUserId,
  })
  if (!sources.length) return []
  const notebookId = await ensureProjectNotebook(projectId, args.companyId)
  const externalIds = sources.filter((source) => !source.excluded).map((source) => source.externalSourceId)
  if (!externalIds.length) return []
  inc('knowledge.retrieval.queries')
  const searchStartedAt = Date.now()
  let rankedHits: OpenNotebookSearchHit[]
  try {
    const limit = Math.max(1, Math.min(8, args.limit ?? 8))
    const [textHits, vectorHits] = await Promise.all([
      openNotebookClient.search({
        notebookId, sourceIds: externalIds, query: args.query,
        limit, type: 'text', minimumScore: 0, companyId: args.companyId,
      }),
      openNotebookClient.search({
        notebookId, sourceIds: externalIds, query: args.contextQuery?.trim() || args.query,
        limit, type: 'vector', minimumScore: Number(process.env.OPEN_NOTEBOOK_MINIMUM_SCORE ?? 0.2),
        companyId: args.companyId,
      }),
    ])
    rankedHits = fuseKnowledgeSearchHits([textHits, vectorHits], limit)
  } catch (error) {
    inc('knowledge.retrieval.errors')
    throw error
  } finally {
    inc('knowledge.retrieval.latency_ms', undefined, Date.now() - searchStartedAt)
  }
  const byExternal = new Map(sources.map((source) => [source.externalSourceId, source]))
  const citations = rankedHits.flatMap((hit) => {
    const externalId = String(hit.parent_id ?? hit.id ?? '')
    const source = byExternal.get(externalId)
    const excerpt = hitExcerpt(hit)
    if (!source || !excerpt) return []
    return [{
      sourceId: source.id, sourceTitle: source.title, chunkId: String(hit.id ?? externalId), excerpt,
      ...(source.originalUrl ? { sourceUrl: source.originalUrl } : {}),
    }]
  }).slice(0, args.limit ?? 8).map((citation, index) => ({ ...citation, position: index, marker: `S${index + 1}` }))
  if (citations.length) inc('knowledge.retrieval.hits', undefined, citations.length)
  else inc('knowledge.retrieval.miss')
  return citations
}

/** Insert an idempotent attachment ingestion and persist the deferred Agent wake. */
export async function createAttachmentKnowledgeJob(
  db: Queryable,
  input: AttachmentKnowledgeJobInput,
): Promise<{ sourceId: string; deferAgentWake: boolean }> {
  const access = await createPermissionService(db, { lockDependencies: true }).assertCan({
    actorUserId: input.createdBy,
    action: 'knowledge:write',
    companyId: input.companyId,
    projectId: input.projectId,
  })
  return insertAttachmentKnowledgeJob(
    db,
    { ...input, visibilityScope: knowledgeSourceVisibilityScope(access) },
    Number(process.env.OPEN_NOTEBOOK_INGESTION_WAKE_TIMEOUT_MS ?? DEFAULT_WAKE_TIMEOUT_MS),
  )
}

export async function retryKnowledgeSource(
  sourceId: string,
  companyId: string,
  projectId: string,
  authorizationUserId: string,
): Promise<void> {
  const actorUserId = requireAuthorizationUserId(authorizationUserId)
  await createPermissionService(pool).assertCan({
    actorUserId,
    action: 'knowledge:manage',
    companyId,
    projectId,
    resource: { type: 'knowledge_source', id: sourceId },
  })
  const source = await findTenantSourceAssets(pool, {
    sourceId,
    companyId,
    projectId,
    userId: actorUserId,
  })
  if (!source) throw new Error('source not found')
  if (source.externalSourceId) await openNotebookClient.retrySource(source.externalSourceId)
  await withTransaction(pool, async (db) => {
    await resetIngestionAttempts(db, sourceId)
    await enqueueSourceJob(db, { sourceId, companyId, projectId, userId: actorUserId })
  })
}

export async function deleteKnowledgeSource(
  sourceId: string,
  companyId: string,
  projectId: string,
  authorizationUserId: string,
): Promise<void> {
  const actorUserId = requireAuthorizationUserId(authorizationUserId)
  await createPermissionService(pool).assertCan({
    actorUserId,
    action: 'knowledge:manage',
    companyId,
    projectId,
    resource: { type: 'knowledge_source', id: sourceId },
  })
  const source = await findTenantSourceAssets(pool, {
    sourceId,
    companyId,
    projectId,
    userId: actorUserId,
  })
  if (!source) throw new Error('source not found')
  const wakeStatus = await withTransaction(pool, async (db) => {
    if (!await softDeleteTenantSource(db, {
      sourceId,
      companyId,
      projectId,
      userId: actorUserId,
    })) {
      throw new Error('source not found')
    }
    await cancelIngestionJob(db, sourceId, '资料已在摄取完成前被删除')
    return releaseDeferredWakeState(db, sourceId, '资料已在摄取完成前被删除')
  })
  if (wakeStatus !== 'none') inc('knowledge.attachment.agent_wake', { status: wakeStatus })
  try {
    if (source.externalSourceId) await openNotebookClient.deleteSource(source.externalSourceId)
    if (source.storageKey) await storage.deleteObject(source.storageKey)
    await markDeletedSourceAssetsClean(pool, sourceId)
  } catch (error) {
    if (error instanceof OpenNotebookError && error.status === 404) {
      if (source.storageKey) await storage.deleteObject(source.storageKey)
      await markDeletedSourceAssetsClean(pool, sourceId)
    } else {
      console.warn('[knowledge] source deletion deferred until cleanup', error)
    }
  }
}

export async function getKnowledgeSourceText(
  sourceId: string,
  companyId: string,
  projectId: string,
  authorizationUserId: string,
): Promise<string | null> {
  const actorUserId = requireAuthorizationUserId(authorizationUserId)
  await createPermissionService(pool).assertCan({
    actorUserId,
    action: 'knowledge:read',
    companyId,
    projectId,
  })
  const externalSourceId = await findVisibleSourceExternalId(pool, {
    sourceId,
    companyId,
    projectId,
    userId: actorUserId,
  })
  if (!externalSourceId) return null
  return (await openNotebookClient.getSource(externalSourceId)).full_text ?? null
}
