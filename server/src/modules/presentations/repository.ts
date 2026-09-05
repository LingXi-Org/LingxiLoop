import type { Queryable } from '../../db/queryable.js'
import { isActiveProjectMember } from '../access/public.js'
import {
  type ContentIRV1,
  type DeckPlanV1,
  type EvidenceItemV1,
  type LectureDeckManifestV1,
  type PresentationDetailV1,
  type PresentationJobKind,
  type PresentationSourceSnapshotItem,
  type PresentationStatus,
  type PresentationVersionSummaryV1,
  type PresentationVisibilityScope,
  type QualityIssueV1,
  type SlideSpecV1,
  deckPlanSchema,
  lectureDeckManifestSchema,
  presentationSourceSnapshotItemSchema,
  presentationStatusSchema,
  presentationVisibilityScopeSchema,
} from './contracts.js'

type DbDate = Date | string

export interface AuthorizedPresentationSource extends PresentationSourceSnapshotItem {
  externalSourceId: string | null
}

export interface PresentationRow {
  id: string
  company_id: string
  project_id: string
  conversation_id: string
  authorization_user_id: string
  visibility_scope: string
  title: string
  request_text: string
  target_page_count: number
  recommended_page_count: number | null
  source_snapshot: unknown
  outline: unknown | null
  outline_revision: number
  status: string
  latest_version_id: string | null
  artifact_client_msg_no: string | null
  error: string | null
  created_at: DbDate
  updated_at: DbDate
}

export interface PresentationVersionRow {
  id: string
  company_id: string
  presentation_id: string
  version_number: number
  storage_key: string
  sha256: string
  size_bytes: string | number
  manifest: unknown
  quality_report: unknown
  runtime_version: string
  renderer_version: string
  created_at: DbDate
}

export interface PresentationJobClaim {
  id: string
  companyId: string
  presentationId: string
  kind: PresentationJobKind
  stage: string
  checkpoint: Record<string, unknown>
  attempts: number
  leaseToken: string
  leaseFence: number
}

export interface PresentationRetryJob {
  kind: PresentationJobKind
  stage: string
  checkpoint: Record<string, unknown>
}

export interface StoredPresentationPage {
  id: string
  pageNumber: number
  revision: number
  plan: unknown
  contentIr: ContentIRV1 | null
  slideSpec: SlideSpecV1 | null
  qualityIssues: QualityIssueV1[]
  status: string
}

function iso(value: DbDate): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

async function hasActivePresentationMembership(db: Queryable, input: {
  companyId: string
  presentationId: string
  authorizationUserId: string
}): Promise<boolean> {
  const { rows } = await db.query<{ project_id: string }>(
    'SELECT project_id FROM presentations WHERE id=$1 AND company_id=$2',
    [input.presentationId, input.companyId],
  )
  const projectId = rows[0]?.project_id
  return projectId != null && isActiveProjectMember(db, {
    companyId: input.companyId,
    projectId,
    userId: input.authorizationUserId,
  })
}

function versionSummary(row: PresentationVersionRow | null): PresentationVersionSummaryV1 | null {
  if (!row) return null
  const manifest = lectureDeckManifestSchema.parse(row.manifest)
  return {
    schemaVersion: 'presentation_version_v1',
    id: row.id,
    versionNumber: Number(row.version_number),
    pageCount: manifest.pageCount,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    runtimeVersion: row.runtime_version,
    rendererVersion: row.renderer_version,
    createdAt: iso(row.created_at),
  }
}

