import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { CaseContent, CaseScope } from './contracts.js'
import { CASE_COVER_RULES_VERSION, caseCoverFingerprint, caseCoverSnapshot,
  type CaseCoverSnapshot, type CaseCoverGenerationResult, type CoverSnapshotKind, type GeneratedCaseCover } from './cover-contracts.js'

export interface CaseCoverClaim {
  id: string; company_id: string; case_id: string; fingerprint: string; generation: number
  requested_by: string; rules_version: string; snapshot: CaseCoverSnapshot; attempts: number; lease_token: string
}

/** Caller holds permission dependencies then the case row, shared by every writer. */
export async function queueCaseCover(db: Queryable, scope: CaseScope, caseId: string, kind: CoverSnapshotKind, content: CaseContent) {
  const snapshot = caseCoverSnapshot(content)
  if (!snapshot.content) {
    await db.query('DELETE FROM organization_case_cover_targets WHERE case_id=$1 AND company_id=$2 AND snapshot_kind=$3',[caseId,scope.companyId,kind])
    return
  }
  const fingerprint = caseCoverFingerprint(snapshot)
  const { rows } = await db.query<{ id: string; generation: number; status: string }>(`
    INSERT INTO organization_case_cover_jobs(id,company_id,case_id,fingerprint,rules_version,snapshot,requested_by,available_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,NOW()+interval '2 seconds')
    ON CONFLICT(company_id,case_id,fingerprint,rules_version) DO UPDATE SET
      requested_by=CASE WHEN organization_case_cover_jobs.status='generating' THEN organization_case_cover_jobs.requested_by ELSE EXCLUDED.requested_by END,
      status=CASE WHEN organization_case_cover_jobs.status='cancelled' THEN 'pending' ELSE organization_case_cover_jobs.status END,
      generation=organization_case_cover_jobs.generation+CASE WHEN organization_case_cover_jobs.status='cancelled' THEN 1 ELSE 0 END,
      attempts=CASE WHEN organization_case_cover_jobs.status='cancelled' THEN 0 ELSE organization_case_cover_jobs.attempts END,
      available_at=CASE WHEN organization_case_cover_jobs.status='cancelled' THEN NOW()+interval '2 seconds' ELSE organization_case_cover_jobs.available_at END,
      updated_at=NOW()
    RETURNING id,generation,status`, [`case-cover-${randomUUID()}`,scope.companyId,caseId,fingerprint,CASE_COVER_RULES_VERSION,JSON.stringify(snapshot),scope.userId])
  const job = rows[0]!
  await db.query(`INSERT INTO organization_case_cover_targets(case_id,company_id,snapshot_kind,job_id,asset_job_id,asset_generation)
    VALUES($1,$2,$3,$4,CASE WHEN $5 THEN $4 ELSE NULL END,CASE WHEN $5 THEN $6::integer ELSE NULL END)
    ON CONFLICT(case_id,snapshot_kind) DO UPDATE SET job_id=EXCLUDED.job_id,
      asset_job_id=COALESCE(EXCLUDED.asset_job_id,organization_case_cover_targets.asset_job_id),
      asset_generation=COALESCE(EXCLUDED.asset_generation,organization_case_cover_targets.asset_generation)`,
    [caseId,scope.companyId,kind,job.id,job.status==='ready',job.generation])
}

export async function cancelUnneededCaseCovers(db: Queryable, companyId: string, caseId: string, all = false) {
  await db.query(`UPDATE organization_case_cover_jobs j SET status='cancelled',lease_token=NULL,leased_until=NULL,updated_at=NOW()
    WHERE j.company_id=$1 AND j.case_id=$2 AND j.status IN ('pending','generating') AND
      ($3 OR NOT EXISTS(SELECT 1 FROM organization_case_cover_targets t WHERE t.job_id=j.id))`, [companyId,caseId,all])
}

export async function listCaseCoverDescriptors(db: Queryable, companyId: string, caseIds: string[], kind: CoverSnapshotKind, canManage: boolean) {
  const { rows } = await db.query<{ case_id: string; status: GeneratedCaseCover['status']; fingerprint: string; generation: number;
    asset_job_id: string | null; asset_generation: number | null; alt: string | null }>(`
    SELECT t.case_id,j.status,j.fingerprint,j.generation,t.asset_job_id,t.asset_generation,a.alt
    FROM organization_case_cover_targets t JOIN organization_case_cover_jobs j ON j.id=t.job_id
    LEFT JOIN organization_case_cover_assets a ON a.job_id=t.asset_job_id AND a.generation=t.asset_generation
    WHERE t.company_id=$1 AND t.case_id=ANY($2::text[]) AND t.snapshot_kind=$3`, [companyId,caseIds,kind])
  return new Map(rows.map(row => {
    const base = row.asset_job_id ? `/api/cases/${encodeURIComponent(row.case_id)}/cover/assets/${encodeURIComponent(row.asset_job_id)}/${row.asset_generation}` : null
    const descriptor: GeneratedCaseCover = { schemaVersion:1,status:row.status,fingerprint:row.fingerprint,generation:row.generation,
      alt:row.alt,previewUrl:base ? `${base}/preview?snapshot=${kind}` : null,
      interactiveUrl:base ? `${base}/interactive?snapshot=${kind}` : null,
      canRetry:canManage && (row.status==='failed' || row.status==='cancelled' || row.status==='ready') }
    return [row.case_id,descriptor]
  }))
}

