import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { KnowledgeCreatedVia, KnowledgeVisibilityScope } from './contracts.js'

export type KnowledgeSourceStatus = 'upload_pending' | 'queued' | 'processing' | 'ready' | 'failed'

export interface IngestionSourceRow {
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
  visibility_scope: KnowledgeVisibilityScope
  owner_user_id: string
  created_by_user_id: string
  created_via: KnowledgeCreatedVia
}

export interface AttachmentKnowledgeJobInput {
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
}

export async function findIngestionSource(db: Queryable, sourceId: string): Promise<IngestionSourceRow | null> {
  const { rows } = await db.query<IngestionSourceRow>(
    `SELECT id, company_id, project_id, conversation_id, kind, title, mime_type, size_bytes,
            storage_key, original_url, external_source_id, external_command_id, status, stage,
            visibility_scope, owner_user_id, created_by_user_id, created_via
       FROM knowledge_sources WHERE id=$1 AND deleted_at IS NULL`,
    [sourceId],
  )
  return rows[0] ?? null
}

export async function releaseDeferredWakeState(
  db: Queryable,
  sourceId: string,
  failure?: string,
): Promise<'none' | 'ready' | 'degraded'> {
  const { rows } = await db.query<{
    wake_recipients: Array<{ agentId: string; reason: string }> | null
    wake_channel_id: string | null
    wake_trigger_client_msg_no: string | null
    wake_thread_root_client_msg_no: string | null
    wake_released_at: string | null
    company_id: string
    authorization_user_id: string
  }>(
    `SELECT job.wake_recipients, job.wake_channel_id, job.wake_trigger_client_msg_no,
            job.wake_thread_root_client_msg_no, job.wake_released_at, source.company_id,
            source.owner_user_id AS authorization_user_id
       FROM knowledge_source_jobs job
       JOIN knowledge_sources source ON source.id=job.source_id
      WHERE job.source_id=$1
      FOR UPDATE OF job`,
    [sourceId],
  )
  const job = rows[0]
  if (!job || job.wake_released_at || !job.wake_channel_id || !job.wake_trigger_client_msg_no) return 'none'
  for (const recipient of job.wake_recipients ?? []) {
    await db.query(
      `INSERT INTO agent_work_items
         (id, company_id, authorization_user_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
      [randomUUID(), job.company_id, job.authorization_user_id, recipient.agentId, job.wake_channel_id,
        job.wake_thread_root_client_msg_no, job.wake_trigger_client_msg_no, recipient.reason],
    )
  }
  await db.query(
    `UPDATE knowledge_source_jobs SET wake_released_at=NOW(), wake_error=$2, updated_at=NOW()
      WHERE source_id=$1 AND wake_released_at IS NULL`,
    [sourceId, failure?.slice(0, 2_000) ?? null],
  )
  return failure ? 'degraded' : 'ready'
}

export async function cancelIngestionJob(db: Queryable, sourceId: string, reason: string): Promise<void> {
  await db.query(
    `UPDATE knowledge_source_jobs
        SET status=CASE WHEN status='completed' THEN status ELSE 'failed' END,
            leased_until=NULL, leased_by=NULL, last_error=$2, updated_at=NOW()
      WHERE source_id=$1`,
    [sourceId, reason.slice(0, 2_000)],
  )
}

export async function markExternalSource(db: Queryable, args: {
  sourceId: string
  leaseToken: string
  externalSourceId: string
  externalCommandId: string | null
}): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `WITH valid_claim AS (
       SELECT source_id FROM knowledge_source_jobs
        WHERE source_id=$1 AND leased_by=$4 AND leased_until>=NOW() AND status='processing'
        FOR UPDATE
     )
     UPDATE knowledge_sources SET external_source_id=$2, external_command_id=$3, status='processing',
            stage='processing', updated_at=NOW()
       FROM valid_claim
      WHERE id=$1 AND deleted_at IS NULL AND valid_claim.source_id=knowledge_sources.id
      RETURNING id`,
    [args.sourceId, args.externalSourceId, args.externalCommandId, args.leaseToken],
  )
  return rows.length > 0
}

interface SourceProgress {
  sourceId: string
  status: KnowledgeSourceStatus
  stage: string
  error: string | null
  chunkCount: number
  externalCommandId: string | null
}

async function updateSourceProgress(db: Queryable, args: SourceProgress): Promise<void> {
  await db.query(
    `UPDATE knowledge_sources SET status=$2, stage=$3, error=$4, external_chunk_count=$5,
            external_command_id=COALESCE($6, external_command_id), updated_at=NOW()
      WHERE id=$1 AND deleted_at IS NULL`,
    [args.sourceId, args.status, args.stage, args.error, args.chunkCount, args.externalCommandId],
  )
}

export async function completeIngestion(
  db: Queryable,
  args: SourceProgress & { clearStorageKey: boolean; leaseToken: string },
): Promise<boolean> {
  const { rows } = await db.query<{ source_id: string }>(
    `UPDATE knowledge_source_jobs SET status='completed', leased_until=NULL, leased_by=NULL, updated_at=NOW()
      WHERE source_id=$1 AND leased_by=$2 AND leased_until>=NOW() AND status='processing'
      RETURNING source_id`,
    [args.sourceId, args.leaseToken],
  )
  if (!rows.length) return false
  await updateSourceProgress(db, args)
  if (args.clearStorageKey) {
    await db.query(
      `UPDATE knowledge_sources SET storage_key=NULL, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,
      [args.sourceId],
    )
  }
  return true
}