export function presentationDetail(
  row: PresentationRow,
  latestVersion: PresentationVersionRow | null = null,
): PresentationDetailV1 {
  const sourceSnapshot = Array.isArray(row.source_snapshot)
    ? row.source_snapshot.map((item) => presentationSourceSnapshotItemSchema.parse(item))
    : []
  return {
    schemaVersion: 'presentation_detail_v1',
    id: row.id,
    title: row.title,
    status: presentationStatusSchema.parse(row.status),
    visibilityScope: presentationVisibilityScopeSchema.parse(row.visibility_scope),
    requestText: row.request_text,
    targetPageCount: Number(row.target_page_count),
    recommendedPageCount: row.recommended_page_count == null ? null : Number(row.recommended_page_count),
    outlineRevision: Number(row.outline_revision),
    outline: row.outline == null ? null : deckPlanSchema.parse(row.outline),
    sourceSnapshot,
    latestVersion: versionSummary(latestVersion),
    error: row.error,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export async function resolvePresentationCreationScope(db: Queryable, input: {
  companyId: string
  conversationId: string
  authorizationUserId: string
  sourceIds?: string[]
}): Promise<{ projectId: string; sources: AuthorizedPresentationSource[] }> {
  const requested = input.sourceIds?.length ? input.sourceIds : null
  const { rows } = await db.query<{
    project_id: string
    id: string
    title: string
    visibility_scope: string
    status: string
    external_source_id: string | null
  }>(
    `SELECT conversation.project_id,source.id,source.title,source.visibility_scope,
            source.status,source.external_source_id
       FROM conversations conversation
       JOIN knowledge_sources source
         ON source.company_id=conversation.company_id AND source.project_id=conversation.project_id
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=conversation.id
        AND exclusion.user_id=$3
      WHERE conversation.id=$1 AND conversation.company_id=$2 AND conversation.kind='group'
        AND conversation.members ? $3
        AND source.deleted_at IS NULL AND exclusion.source_id IS NULL
        AND (source.visibility_scope='PROJECT'
          OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$3))
        AND ($4::text[] IS NULL OR source.id=ANY($4::text[]))
      ORDER BY source.created_at,source.id
      LIMIT 41`,
    [input.conversationId, input.companyId, input.authorizationUserId, requested],
  )
  const projectId = rows[0]?.project_id
  if (!projectId) throw new Error('presentation generation requires an authorized group Project')
  if (!await isActiveProjectMember(db, {
    companyId: input.companyId,
    projectId,
    userId: input.authorizationUserId,
  })) throw new Error('presentation generation requires an active Project member')
  if (rows.length > 40) throw new Error('presentation generation supports at most 40 enabled sources')
  if (requested && new Set(rows.map((row) => row.id)).size !== new Set(requested).size) {
    throw new Error('one or more requested sources are unavailable in this conversation')
  }
  const sources = rows.map((row) => ({
    sourceId: row.id,
    title: row.title,
    visibilityScope: presentationVisibilityScopeSchema.parse(row.visibility_scope),
    status: zodKnowledgeStatus(row.status),
    externalSourceId: row.external_source_id,
  }))
  if (sources.length === 0) throw new Error('no enabled knowledge sources are available')
  return { projectId, sources }
}

function zodKnowledgeStatus(value: string): PresentationSourceSnapshotItem['status'] {
  if (value === 'ready') return 'ready'
  if (value === 'failed') return 'failed'
  if (value === 'processing') return 'processing'
  return 'queued'
}

export async function refreshPresentationSources(
  db: Queryable,
  presentation: Pick<PresentationRow, 'company_id' | 'project_id' | 'conversation_id' | 'authorization_user_id' | 'source_snapshot'>,
): Promise<AuthorizedPresentationSource[]> {
  const snapshot = Array.isArray(presentation.source_snapshot)
    ? presentation.source_snapshot.map((item) => presentationSourceSnapshotItemSchema.parse(item))
    : []
  const sourceIds = snapshot.map((item) => item.sourceId)
  if (sourceIds.length === 0) return []
  const { rows } = await db.query<{
    id: string; title: string; visibility_scope: string; status: string; external_source_id: string | null
  }>(
    `SELECT source.id,source.title,source.visibility_scope,source.status,source.external_source_id
       FROM knowledge_sources source
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=$3 AND exclusion.user_id=$4
      WHERE source.company_id=$1 AND source.project_id=$2 AND source.id=ANY($5::text[])
        AND source.deleted_at IS NULL AND exclusion.source_id IS NULL
        AND (source.visibility_scope='PROJECT'
          OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))
      ORDER BY array_position($5::text[],source.id)`,
    [presentation.company_id, presentation.project_id, presentation.conversation_id,
      presentation.authorization_user_id, sourceIds],
  )
  if (rows.length !== sourceIds.length) throw new Error('a snapshotted presentation source is no longer authorized')
  return rows.map((row) => ({
    sourceId: row.id,
    title: row.title,
    visibilityScope: presentationVisibilityScopeSchema.parse(row.visibility_scope),
    status: zodKnowledgeStatus(row.status),
    externalSourceId: row.external_source_id,
  }))
}

export async function findPresentationByIdempotency(
  db: Queryable,
  companyId: string,
  idempotencyKey: string,
): Promise<PresentationRow | null> {
  const { rows } = await db.query<PresentationRow>(
    `SELECT presentation.* FROM presentation_jobs job
       JOIN presentations presentation
         ON presentation.id=job.presentation_id AND presentation.company_id=job.company_id
      WHERE job.company_id=$1 AND job.idempotency_key=$2 LIMIT 1`,
    [companyId, idempotencyKey],
  )
  return rows[0] ?? null
}

export async function findPrivatePresentationDeliveryChannel(db: Queryable, input: {
  companyId: string
  projectId: string
  authorizationUserId: string
  agentId: string
}): Promise<string | null> {
  if (!await isActiveProjectMember(db, {
    companyId: input.companyId,
    projectId: input.projectId,
    userId: input.authorizationUserId,
  })) return null
  const { rows } = await db.query<{ channel_id: string }>(
    `SELECT conversation.id AS channel_id
       FROM conversations conversation
       JOIN im_channel_bindings binding
         ON binding.channel_id=conversation.id AND binding.company_id=conversation.company_id
       JOIN participants authorization_user
         ON authorization_user.company_id=conversation.company_id AND authorization_user.id=$3
        AND authorization_user.kind='human' AND authorization_user.departed_at IS NULL
       JOIN participants agent
         ON agent.company_id=conversation.company_id AND agent.id=$4
        AND agent.kind='agent' AND agent.departed_at IS NULL
      WHERE conversation.company_id=$1 AND conversation.project_id=$2
        AND conversation.kind='direct' AND $3<>$4
        AND (conversation.members=to_jsonb(ARRAY[$3::text,$4::text])
          OR conversation.members=to_jsonb(ARRAY[$4::text,$3::text]))
      ORDER BY conversation.created_at,conversation.id
      LIMIT 1`,
    [input.companyId, input.projectId, input.authorizationUserId, input.agentId],
  )
  return rows[0]?.channel_id ?? null
}

export async function insertPresentation(db: Queryable, input: {
  id: string
  companyId: string
  projectId: string
  conversationId: string
  authorizationUserId: string
  visibilityScope: PresentationVisibilityScope
  title: string
  requestText: string
  targetPageCount: number
  sources: PresentationSourceSnapshotItem[]
  status: PresentationStatus
  artifactClientMsgNo: string
}): Promise<PresentationRow> {
  const { rows } = await db.query<PresentationRow>(
    `INSERT INTO presentations
       (id,company_id,project_id,conversation_id,authorization_user_id,visibility_scope,
        title,request_text,target_page_count,source_snapshot,status,artifact_client_msg_no)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) RETURNING *`,
    [input.id, input.companyId, input.projectId, input.conversationId, input.authorizationUserId,
      input.visibilityScope, input.title, input.requestText, input.targetPageCount,
      JSON.stringify(input.sources), input.status, input.artifactClientMsgNo],
  )
  if (!rows[0]) throw new Error('presentation insert returned no row')
  return rows[0]
}

export async function insertPresentationJob(db: Queryable, input: {
  id: string
  companyId: string
  presentationId: string
  kind: PresentationJobKind
  stage: string
  checkpoint?: Record<string, unknown>
  idempotencyKey: string
}): Promise<void> {
  await db.query(
    `INSERT INTO presentation_jobs
       (id,company_id,presentation_id,kind,status,stage,checkpoint,idempotency_key)
     VALUES($1,$2,$3,$4,'queued',$5,$6::jsonb,$7)
     ON CONFLICT(company_id,idempotency_key) DO NOTHING`,
    [input.id, input.companyId, input.presentationId, input.kind, input.stage,
      JSON.stringify(input.checkpoint ?? {}), input.idempotencyKey],
  )
}

export async function latestPresentationJobForRetry(
  db: Queryable,
  companyId: string,
  presentationId: string,
): Promise<PresentationRetryJob | null> {
  const { rows } = await db.query<{ kind: PresentationJobKind; stage: string; checkpoint: Record<string, unknown> }>(
    `SELECT kind,stage,checkpoint FROM presentation_jobs
      WHERE company_id=$1 AND presentation_id=$2
      ORDER BY created_at DESC,id DESC LIMIT 1`,
    [companyId, presentationId],
  )
  return rows[0] ?? null
}

export async function findAccessiblePresentation(db: Queryable, input: {
  companyId: string; presentationId: string; authorizationUserId: string
}): Promise<{ presentation: PresentationRow; latestVersion: PresentationVersionRow | null } | null> {
  if (!await hasActivePresentationMembership(db, input)) return null
  const { rows } = await db.query<PresentationRow & {
    version_id: string | null
    version_company_id: string | null
    version_presentation_id: string | null
    version_number: number | null
    storage_key: string | null
    sha256: string | null
    size_bytes: number | string | null
    manifest: unknown | null
    quality_report: unknown | null
    runtime_version: string | null
    renderer_version: string | null
    version_created_at: DbDate | null
  }>(
    `SELECT presentation.*,version.id AS version_id,version.company_id AS version_company_id,
            version.presentation_id AS version_presentation_id,version.version_number,
            version.storage_key,version.sha256,version.size_bytes,version.manifest,
            version.quality_report,version.runtime_version,version.renderer_version,
            version.created_at AS version_created_at
       FROM presentations presentation
       LEFT JOIN presentation_versions version
         ON version.company_id=presentation.company_id AND version.id=presentation.latest_version_id
      WHERE presentation.id=$1 AND presentation.company_id=$2
        AND (presentation.visibility_scope='PROJECT' OR presentation.authorization_user_id=$3)`,
    [input.presentationId, input.companyId, input.authorizationUserId],
  )
  const row = rows[0]
  if (!row) return null
  const latestVersion: PresentationVersionRow | null = row.version_id == null ? null : {
    id: row.version_id,
    company_id: row.version_company_id!,
    presentation_id: row.version_presentation_id!,
    version_number: Number(row.version_number),
    storage_key: row.storage_key!,
    sha256: row.sha256!,
    size_bytes: row.size_bytes!,
    manifest: row.manifest,
    quality_report: row.quality_report,
    runtime_version: row.runtime_version!,
    renderer_version: row.renderer_version!,
    created_at: row.version_created_at!,
  }
  return { presentation: row, latestVersion }
}

export async function findPresentationForWorker(
  db: Queryable,
  companyId: string,
  presentationId: string,
): Promise<PresentationRow | null> {
  const { rows } = await db.query<PresentationRow>(
    `SELECT * FROM presentations WHERE id=$1 AND company_id=$2`,
    [presentationId, companyId],
  )
  return rows[0] ?? null
}

export async function claimPresentationJob(
  db: Queryable,
  now: Date,
  leaseToken: string,
  leaseSeconds = 300,
): Promise<PresentationJobClaim | null> {
  const { rows } = await db.query<{
    id: string; company_id: string; presentation_id: string; kind: PresentationJobKind
    stage: string; checkpoint: Record<string, unknown>; attempts: number; lease_token: string; lease_fence: string
  }>(
    `WITH candidate AS (
       SELECT id,company_id FROM presentation_jobs
        WHERE ((status='queued' AND available_at<=$1)
          OR (status='running' AND lease_expires_at<=$1))
          AND attempts<6
        ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE presentation_jobs job SET
       status='running',attempts=job.attempts+1,lease_token=$2,
       lease_fence=job.lease_fence+1,
       lease_expires_at=$1+($3::int*INTERVAL '1 second'),updated_at=NOW()
      FROM candidate WHERE job.id=candidate.id AND job.company_id=candidate.company_id
     RETURNING job.id,job.company_id,job.presentation_id,job.kind,job.stage,
       job.checkpoint,job.attempts,job.lease_token,job.lease_fence`,
    [now, leaseToken, leaseSeconds],
  )
  const row = rows[0]
  return row ? {
    id: row.id,
    companyId: row.company_id,
    presentationId: row.presentation_id,
    kind: row.kind,
    stage: row.stage,
    checkpoint: row.checkpoint ?? {},
    attempts: Number(row.attempts),
    leaseToken: row.lease_token,
    leaseFence: Number(row.lease_fence),
  } : null
}

export async function renewPresentationJobLease(
  db: Queryable,
  claim: PresentationJobClaim,
  leaseSeconds = 300,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE presentation_jobs SET lease_expires_at=NOW()+($5::int*INTERVAL '1 second'),updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND lease_token=$3 AND lease_fence=$4 AND status='running'`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence, leaseSeconds],
  )
  return (result.rowCount ?? 0) === 1
}

export async function checkpointPresentationJob(db: Queryable, claim: PresentationJobClaim, input: {
  stage: string; checkpoint: Record<string, unknown>
}): Promise<void> {
  const result = await db.query(
    `UPDATE presentation_jobs SET stage=$5,checkpoint=$6::jsonb,updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND lease_token=$3 AND lease_fence=$4 AND status='running'`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence,
      input.stage, JSON.stringify(input.checkpoint)],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error('presentation job lost its lease fence')
}

export async function completePresentationJob(db: Queryable, claim: PresentationJobClaim): Promise<void> {
  const result = await db.query(
    `UPDATE presentation_jobs SET status='completed',lease_token=NULL,lease_expires_at=NULL,error=NULL,updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND lease_token=$3 AND lease_fence=$4 AND status='running'`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error('presentation job lost its lease fence')
}

export async function requeuePresentationJob(db: Queryable, claim: PresentationJobClaim, input: {
  delaySeconds: number; error?: string
}): Promise<void> {
  const result = await db.query(
    `UPDATE presentation_jobs SET status='queued',available_at=NOW()+($5::int*INTERVAL '1 second'),
       lease_token=NULL,lease_expires_at=NULL,error=$6,updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND lease_token=$3 AND lease_fence=$4 AND status='running'`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence,
      input.delaySeconds, input.error?.slice(0, 2_000) ?? null],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error('presentation job lost its lease fence')
}

export async function failPresentationJob(db: Queryable, claim: PresentationJobClaim, input: {
  error: string; final: boolean
}): Promise<void> {
  const result = await db.query(
    `UPDATE presentation_jobs SET status=$5,
       available_at=CASE WHEN $5='queued' THEN NOW()+(LEAST(60,POWER(2,attempts))::int*INTERVAL '1 minute') ELSE available_at END,
       lease_token=NULL,lease_expires_at=NULL,error=$6,updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND lease_token=$3 AND lease_fence=$4 AND status='running'`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence,
      input.final ? 'failed' : 'queued', input.error.slice(0, 2_000)],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error('presentation job lost its lease fence')
}

export async function updatePresentationForClaim(db: Queryable, claim: PresentationJobClaim, patch: {
  status: PresentationStatus
  outline?: DeckPlanV1 | null
  incrementOutlineRevision?: boolean
  recommendedPageCount?: number | null
  error?: string | null
  sourceSnapshot?: PresentationSourceSnapshotItem[]
}): Promise<void> {
  const result = await db.query(
    `UPDATE presentations presentation SET
       status=$5,
       outline=CASE WHEN $6::boolean THEN $7::jsonb ELSE presentation.outline END,
       outline_revision=presentation.outline_revision+CASE WHEN $8::boolean THEN 1 ELSE 0 END,
       recommended_page_count=CASE WHEN $9::boolean THEN $10 ELSE presentation.recommended_page_count END,
       error=$11,
       source_snapshot=CASE WHEN $12::boolean THEN $13::jsonb ELSE presentation.source_snapshot END,
       updated_at=NOW()
      WHERE presentation.id=$14 AND presentation.company_id=$2
        AND EXISTS (SELECT 1 FROM presentation_jobs job
          WHERE job.id=$1 AND job.company_id=$2 AND job.lease_token=$3
            AND job.lease_fence=$4 AND job.status='running')`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence, patch.status,
      patch.outline !== undefined, JSON.stringify(patch.outline ?? null), patch.incrementOutlineRevision === true,
      patch.recommendedPageCount !== undefined, patch.recommendedPageCount ?? null,
      patch.error?.slice(0, 2_000) ?? null,
      patch.sourceSnapshot !== undefined, JSON.stringify(patch.sourceSnapshot ?? []),
      claim.presentationId],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error('presentation update lost its job lease fence')
}

export async function replacePresentationEvidence(
  db: Queryable,
  claim: PresentationJobClaim,
  evidence: EvidenceItemV1[],
): Promise<void> {
  await assertPresentationJobClaim(db, claim)
  await db.query(`DELETE FROM presentation_evidence WHERE company_id=$1 AND presentation_id=$2`, [claim.companyId, claim.presentationId])
  for (const item of evidence) {
    await db.query(
      `INSERT INTO presentation_evidence
       (id,company_id,presentation_id,source_id,source_title,chunk_id,page_number,
        section_title,excerpt,claim,marker,position)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [item.id, claim.companyId, claim.presentationId, item.sourceId, item.sourceTitle,
        item.chunkId, item.pageNumber, item.sectionTitle, item.excerpt, item.claim,
        item.marker, JSON.stringify({ ordinal: item.position })],
    )
  }
}

