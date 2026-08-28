import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { PoolClient } from 'pg'
import { pool } from '../../db/pool.js'
import { inc } from '../../metrics.js'
import { storage } from '../../storage.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import {
  openNotebookClient,
  OpenNotebookError,
  type OpenNotebookSearchHit,
  type OpenNotebookSource,
} from './provider.js'

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const LEASE_MS = 2 * 60_000
const MAX_ATTEMPTS = 5
const POLL_MS = 5_000
const DEFAULT_WAKE_TIMEOUT_MS = 10 * 60_000

export type KnowledgeSourceStatus = 'upload_pending' | 'queued' | 'processing' | 'ready' | 'failed'

export interface KnowledgeCitation {
  sourceId: string
  sourceTitle: string
  chunkId: string
  excerpt: string
  sourceUrl?: string
  position: number
  marker: string
}

type SourceRow = {
  id: string
  company_id: string
  project_id: string
  conversation_id: string | null
  kind: 'file' | 'url' | 'text'
  title: string
  mime_type: string | null
  size_bytes: number
  storage_key: string | null
  original_url: string | null
  external_source_id: string | null
  external_command_id: string | null
  status: KnowledgeSourceStatus
  stage: string
}

function blockedIp(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^::ffff:/, '')
  if (ip === '::' || ip === '::1' || ip === '0.0.0.0') return true
  if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true
  return ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')
}

async function assertPublicUrl(raw: string): Promise<URL> {
  if (raw.length > 2_048) throw new Error('URL is too long')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('invalid URL') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use http or https')
  if (url.username || url.password) throw new Error('URL credentials are not allowed')
  const host = url.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('URL host is blocked')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((entry) => blockedIp(entry.address))) throw new Error('URL resolves to a private or blocked address')
  return url
}

/** Validate URL sources before handing them to Open Notebook. */
export async function validateKnowledgeUrl(raw: string): Promise<string> {
  return (await assertPublicUrl(raw)).toString()
}

export function openNotebookEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.OPEN_NOTEBOOK_ENABLED ?? '')
}

export async function knowledgeEngineHealth(): Promise<void> {
  if (!openNotebookEnabled()) throw new Error('Open Notebook integration is disabled')
  if (!await openNotebookClient.health()) throw new Error('Open Notebook health check failed')
}

export const KNOWLEDGE_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json',
  'image/png', 'image/jpeg', 'image/webp',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm',
  'video/mp4', 'video/webm',
])

export function isKnowledgeAttachmentMime(mime: string, size = 0): boolean {
  return openNotebookEnabled() && KNOWLEDGE_ATTACHMENT_MIMES.has(mime.toLowerCase())
    && size > 0 && size <= MAX_SOURCE_BYTES
}

function externalKey(projectId: string): string { return `lingxiloop:project:${projectId}` }

/** Idempotently provision the one Open Notebook notebook owned by a Project. */
export async function ensureProjectNotebook(projectId: string, companyId?: string): Promise<string> {
  if (!openNotebookEnabled()) throw new OpenNotebookError('Open Notebook integration is disabled', 503)
  const client = await pool.connect()
  try {
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [`open-notebook:${projectId}`])
    const { rows: existing } = await client.query<{ external_notebook_id: string | null; state: string }>(
      `SELECT external_notebook_id, state FROM knowledge_notebook_bindings WHERE project_id=$1`, [projectId],
    )
    if (existing[0]?.external_notebook_id && existing[0].state === 'ready') return existing[0].external_notebook_id
    const { rows: projects } = await client.query<{ company_id: string; name: string; description: string | null; status: string }>(
      `SELECT company_id, name, description, status FROM projects WHERE id=$1 AND ($2::text IS NULL OR company_id=$2) LIMIT 1`,
      [projectId, companyId ?? null],
    )
    const project = projects[0]
    if (!project) throw new Error('workspace not found')
    await client.query(
      `INSERT INTO knowledge_notebook_bindings (project_id, company_id, external_key, state)
       VALUES ($1,$2,$3,'pending') ON CONFLICT (project_id) DO UPDATE SET state='pending', last_error=NULL, updated_at=NOW()`,
      [projectId, project.company_id, externalKey(projectId)],
    )
    const found = await openNotebookClient.createNotebook({
      name: project.name,
      description: project.description?.trim() ?? '',
      externalKey: externalKey(projectId),
    })
    await client.query(
      `UPDATE knowledge_notebook_bindings SET external_notebook_id=$2, state='ready', last_error=NULL, updated_at=NOW() WHERE project_id=$1`,
      [projectId, found.id],
    )
    inc('knowledge.notebook.provisioned')
    return found.id
  } catch (error) {
    await client.query(
      `UPDATE knowledge_notebook_bindings SET state='failed', last_error=$2, updated_at=NOW() WHERE project_id=$1`,
      [projectId, error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)],
    ).catch(() => undefined)
    inc('knowledge.notebook.provision_failed')
    throw error
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [`open-notebook:${projectId}`]).catch(() => undefined)
    client.release()
  }
}

