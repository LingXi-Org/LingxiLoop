import { pool } from '../../db/pool.js'
import type { Queryable } from '../../db/queryable.js'
import { withTransaction } from '../../db/transaction.js'
import { inc } from '../../metrics.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { storage } from '../../storage.js'
import {
  type AttachmentKnowledgeJobInput,
  cancelIngestionJob,
  claimIngestionJob,
  completeIngestion,
  findIngestionSource,
  findTenantSourceAssets,
  type IngestionSourceRow,
  insertAttachmentKnowledgeJob,
  type KnowledgeSourceStatus,
  listReferencedStorageKeys,
  markExternalSource,
  recordExternalRetryCommand,
  recordIngestionFailure,
  releaseDeferredWakeState,
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

export async function knowledgeEngineHealth(): Promise<void> {
  if (!openNotebookEnabled()) throw new Error('Open Notebook integration is disabled')
  if (!await openNotebookClient.health()) throw new Error('Open Notebook health check failed')
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

export async function enqueueKnowledgeSource(sourceId: string): Promise<void> {
  await withTransaction(pool, (db) => enqueueSourceJob(db, sourceId))
}

function normalizedStatus(status: string | null | undefined, source?: OpenNotebookSource): KnowledgeSourceStatus {
  if (!status && source && (source.embedded || source.full_text)) return 'ready'
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
    const bytes = await storage.readObject(source.storage_key)
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error('source exceeds 25 MB')
    return openNotebookClient.createFileSource({ notebookId, title: source.title, mime: source.mime_type ?? 'application/octet-stream', bytes })
  }
  if (source.kind === 'url') {
    if (!source.original_url) throw new Error('URL source has no URL')
    return openNotebookClient.createUrlSource({ notebookId, title: source.title, url: await validateKnowledgeUrl(source.original_url) })
  }
  if (!source.storage_key) throw new Error('text source has no storage key')
  const content = (await storage.readObject(source.storage_key)).toString('utf8')
  return openNotebookClient.createTextSource({ notebookId, title: source.title, content })
}

async function processSource(sourceId: string): Promise<'ready' | 'pending' | 'failed'> {
  const source = await findIngestionSource(pool, sourceId)
  if (!source) {
    await cancelKnowledgeSourceJob(sourceId, '资料已在摄取完成前被移除')
    return 'failed'
  }
  const notebookId = await ensureProjectNotebook(source.project_id, source.company_id)
  let external: OpenNotebookSource
  if (!source.external_source_id) {
    external = await createExternalSource(source, notebookId)
    await markExternalSource(pool, {
      sourceId,
      externalSourceId: external.id,
      externalCommandId: external.command_id ?? null,
    })
  } else {
    external = await openNotebookClient.getSource(source.external_source_id)
  }
  const upstreamStatus = external.status ?? (await openNotebookClient.getSourceStatus(external.id)).status
  const status = normalizedStatus(upstreamStatus, external)
  const error = status === 'failed'
    ? String(external.processing_info?.error ?? 'Open Notebook source processing failed').slice(0, 2_000)
    : null
  if (status === 'ready') {
    let clearStorageKey = false
    if (source.kind === 'text' && source.storage_key) {
      try {
        await storage.deleteObject(source.storage_key)
        clearStorageKey = true
      } catch (cleanupError) {
        console.error('[knowledge] staging object cleanup failed after ingestion completed', cleanupError)
      }
    }
    await withTransaction(pool, (db) => completeIngestion(db, {
      sourceId,
      status,
      stage: 'ready',
      error,
      chunkCount: external.embedded_chunks ?? 0,
      externalCommandId: external.command_id ?? null,
      clearStorageKey,
    }))
    await releaseDeferredWake(sourceId)
    inc('knowledge.source.processed', { status: 'ready' })
    return 'ready'
  }
  if (status === 'failed') {
    throw new Error(error ?? 'Open Notebook source processing failed')
  }
  await withTransaction(pool, (db) => requeueIngestion(db, {
    sourceId,
    status,
    stage: 'processing',
    error,
    chunkCount: external.embedded_chunks ?? 0,
    externalCommandId: external.command_id ?? null,
    delayMs: POLL_MS,
  }))
  return 'pending'
}

async function claimJob(workerId: string): Promise<{ sourceId: string; deadlinePassed: boolean } | null> {
  return withTransaction(pool, (db) => claimIngestionJob(db, workerId, LEASE_MS))
}

export async function runKnowledgeWorkerOnce(workerId = `open-notebook-${process.pid}`): Promise<boolean> {
  if (!openNotebookEnabled()) return false
  const job = await claimJob(workerId)
  if (!job) return false
  const startedAt = Date.now()
  if (job.deadlinePassed) await releaseDeferredWake(job.sourceId, '附件知识索引超过 10 分钟，资料仍在后台处理')
  try {
    await processSource(job.sourceId)
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)
    const failure = await withTransaction(pool, (db) => recordIngestionFailure(db, {
      sourceId: job.sourceId,
      message,
      maxAttempts: MAX_ATTEMPTS,
    }))
    if (!failure.final && failure.externalSourceId) {
      const retried = await openNotebookClient.retrySource(failure.externalSourceId)
      await recordExternalRetryCommand(pool, job.sourceId, retried.command_id ?? null)
    }
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

export async function runKnowledgeStorageGcOnce(): Promise<{ inspected: number; deleted: number }> {
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
  timer.unref?.()
  return { stop: () => clearInterval(timer) }
}

function hitExcerpt(hit: OpenNotebookSearchHit): string {
  const value = hit.matches ?? hit.content ?? ''
  return (Array.isArray(value) ? value.join('\n') : String(value)).replace(/`/g, '').trim().slice(0, 2_000)
}

export async function retrieveKnowledge(args: {
  companyId: string; conversationId: string; query: string; limit?: number
}): Promise<KnowledgeCitation[]> {
  if (!openNotebookEnabled() || !args.query.trim()) return []
  const projectId = await findKnowledgeRetrievalProject(pool, args.companyId, args.conversationId)
  if (!projectId) return []
  const sources = await listKnowledgeRetrievalSources(pool, {
    companyId: args.companyId,
    projectId,
    conversationId: args.conversationId,
  })
  if (!sources.length) return []
  const notebookId = await ensureProjectNotebook(projectId, args.companyId)
  const externalIds = sources.map((source) => source.externalSourceId)
  const excludedIds = sources.filter((source) => source.excluded).map((source) => source.externalSourceId)
  inc('knowledge.retrieval.queries')
  const searchStartedAt = Date.now()
  let hits: OpenNotebookSearchHit[]
  try {
    hits = await openNotebookClient.search({
      notebookId, sourceIds: externalIds, excludedSourceIds: excludedIds, query: args.query,
      limit: args.limit ?? 8, type: 'vector', minimumScore: Number(process.env.OPEN_NOTEBOOK_MINIMUM_SCORE ?? 0.2), includeNotes: false,
    })
  } catch (error) {
    inc('knowledge.retrieval.errors')
    throw error
  } finally {
    inc('knowledge.retrieval.latency_ms', undefined, Date.now() - searchStartedAt)
  }
  const byExternal = new Map(sources.map((source) => [source.externalSourceId, source]))
  const citations = hits.flatMap((hit, index) => {
    const externalId = String(hit.parent_id ?? hit.id ?? '')
    const source = byExternal.get(externalId)
    const excerpt = hitExcerpt(hit)
    if (!source || !excerpt) return []
    return [{
      sourceId: source.id, sourceTitle: source.title, chunkId: String(hit.id ?? `${externalId}:${index}`), excerpt,
      ...(source.originalUrl ? { sourceUrl: source.originalUrl } : {}), position: index, marker: `S${index + 1}`,
    }]
  })
  if (citations.length) inc('knowledge.retrieval.hits', undefined, citations.length)
  else inc('knowledge.retrieval.miss')
  return citations
}

/** Insert an idempotent attachment ingestion and persist the deferred Agent wake. */
export async function createAttachmentKnowledgeJob(
  db: Queryable,
  input: AttachmentKnowledgeJobInput,
): Promise<{ sourceId: string; deferAgentWake: boolean }> {
  return insertAttachmentKnowledgeJob(
    db,
    input,
    Number(process.env.OPEN_NOTEBOOK_INGESTION_WAKE_TIMEOUT_MS ?? DEFAULT_WAKE_TIMEOUT_MS),
  )
}

export async function retryKnowledgeSource(sourceId: string, companyId: string, projectId: string): Promise<void> {
  const source = await findTenantSourceAssets(pool, { sourceId, companyId, projectId })
  if (!source) throw new Error('source not found')
  if (source.externalSourceId) await openNotebookClient.retrySource(source.externalSourceId)
  await withTransaction(pool, async (db) => {
    await resetIngestionAttempts(db, sourceId)
    await enqueueSourceJob(db, sourceId)
  })
}

export async function deleteKnowledgeSource(sourceId: string, companyId: string, projectId: string): Promise<void> {
  const source = await findTenantSourceAssets(pool, { sourceId, companyId, projectId })
  if (!source) throw new Error('source not found')
  if (source.externalSourceId) await openNotebookClient.deleteSource(source.externalSourceId)
  const wakeStatus = await withTransaction(pool, async (db) => {
    if (!await softDeleteTenantSource(db, { sourceId, companyId, projectId })) throw new Error('source not found')
    await cancelIngestionJob(db, sourceId, '资料已在摄取完成前被删除')
    return releaseDeferredWakeState(db, sourceId, '资料已在摄取完成前被删除')
  })
  if (wakeStatus !== 'none') inc('knowledge.attachment.agent_wake', { status: wakeStatus })
  if (source.storageKey) await storage.deleteObject(source.storageKey)
}

export async function getKnowledgeSourceText(sourceId: string, companyId: string, projectId: string): Promise<string | null> {
  const source = await findTenantSourceAssets(pool, { sourceId, companyId, projectId })
  if (!source?.externalSourceId) return null
  return (await openNotebookClient.getSource(source.externalSourceId)).full_text ?? null
}