export async function listPresentationEvidence(
  db: Queryable,
  companyId: string,
  presentationId: string,
): Promise<EvidenceItemV1[]> {
  const { rows } = await db.query<{
    id: string; source_id: string; source_title: string; chunk_id: string; page_number: number | null
    section_title: string | null; excerpt: string; claim: string; marker: string; position: { ordinal?: unknown }
  }>(
    `SELECT id,source_id,source_title,chunk_id,page_number,section_title,excerpt,claim,marker,position
       FROM presentation_evidence WHERE company_id=$1 AND presentation_id=$2 ORDER BY position,id`,
    [companyId, presentationId],
  )
  return rows.map((row) => ({
    schemaVersion: 'evidence_item_v1', id: row.id, sourceId: row.source_id,
    sourceTitle: row.source_title, chunkId: row.chunk_id, pageNumber: row.page_number,
    sectionTitle: row.section_title, excerpt: row.excerpt, claim: row.claim,
    marker: row.marker, position: Number(row.position?.ordinal ?? 0),
  }))
}

export async function upsertPresentationPage(db: Queryable, claim: PresentationJobClaim, input: {
  id: string; pageNumber: number; plan: unknown; contentIr: ContentIRV1; slideSpec: SlideSpecV1
  qualityIssues: QualityIssueV1[]; status: 'validated' | 'failed'
}): Promise<void> {
  await assertPresentationJobClaim(db, claim)
  await db.query(
    `INSERT INTO presentation_pages
       (id,company_id,presentation_id,page_number,plan,content_ir,slide_spec,quality_issues,status)
     VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9)
     ON CONFLICT(company_id,presentation_id,page_number) DO UPDATE SET
       id=EXCLUDED.id,revision=presentation_pages.revision+1,plan=EXCLUDED.plan,
       content_ir=EXCLUDED.content_ir,slide_spec=EXCLUDED.slide_spec,quality_issues=EXCLUDED.quality_issues,
       status=EXCLUDED.status,updated_at=NOW()`,
    [input.id, claim.companyId, claim.presentationId, input.pageNumber,
      JSON.stringify(input.plan), JSON.stringify(input.contentIr), JSON.stringify(input.slideSpec),
      JSON.stringify(input.qualityIssues), input.status],
  )
}