async function authorizeWorker(db: Queryable, job: Pick<CaseCoverClaim,'company_id'|'requested_by'>) {
  const decision = await createPermissionService(db,{lockDependencies:true}).can({ actorUserId:job.requested_by,
    companyId:job.company_id,action:'cases:manage' })
  return decision.allowed
}
async function lockCurrentCase(db: Queryable, job: Pick<CaseCoverClaim,'case_id'|'company_id'>, skipLocked = false) {
  return (await db.query(`SELECT id FROM organization_cases WHERE id=$1 AND company_id=$2 FOR UPDATE ${skipLocked?'SKIP LOCKED':''}`, [job.case_id,job.company_id])).rows.length > 0
}
const wanted = `EXISTS(SELECT 1 FROM organization_case_cover_targets t JOIN organization_cases c ON c.id=t.case_id
  WHERE t.job_id=j.id AND (t.snapshot_kind='draft' OR c.status='published'))`

/** Same PostgreSQL SKIP LOCKED + lease token + heartbeat convention as presentations. */
export async function claimCaseCover(db: Queryable, workerId: string, concurrency: number, maxAttempts = 3): Promise<CaseCoverClaim | null> {
  // Serialize only the small claim admission section; generation runs outside it.
  if (!(await db.query<{ locked: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext('case-cover-admission')) AS locked`)).rows[0]?.locked) return null
  const running = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM organization_case_cover_jobs WHERE status='generating' AND leased_until>NOW()`)
  if (Number(running.rows[0]?.count) >= concurrency) return null
  const candidates = await db.query<CaseCoverClaim>(`SELECT j.* FROM organization_case_cover_jobs j
    WHERE ((j.status='pending' AND j.available_at<=NOW()) OR (j.status='generating' AND j.leased_until<=NOW()))
    AND ${wanted} ORDER BY j.available_at,j.created_at LIMIT 10`)
  for (const candidate of candidates.rows) {
    const authorized = await authorizeWorker(db,candidate)
    if (!await lockCurrentCase(db,candidate,true)) continue
    if (!authorized || candidate.rules_version!==CASE_COVER_RULES_VERSION) {
      await db.query(`UPDATE organization_case_cover_jobs SET status='cancelled',lease_token=NULL,leased_until=NULL,
        failure_category=$2,updated_at=NOW() WHERE id=$1 AND status IN ('pending','generating')`, [candidate.id,authorized?'rules_changed':'authorization_revoked'])
      continue
    }
    if (candidate.attempts>=maxAttempts) {
      await db.query(`UPDATE organization_case_cover_jobs SET status='failed',lease_token=NULL,leased_until=NULL,
        failure_category='lease_expired',updated_at=NOW() WHERE id=$1 AND status='generating' AND leased_until<=NOW()`,[candidate.id])
      continue
    }
    const { rows } = await db.query<CaseCoverClaim>(`UPDATE organization_case_cover_jobs j SET status='generating',attempts=attempts+1,
      lease_token=$2,leased_until=NOW()+interval '3 minutes',updated_at=NOW()
      WHERE id=$1 AND ${wanted} AND ((status='pending' AND available_at<=NOW()) OR (status='generating' AND leased_until<=NOW())) RETURNING *`,
      [candidate.id,`${workerId}:${randomUUID()}`])
    if (rows[0]) return rows[0]
  }
  return null
}
export async function renewCaseCoverLease(db: Queryable, claim: CaseCoverClaim): Promise<boolean> {
  const result = await db.query(`UPDATE organization_case_cover_jobs SET leased_until=NOW()+interval '3 minutes'
    WHERE id=$1 AND generation=$2 AND lease_token=$3 AND status='generating' AND leased_until>NOW()`, [claim.id,claim.generation,claim.lease_token])
  return result.rowCount === 1
}
async function lockClaim(db: Queryable, claim: CaseCoverClaim): Promise<boolean> {
  if (!await authorizeWorker(db,claim) || !await lockCurrentCase(db,claim)) return false
  const result = await db.query(`SELECT j.id FROM organization_case_cover_jobs j WHERE id=$1 AND generation=$2 AND lease_token=$3
    AND status='generating' AND leased_until>NOW() AND ${wanted} FOR UPDATE`, [claim.id,claim.generation,claim.lease_token])
  return result.rows.length === 1
}
export async function completeCaseCover(db: Queryable, claim: CaseCoverClaim, artifact: CaseCoverGenerationResult, durationMs = 0): Promise<boolean> {
  if (!await lockClaim(db,claim)) return false
  await db.query(`INSERT INTO organization_case_cover_assets(job_id,generation,case_id,company_id,preview_svg,interactive_html,alt,object_name,rationale,source_version,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`, [claim.id,claim.generation,claim.case_id,claim.company_id,
    artifact.staticSvg,artifact.html,artifact.altText,artifact.objectName,artifact.rationale,artifact.sourceVersion,JSON.stringify(artifact.metadata)])
  await db.query(`UPDATE organization_case_cover_targets SET asset_job_id=$1,asset_generation=$2 WHERE job_id=$1`, [claim.id,claim.generation])
  await db.query(`UPDATE organization_case_cover_jobs SET status='ready',lease_token=NULL,leased_until=NULL,failure_category=NULL,duration_ms=$2,updated_at=NOW() WHERE id=$1`, [claim.id,Math.min(2147483647,Math.max(0,durationMs))])
  return true
}
export async function failCaseCover(db: Queryable, claim: CaseCoverClaim, category: string, maxAttempts: number): Promise<boolean> {
  if (!await lockClaim(db,claim)) return false
  await db.query(`UPDATE organization_case_cover_jobs SET status=$2,lease_token=NULL,leased_until=NULL,failure_category=$3,
    available_at=NOW()+($4::integer*interval '1 second'),updated_at=NOW() WHERE id=$1`,
    [claim.id,claim.attempts>=maxAttempts?'failed':'pending',category,Math.min(300,10*2**Math.min(claim.attempts,5))])
  return true
}