export async function requeueIngestion(
  db: Queryable,
  args: SourceProgress & { delayMs: number; leaseToken: string },
): Promise<boolean> {
  const { rows } = await db.query<{ source_id: string }>(
    `UPDATE knowledge_source_jobs SET status='queued',
            available_at=NOW()+($2::int * INTERVAL '1 millisecond'), leased_until=NULL, leased_by=NULL, updated_at=NOW()
      WHERE source_id=$1 AND leased_by=$3 AND leased_until>=NOW() AND status='processing'
      RETURNING source_id`,
    [args.sourceId, args.delayMs, args.leaseToken],
  )
  if (!rows.length) return false
  await updateSourceProgress(db, args)
  return true
}

export async function claimIngestionJob(
  db: Queryable,
  workerId: string,
  leaseMs: number,
): Promise<{ sourceId: string; deadlinePassed: boolean; leaseToken: string } | null> {
  const { rows } = await db.query<{ source_id: string; deadline_passed: boolean }>(
    `SELECT source_id,
            (wake_deadline IS NOT NULL AND wake_deadline <= NOW() AND wake_released_at IS NULL) AS deadline_passed
       FROM knowledge_source_jobs
      WHERE status IN ('queued','processing') AND available_at<=NOW()
        AND (leased_until IS NULL OR leased_until<NOW())
      ORDER BY available_at, created_at
      FOR UPDATE SKIP LOCKED LIMIT 1`,
  )
  const job = rows[0]
  if (!job) return null
  const leaseToken = `${workerId.slice(0, 100)}:${randomUUID()}`
  await db.query(
    `UPDATE knowledge_source_jobs SET status='processing',
            leased_until=NOW()+($2::int * INTERVAL '1 millisecond'), leased_by=$3, updated_at=NOW()
      WHERE source_id=$1`,
    [job.source_id, leaseMs, leaseToken],
  )
  return { sourceId: job.source_id, deadlinePassed: job.deadline_passed, leaseToken }
}

export async function renewIngestionLease(db: Queryable, args: {
  sourceId: string; leaseToken: string; leaseMs: number
}): Promise<boolean> {
  const { rows } = await db.query<{ source_id: string }>(
    `UPDATE knowledge_source_jobs
        SET leased_until=NOW()+($3::int * INTERVAL '1 millisecond'), updated_at=NOW()
      WHERE source_id=$1 AND leased_by=$2 AND leased_until>=NOW() AND status='processing'
      RETURNING source_id`,
    [args.sourceId, args.leaseToken, args.leaseMs],
  )
  return rows.length > 0
}