export async function listPresentationPages(
  db: Queryable,
  companyId: string,
  presentationId: string,
): Promise<StoredPresentationPage[]> {
  const { rows } = await db.query<{
    id: string; page_number: number; revision: number; plan: unknown; content_ir: ContentIRV1 | null; slide_spec: unknown | null
    quality_issues: QualityIssueV1[]; status: string
  }>(
    `SELECT id,page_number,revision,plan,content_ir,slide_spec,quality_issues,status
       FROM presentation_pages WHERE company_id=$1 AND presentation_id=$2 ORDER BY page_number`,
    [companyId, presentationId],
  )
  return rows.map((row) => ({
    id: row.id,
    pageNumber: Number(row.page_number),
    revision: Number(row.revision),
    plan: row.plan,
    contentIr: row.content_ir,
    slideSpec: row.slide_spec as SlideSpecV1 | null,
    qualityIssues: row.quality_issues ?? [],
    status: row.status,
  }))
}

export async function insertPresentationVersion(db: Queryable, claim: PresentationJobClaim, input: {
  id: string; versionNumber: number; storageKey: string; sha256: string; sizeBytes: number
  manifest: LectureDeckManifestV1; qualityReport: Record<string, unknown>
  runtimeVersion: string; rendererVersion: string
}): Promise<PresentationVersionRow> {
  await assertPresentationJobClaim(db, claim)
  const { rows } = await db.query<PresentationVersionRow>(
    `WITH inserted AS (
       INSERT INTO presentation_versions
         (id,company_id,presentation_id,version_number,storage_key,sha256,size_bytes,
          manifest,quality_report,runtime_version,renderer_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
       RETURNING *
     )
     UPDATE presentations presentation SET latest_version_id=inserted.id,status='ready',error=NULL,updated_at=NOW()
       FROM inserted WHERE presentation.id=$3 AND presentation.company_id=$2
     RETURNING inserted.*`,
    [input.id, claim.companyId, claim.presentationId, input.versionNumber, input.storageKey, input.sha256,
      input.sizeBytes, JSON.stringify(input.manifest), JSON.stringify(input.qualityReport),
      input.runtimeVersion, input.rendererVersion],
  )
  if (!rows[0]) throw new Error('presentation version insert lost its presentation')
  return rows[0]
}