export async function syncProjectNotebookMetadata(projectId: string): Promise<void> {
  if (!openNotebookEnabled()) return
  const { rows } = await pool.query<{ company_id: string; name: string; description: string | null; status: string }>(
    `SELECT company_id, name, description, status FROM projects WHERE id=$1`, [projectId],
  )
  if (!rows[0]) return
  const id = await ensureProjectNotebook(projectId, rows[0].company_id)
  await openNotebookClient.updateNotebook(id, {
    name: rows[0].name,
    description: rows[0].description?.trim() ?? '',
    archived: rows[0].status === 'archived',
  })
}

export async function enqueueKnowledgeSource(sourceId: string): Promise<void> {
  await pool.query(
    `INSERT INTO knowledge_source_jobs (id, source_id, status, available_at)
     VALUES ($1,$2,'queued',NOW())
     ON CONFLICT (source_id) DO UPDATE SET status='queued', available_at=NOW(), leased_until=NULL, leased_by=NULL,
       last_error=NULL, updated_at=NOW()`,
    [`ksj-${randomUUID()}`, sourceId],
  )
  await pool.query(
    `UPDATE knowledge_sources SET status='queued', stage='queued', error=NULL, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,
    [sourceId],
  )
}

function normalizedStatus(status: string | null | undefined, source?: OpenNotebookSource): KnowledgeSourceStatus {
  if (!status && source && (source.embedded || source.full_text)) return 'ready'
  if (status === 'completed' || status === 'complete' || status === 'ready' || status === 'succeeded') return 'ready'
  if (status === 'failed' || status === 'error' || status === 'cancelled') return 'failed'
  if (status === 'running' || status === 'processing' || status === 'pending') return 'processing'
  return 'queued'
}

async function getSourceRow(sourceId: string): Promise<SourceRow | null> {
  const { rows } = await pool.query<SourceRow>(
    `SELECT id, company_id, project_id, conversation_id, kind, title, mime_type, size_bytes,
            storage_key, original_url, external_source_id, external_command_id, status, stage
       FROM knowledge_sources WHERE id=$1 AND deleted_at IS NULL`, [sourceId],
  )
  return rows[0] ?? null
}

async function releaseDeferredWake(sourceId: string, failure?: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      wake_recipients: Array<{ agentId: string; reason: string }> | null
      wake_channel_id: string | null
      wake_trigger_client_msg_no: string | null
      wake_thread_root_client_msg_no: string | null
      wake_released_at: string | null
    }>(`SELECT wake_recipients, wake_channel_id, wake_trigger_client_msg_no, wake_thread_root_client_msg_no, wake_released_at
          FROM knowledge_source_jobs WHERE source_id=$1 FOR UPDATE`, [sourceId])
    const job = rows[0]
    if (!job || job.wake_released_at || !job.wake_channel_id || !job.wake_trigger_client_msg_no) {
      await client.query('COMMIT'); return
    }
    const { rows: sourceRows } = await client.query<{ company_id: string }>(`SELECT company_id FROM knowledge_sources WHERE id=$1`, [sourceId])
    for (const recipient of job.wake_recipients ?? []) {
      await client.query(
        `INSERT INTO agent_work_items
           (id, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
        [randomUUID(), sourceRows[0]?.company_id, recipient.agentId, job.wake_channel_id,
          job.wake_thread_root_client_msg_no, job.wake_trigger_client_msg_no, recipient.reason],
      )
    }
    await client.query(
      `UPDATE knowledge_source_jobs SET wake_released_at=NOW(), wake_error=$2, updated_at=NOW() WHERE source_id=$1`,
      [sourceId, failure?.slice(0, 2_000) ?? null],
    )
    await client.query('COMMIT')
    inc('knowledge.attachment.agent_wake', { status: failure ? 'degraded' : 'ready' })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

export async function cancelKnowledgeSourceJob(sourceId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE knowledge_source_jobs
        SET status=CASE WHEN status='completed' THEN status ELSE 'failed' END,
            leased_until=NULL, leased_by=NULL, last_error=$2, updated_at=NOW()
      WHERE source_id=$1`,
    [sourceId, reason.slice(0, 2_000)],
  )
  await releaseDeferredWake(sourceId, reason)
}

async function createExternalSource(source: SourceRow, notebookId: string): Promise<OpenNotebookSource> {
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
  const source = await getSourceRow(sourceId)
  if (!source) {
    await cancelKnowledgeSourceJob(sourceId, '资料已在摄取完成前被移除')
    return 'failed'
  }
  const notebookId = await ensureProjectNotebook(source.project_id, source.company_id)
  let external: OpenNotebookSource
  if (!source.external_source_id) {
    external = await createExternalSource(source, notebookId)
    await pool.query(
      `UPDATE knowledge_sources SET external_source_id=$2, external_command_id=$3, status='processing', stage='processing',
              updated_at=NOW() WHERE id=$1`,
      [sourceId, external.id, external.command_id ?? null],
    )
  } else {
    external = await openNotebookClient.getSource(source.external_source_id)
  }
  const upstreamStatus = external.status ?? (await openNotebookClient.getSourceStatus(external.id)).status
  const status = normalizedStatus(upstreamStatus, external)
  const error = status === 'failed'
    ? String(external.processing_info?.error ?? 'Open Notebook source processing failed').slice(0, 2_000)
    : null
  await pool.query(
    `UPDATE knowledge_sources SET status=$2, stage=$3, error=$4, external_chunk_count=$5,
            external_command_id=COALESCE($6, external_command_id), updated_at=NOW() WHERE id=$1`,
    [sourceId, status, status === 'ready' ? 'ready' : status === 'failed' ? 'failed' : 'processing', error,
      external.embedded_chunks ?? 0, external.command_id ?? null],
  )
  if (status === 'ready') {
    if (source.kind === 'text' && source.storage_key) {
      try {
        await storage.deleteObject(source.storage_key)
        await pool.query(`UPDATE knowledge_sources SET storage_key=NULL, updated_at=NOW() WHERE id=$1`, [sourceId])
      } catch (cleanupError) {
        console.error('[knowledge] staging object cleanup failed after ingestion completed', cleanupError)
      }
    }
    await pool.query(`UPDATE knowledge_source_jobs SET status='completed', leased_until=NULL, leased_by=NULL, updated_at=NOW() WHERE source_id=$1`, [sourceId])
    await releaseDeferredWake(sourceId)
    inc('knowledge.source.processed', { status: 'ready' })
    return 'ready'
  }
  if (status === 'failed') {
    throw new Error(error ?? 'Open Notebook source processing failed')
  }
  await pool.query(
    `UPDATE knowledge_source_jobs SET status='queued', available_at=NOW()+($2::int * INTERVAL '1 millisecond'), leased_until=NULL, leased_by=NULL, updated_at=NOW() WHERE source_id=$1`,
    [sourceId, POLL_MS],
  )
  return 'pending'
}

async function claimJob(workerId: string): Promise<{ sourceId: string; deadlinePassed: boolean } | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ source_id: string; deadline_passed: boolean }>(
      `SELECT source_id, (wake_deadline IS NOT NULL AND wake_deadline <= NOW() AND wake_released_at IS NULL) AS deadline_passed
         FROM knowledge_source_jobs
        WHERE status IN ('queued','processing') AND available_at<=NOW()
          AND (leased_until IS NULL OR leased_until<NOW())
        ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    )
    if (!rows[0]) { await client.query('COMMIT'); return null }
    await client.query(
      `UPDATE knowledge_source_jobs SET status='processing', leased_until=NOW()+($2::int * INTERVAL '1 millisecond'),
              leased_by=$3, updated_at=NOW() WHERE source_id=$1`, [rows[0].source_id, LEASE_MS, workerId],
    )
    await client.query('COMMIT')
    return { sourceId: rows[0].source_id, deadlinePassed: rows[0].deadline_passed }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error
  } finally { client.release() }
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
    const { rows } = await pool.query<{ attempts: number }>(
      `UPDATE knowledge_source_jobs SET attempts=attempts+1, last_error=$2, leased_until=NULL, leased_by=NULL, updated_at=NOW()
        WHERE source_id=$1 RETURNING attempts`, [job.sourceId, message],
    )
    const final = (rows[0]?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS
    if (!final) {
      const { rows: sources } = await pool.query<{ external_source_id: string | null }>(
        `SELECT external_source_id FROM knowledge_sources WHERE id=$1`, [job.sourceId],
      )
      if (sources[0]?.external_source_id) {
        const retried = await openNotebookClient.retrySource(sources[0].external_source_id)
        await pool.query(
          `UPDATE knowledge_sources SET external_command_id=COALESCE($2,external_command_id), updated_at=NOW() WHERE id=$1`,
          [job.sourceId, retried.command_id ?? null],
        )
      }
    }
    await pool.query(
      `UPDATE knowledge_source_jobs SET status=$2, available_at=CASE WHEN $2='queued' THEN NOW()+INTERVAL '15 seconds' ELSE available_at END WHERE source_id=$1`,
      [job.sourceId, final ? 'failed' : 'queued'],
    )
    await pool.query(
      `UPDATE knowledge_sources SET status=$2, stage=$3, error=$4, updated_at=NOW() WHERE id=$1`,
      [job.sourceId, final ? 'failed' : 'queued', final ? 'failed' : 'retrying', message],
    )
    if (final) await releaseDeferredWake(job.sourceId, message)
    inc('knowledge.source.processed', { status: final ? 'failed' : 'retry' })
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
  const { rows } = await pool.query<{ storage_key: string }>(`SELECT storage_key FROM knowledge_sources WHERE storage_key IS NOT NULL AND deleted_at IS NULL`)
  const referenced = new Set(rows.map((row) => row.storage_key))
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

export async function retrieveKnowledge(args: { conversationId: string; query: string; limit?: number }): Promise<KnowledgeCitation[]> {
  if (!openNotebookEnabled() || !args.query.trim()) return []
  const { rows: scopes } = await pool.query<{ company_id: string; project_id: string | null }>(
    `SELECT company_id, project_id FROM conversations WHERE id=$1 AND kind='group'`, [args.conversationId],
  )
  if (!scopes[0]?.project_id) return []
  const { rows: sources } = await pool.query<{ id: string; title: string; external_source_id: string; original_url: string | null; excluded: boolean }>(
    `SELECT s.id, s.title, s.external_source_id, s.original_url, (e.source_id IS NOT NULL) AS excluded
       FROM knowledge_sources s LEFT JOIN conversation_source_exclusions e
         ON e.source_id=s.id AND e.conversation_id=$1
      WHERE s.company_id=$2 AND s.project_id=$3 AND s.status='ready' AND s.deleted_at IS NULL AND s.external_source_id IS NOT NULL`,
    [args.conversationId, scopes[0].company_id, scopes[0].project_id],
  )
  if (!sources.length) return []
  const notebookId = await ensureProjectNotebook(scopes[0].project_id, scopes[0].company_id)
  const externalIds = sources.map((source) => source.external_source_id)
  const excludedIds = sources.filter((source) => source.excluded).map((source) => source.external_source_id)
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
  const byExternal = new Map(sources.map((source) => [source.external_source_id, source]))
  const citations = hits.flatMap((hit, index) => {
    const externalId = String(hit.parent_id ?? hit.id ?? '')
    const source = byExternal.get(externalId)
    const excerpt = hitExcerpt(hit)
    if (!source || !excerpt) return []
    return [{
      sourceId: source.id, sourceTitle: source.title, chunkId: String(hit.id ?? `${externalId}:${index}`), excerpt,
      ...(source.original_url ? { sourceUrl: source.original_url } : {}), position: index, marker: `S${index + 1}`,
    }]
  })
  if (citations.length) inc('knowledge.retrieval.hits', undefined, citations.length)
  else inc('knowledge.retrieval.miss')
  return citations
}

/** Insert an idempotent attachment ingestion and persist the deferred Agent wake. */
export async function createAttachmentKnowledgeJob(client: PoolClient, input: {
  companyId: string
  projectId: string
  conversationId: string
  clientMsgNo: string
  createdBy: string
  title: string
  mime: string
  size: number
  storageKey: string
  threadRootClientMsgNo?: string | null
  recipients: Array<{ agentId: string; reason: string }>
}): Promise<{ sourceId: string; deferAgentWake: boolean }> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM knowledge_sources
      WHERE company_id=$1 AND conversation_id=$2 AND origin_client_msg_no=$3 AND deleted_at IS NULL LIMIT 1`,
    [input.companyId, input.conversationId, input.clientMsgNo],
  )
  let sourceId = existing.rows[0]?.id ?? `ks-${randomUUID().slice(0, 16)}`
  if (!existing.rows[0]) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO knowledge_sources
        (id, company_id, project_id, conversation_id, origin_client_msg_no, kind, title, mime_type, size_bytes,
         storage_key, status, stage, created_by)
       VALUES ($1,$2,$3,$4,$5,'file',$6,$7,$8,$9,'queued','queued',$10)
       ON CONFLICT (company_id, conversation_id, origin_client_msg_no)
         WHERE origin_client_msg_no IS NOT NULL AND conversation_id IS NOT NULL AND deleted_at IS NULL
       DO NOTHING RETURNING id`,
      [sourceId, input.companyId, input.projectId, input.conversationId, input.clientMsgNo,
        input.title.slice(0, 200), input.mime, input.size, input.storageKey, input.createdBy],
    )
    if (!inserted.rows[0]) {
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM knowledge_sources
          WHERE company_id=$1 AND conversation_id=$2 AND origin_client_msg_no=$3 AND deleted_at IS NULL`,
        [input.companyId, input.conversationId, input.clientMsgNo],
      )
      if (!duplicate.rows[0]) throw new Error('failed to resolve idempotent attachment source')
      sourceId = duplicate.rows[0].id
    }
  }
  await client.query(
    `INSERT INTO knowledge_source_jobs
       (id, source_id, status, available_at, wake_recipients, wake_channel_id, wake_trigger_client_msg_no,
        wake_thread_root_client_msg_no, wake_deadline)
     VALUES ($1,$2,'queued',NOW(),$3::jsonb,$4,$5,$6,NOW()+($7::int * INTERVAL '1 millisecond'))
     ON CONFLICT (source_id) DO UPDATE SET wake_recipients=$3::jsonb, wake_channel_id=$4,
       wake_trigger_client_msg_no=$5, wake_thread_root_client_msg_no=$6,
       wake_deadline=COALESCE(knowledge_source_jobs.wake_deadline, NOW()+($7::int * INTERVAL '1 millisecond')),
       status=CASE WHEN knowledge_source_jobs.status='completed' THEN knowledge_source_jobs.status ELSE 'queued' END,
       updated_at=NOW()`,
    [`ksj-${randomUUID()}`, sourceId, JSON.stringify(input.recipients), input.conversationId, input.clientMsgNo,
      input.threadRootClientMsgNo ?? null, Number(process.env.OPEN_NOTEBOOK_INGESTION_WAKE_TIMEOUT_MS ?? DEFAULT_WAKE_TIMEOUT_MS)],
  )
  return { sourceId, deferAgentWake: input.recipients.length > 0 }
}

export async function retryKnowledgeSource(sourceId: string, companyId: string, projectId: string): Promise<void> {
  const { rows } = await pool.query<{ external_source_id: string | null }>(
    `SELECT external_source_id FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [sourceId, companyId, projectId],
  )
  if (!rows[0]) throw new Error('source not found')
  if (rows[0].external_source_id) await openNotebookClient.retrySource(rows[0].external_source_id)
  await pool.query(`UPDATE knowledge_source_jobs SET attempts=0 WHERE source_id=$1`, [sourceId])
  await enqueueKnowledgeSource(sourceId)
}

export async function deleteKnowledgeSource(sourceId: string, companyId: string, projectId: string): Promise<void> {
  const { rows } = await pool.query<{ external_source_id: string | null; storage_key: string | null }>(
    `SELECT external_source_id, storage_key FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [sourceId, companyId, projectId],
  )
  if (!rows[0]) throw new Error('source not found')
  if (rows[0].external_source_id) await openNotebookClient.deleteSource(rows[0].external_source_id)
  await pool.query(`UPDATE knowledge_sources SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1`, [sourceId])
  await cancelKnowledgeSourceJob(sourceId, '资料已在摄取完成前被删除')
  if (rows[0].storage_key) await storage.deleteObject(rows[0].storage_key)
}

export async function getKnowledgeSourceText(sourceId: string, companyId: string, projectId: string): Promise<string | null> {
  const { rows } = await pool.query<{ external_source_id: string | null }>(
    `SELECT external_source_id FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [sourceId, companyId, projectId],
  )
  if (!rows[0]?.external_source_id) return null
  return (await openNotebookClient.getSource(rows[0].external_source_id)).full_text ?? null
}