export async function recordIngestionFailure(db: Queryable, args: {
  sourceId: string; leaseToken: string; message: string; maxAttempts: number
}): Promise<{ final: boolean; externalSourceId: string | null } | null> {
  const { rows } = await db.query<{ final: boolean; external_source_id: string | null }>(
    `UPDATE knowledge_source_jobs job
        SET attempts=job.attempts+1, last_error=$2,
            status=CASE WHEN job.attempts+1 >= $3 THEN 'failed' ELSE 'queued' END,
            available_at=CASE WHEN job.attempts+1 >= $3 THEN job.available_at ELSE NOW()+INTERVAL '15 seconds' END,
            leased_until=NULL, leased_by=NULL, updated_at=NOW()
       FROM knowledge_sources source
      WHERE job.source_id=$1 AND source.id=job.source_id AND job.leased_by=$4
        AND job.leased_until>=NOW() AND job.status='processing'
      RETURNING (job.attempts >= $3) AS final, source.external_source_id`,
    [args.sourceId, args.message, args.maxAttempts, args.leaseToken],
  )
  const result = rows[0]
  if (!result) return null
  await db.query(
    `UPDATE knowledge_sources SET status=$2, stage=$3, error=$4, updated_at=NOW()
      WHERE id=$1 AND deleted_at IS NULL`,
    [args.sourceId, result.final ? 'failed' : 'queued', result.final ? 'failed' : 'retrying', args.message],
  )
  return { final: result.final, externalSourceId: result.external_source_id }
}

export async function recordExternalRetryCommand(
  db: Queryable,
  args: { sourceId: string; leaseToken: string; externalCommandId: string | null },
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `WITH valid_claim AS (
       SELECT source_id FROM knowledge_source_jobs
        WHERE source_id=$1 AND leased_by=$3 AND leased_until>=NOW() AND status='processing'
        FOR UPDATE
     )
     UPDATE knowledge_sources SET external_command_id=COALESCE($2, external_command_id), updated_at=NOW()
       FROM valid_claim
      WHERE id=$1 AND deleted_at IS NULL AND valid_claim.source_id=knowledge_sources.id
      RETURNING id`,
    [args.sourceId, args.externalCommandId, args.leaseToken],
  )
  return rows.length > 0
}

export async function listReferencedStorageKeys(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ storage_key: string }>(
    `SELECT storage_key FROM knowledge_sources WHERE storage_key IS NOT NULL AND deleted_at IS NULL`,
  )
  return rows.map((row) => row.storage_key)
}

export async function listDeletedSourceAssets(db: Queryable): Promise<Array<{
  sourceId: string; externalSourceId: string | null; storageKey: string | null
}>> {
  const { rows } = await db.query<{
    source_id: string; external_source_id: string | null; storage_key: string | null
  }>(
    `SELECT id AS source_id,external_source_id,storage_key FROM knowledge_sources
      WHERE deleted_at IS NOT NULL AND (external_source_id IS NOT NULL OR storage_key IS NOT NULL)
      ORDER BY deleted_at LIMIT 100`,
  )
  return rows.map((row) => ({
    sourceId: row.source_id,
    externalSourceId: row.external_source_id,
    storageKey: row.storage_key,
  }))
}

export async function markDeletedSourceAssetsClean(db: Queryable, sourceId: string): Promise<void> {
  await db.query(
    `UPDATE knowledge_sources SET external_source_id=NULL,external_command_id=NULL,storage_key=NULL,updated_at=NOW()
      WHERE id=$1 AND deleted_at IS NOT NULL`,
    [sourceId],
  )
}