export async function nextPresentationVersionNumber(
  db: Queryable,
  companyId: string,
  presentationId: string,
): Promise<number> {
  const { rows } = await db.query<{ next_version: number }>(
    `SELECT COALESCE(MAX(version_number),0)+1 AS next_version
       FROM presentation_versions WHERE company_id=$1 AND presentation_id=$2`,
    [companyId, presentationId],
  )
  return Number(rows[0]?.next_version ?? 1)
}

async function assertPresentationJobClaim(db: Queryable, claim: PresentationJobClaim): Promise<void> {
  const { rows } = await db.query(
    `SELECT 1 FROM presentation_jobs WHERE id=$1 AND company_id=$2 AND lease_token=$3
      AND lease_fence=$4 AND status='running' FOR UPDATE`,
    [claim.id, claim.companyId, claim.leaseToken, claim.leaseFence],
  )
  if (!rows[0]) throw new Error('presentation job lost its lease fence')
}

export async function approvePresentationOutline(db: Queryable, input: {
  companyId: string; presentationId: string; authorizationUserId: string; expectedRevision: number
}): Promise<boolean> {
  if (!await hasActivePresentationMembership(db, input)) return false
  const result = await db.query(
    `UPDATE presentations presentation SET status='generating',error=NULL,updated_at=NOW()
      WHERE presentation.id=$1 AND presentation.company_id=$2
        AND presentation.authorization_user_id=$3 AND presentation.status='awaitingOutlineApproval'
        AND presentation.outline_revision=$4`,
    [input.presentationId, input.companyId, input.authorizationUserId, input.expectedRevision],
  )
  return (result.rowCount ?? 0) === 1
}

export async function requestPresentationOutlineRevision(db: Queryable, input: {
  companyId: string; presentationId: string; authorizationUserId: string; expectedRevision: number
  targetSlideCount?: number
}): Promise<boolean> {
  if (!await hasActivePresentationMembership(db, input)) return false
  const result = await db.query(
    `UPDATE presentations presentation SET status='planning',error=NULL,
       target_page_count=COALESCE($5,presentation.target_page_count),updated_at=NOW()
      WHERE presentation.id=$1 AND presentation.company_id=$2
        AND presentation.authorization_user_id=$3
        AND (presentation.status='awaitingOutlineApproval' OR (
          presentation.status='needsAttention' AND $5::integer IS NOT NULL
          AND presentation.recommended_page_count IS NOT NULL
          AND $5::integer<=presentation.recommended_page_count))
        AND presentation.outline_revision=$4`,
    [input.presentationId, input.companyId, input.authorizationUserId, input.expectedRevision,
      input.targetSlideCount ?? null],
  )
  return (result.rowCount ?? 0) === 1
}

export async function setPresentationStatus(db: Queryable, input: {
  companyId: string; presentationId: string; authorizationUserId: string
  status: PresentationStatus; allowedStatuses: PresentationStatus[]; error?: string | null
}): Promise<boolean> {
  if (!await hasActivePresentationMembership(db, input)) return false
  const result = await db.query(
    `UPDATE presentations presentation SET status=$4,error=$6,updated_at=NOW()
      WHERE presentation.id=$1 AND presentation.company_id=$2 AND presentation.authorization_user_id=$3
        AND presentation.status=ANY($5::text[])`,
    [input.presentationId, input.companyId, input.authorizationUserId,
      input.status, input.allowedStatuses, input.error?.slice(0, 2_000) ?? null],
  )
  return (result.rowCount ?? 0) === 1
}