export async function insertAttachmentKnowledgeJob(
  db: Queryable,
  input: AttachmentKnowledgeJobInput & { visibilityScope: KnowledgeVisibilityScope },
  wakeTimeoutMs: number,
): Promise<{ sourceId: string; deferAgentWake: boolean }> {
  const { rows: existing } = await db.query<{ id: string }>(
    `SELECT id FROM knowledge_sources
      WHERE company_id=$1 AND project_id=$2 AND conversation_id=$3 AND origin_client_msg_no=$4
        AND owner_user_id=$5 AND deleted_at IS NULL LIMIT 1`,
    [input.companyId, input.projectId, input.conversationId, input.clientMsgNo, input.createdBy],
  )
  let sourceId = existing[0]?.id ?? `ks-${randomUUID().slice(0, 16)}`
  if (!existing[0]) {
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO knowledge_sources
        (id, company_id, project_id, conversation_id, origin_client_msg_no, kind, title, mime_type, size_bytes,
         storage_key, status, stage, visibility_scope, owner_user_id, created_by_user_id, created_via)
       VALUES ($1,$2,$3,$4,$5,'file',$6,$7,$8,$9,'queued','queued',$10,$11,$11,'USER')
       ON CONFLICT (company_id, conversation_id, origin_client_msg_no)
         WHERE origin_client_msg_no IS NOT NULL AND conversation_id IS NOT NULL AND deleted_at IS NULL
       DO NOTHING RETURNING id`,
      [sourceId, input.companyId, input.projectId, input.conversationId, input.clientMsgNo,
        input.title.slice(0, 200), input.mime, input.size, input.storageKey, input.visibilityScope, input.createdBy],
    )
    if (!inserted[0]) {
      const { rows: duplicate } = await db.query<{ id: string }>(
        `SELECT id FROM knowledge_sources
          WHERE company_id=$1 AND project_id=$2 AND conversation_id=$3 AND origin_client_msg_no=$4
            AND owner_user_id=$5 AND deleted_at IS NULL`,
        [input.companyId, input.projectId, input.conversationId, input.clientMsgNo, input.createdBy],
      )
      if (!duplicate[0]) throw new Error('failed to resolve idempotent attachment source')
      sourceId = duplicate[0].id
    }
  }
  await db.query(
    `INSERT INTO knowledge_source_jobs
       (id, source_id, status, available_at, wake_recipients, wake_channel_id, wake_trigger_client_msg_no,
        wake_thread_root_client_msg_no, wake_deadline)
     VALUES ($1,$2,'queued',NOW(),$3::jsonb,$4,$5,$6,NOW()+($7::int * INTERVAL '1 millisecond'))
     ON CONFLICT (source_id) DO UPDATE SET wake_recipients=$3::jsonb, wake_channel_id=$4,
       wake_trigger_client_msg_no=$5, wake_thread_root_client_msg_no=$6,
       wake_deadline=COALESCE(knowledge_source_jobs.wake_deadline, NOW()+($7::int * INTERVAL '1 millisecond')),
       status=CASE WHEN knowledge_source_jobs.status IN ('completed','processing')
                   THEN knowledge_source_jobs.status ELSE 'queued' END,
       updated_at=NOW()`,
    [`ksj-${randomUUID()}`, sourceId, JSON.stringify(input.recipients), input.conversationId, input.clientMsgNo,
      input.threadRootClientMsgNo ?? null, wakeTimeoutMs],
  )
  return { sourceId, deferAgentWake: input.recipients.length > 0 }
}

export async function findTenantSourceAssets(db: Queryable, args: {
  sourceId: string; companyId: string; projectId: string; userId: string
}): Promise<{ externalSourceId: string | null; storageKey: string | null } | null> {
  const { rows } = await db.query<{ external_source_id: string | null; storage_key: string | null }>(
    `SELECT external_source_id, storage_key FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL
        AND (visibility_scope='PROJECT' OR (visibility_scope='PRIVATE' AND owner_user_id=$4))`,
    [args.sourceId, args.companyId, args.projectId, args.userId],
  )
  const row = rows[0]
  return row ? { externalSourceId: row.external_source_id, storageKey: row.storage_key } : null
}

export async function findVisibleSourceExternalId(db: Queryable, args: {
  sourceId: string; companyId: string; projectId: string; userId: string
}): Promise<string | null> {
  const { rows } = await db.query<{ external_source_id: string | null }>(
    `SELECT source.external_source_id FROM knowledge_sources source
      WHERE source.id=$1 AND source.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL
        AND (source.visibility_scope='PROJECT'
          OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4)
          OR EXISTS (
            SELECT 1 FROM project_memberships membership
             WHERE membership.company_id=source.company_id AND membership.project_id=source.project_id
               AND membership.user_id=$4 AND membership.status='ACTIVE'
               AND membership.role IN ('OWNER','TEACHER')
          ))`,
    [args.sourceId, args.companyId, args.projectId, args.userId],
  )
  return rows[0]?.external_source_id ?? null
}

export async function resetIngestionAttempts(db: Queryable, sourceId: string): Promise<void> {
  await db.query(`UPDATE knowledge_source_jobs SET attempts=0, updated_at=NOW() WHERE source_id=$1`, [sourceId])
}

export async function softDeleteTenantSource(db: Queryable, args: {
  sourceId: string; companyId: string; projectId: string; userId: string
}): Promise<boolean> {
  const result = await db.query(
    `UPDATE knowledge_sources SET deleted_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL
        AND (visibility_scope='PROJECT' OR (visibility_scope='PRIVATE' AND owner_user_id=$4))`,
    [args.sourceId, args.companyId, args.projectId, args.userId],
  )
  return (result.rowCount ?? 0) > 0
}