export async function cancelPresentationJobs(db: Queryable, companyId: string, presentationId: string): Promise<void> {
  await db.query(
    `UPDATE presentation_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
      WHERE company_id=$1 AND presentation_id=$2 AND status IN ('queued','running')`,
    [companyId, presentationId],
  )
}

export async function listAccessiblePresentationVersions(db: Queryable, input: {
  companyId: string; presentationId: string; authorizationUserId: string
}): Promise<PresentationVersionRow[]> {
  if (!await hasActivePresentationMembership(db, input)) return []
  const { rows } = await db.query<PresentationVersionRow>(
    `SELECT version.* FROM presentation_versions version
       JOIN presentations presentation
          ON presentation.id=version.presentation_id AND presentation.company_id=version.company_id
      WHERE version.company_id=$1 AND version.presentation_id=$2
        AND (presentation.visibility_scope='PROJECT' OR presentation.authorization_user_id=$3)
      ORDER BY version.version_number DESC`,
    [input.companyId, input.presentationId, input.authorizationUserId],
  )
  return rows
}

export async function findAccessiblePresentationVersion(db: Queryable, input: {
  companyId: string; presentationId: string; versionId: string; authorizationUserId: string
}): Promise<PresentationVersionRow | null> {
  if (!await hasActivePresentationMembership(db, input)) return null
  const { rows } = await db.query<PresentationVersionRow>(
    `SELECT version.* FROM presentation_versions version
       JOIN presentations presentation
          ON presentation.id=version.presentation_id AND presentation.company_id=version.company_id
      WHERE version.company_id=$1 AND version.presentation_id=$2 AND version.id=$3
        AND (presentation.visibility_scope='PROJECT' OR presentation.authorization_user_id=$4)`,
    [input.companyId, input.presentationId, input.versionId, input.authorizationUserId],
  )
  return rows[0] ?? null
}

export function presentationVersionSummary(row: PresentationVersionRow): PresentationVersionSummaryV1 {
  return versionSummary(row)!
}

export async function listPresentationStorageKeys(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ storage_key: string }>(
    `SELECT storage_key FROM presentation_versions WHERE storage_key LIKE 'presentation-artifacts/%'`,
  )
  return rows.map((row) => row.storage_key)
}
