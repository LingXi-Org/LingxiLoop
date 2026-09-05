import type { Queryable } from '../../db/queryable.js'
import type { TrustAudienceLevel, TrustKpi } from './contracts.js'

export interface TrustAccessContext {
  companyId: string
  projectId: string
  companyType: string
  projectName: string
  projectKind: string
  projectStatus: string
  audienceLevel: TrustAudienceLevel
}

export async function findTrustProject(db: Queryable, companyId: string, projectId: string) {
  const { rows } = await db.query<{ name: string; kind: string; status: string }>(
    `SELECT name,kind,status FROM projects WHERE company_id=$1 AND id=$2`,
    [companyId,projectId],
  )
  return rows[0] ?? null
}

export async function listTrustKpis(db: Queryable, companyId: string, projectId: string): Promise<TrustKpi[]> {
  const { rows } = await db.query<{
    id: string; data: Record<string, unknown>; created_at: string
  }>(
    `SELECT id,data,created_at FROM evidence_records
      WHERE company_id=$1 AND project_id=$2 AND kind='TRUST_KPI'
      ORDER BY created_at DESC LIMIT 50`,
    [companyId,projectId],
  )
  return rows.flatMap((row) => {
    const data = row.data
    const window = data.window
    if (typeof data.label !== 'string' || typeof data.value !== 'number'
      || typeof data.threshold !== 'number' || typeof data.numerator !== 'number'
      || typeof data.denominator !== 'number' || !window || Array.isArray(window)
      || typeof window !== 'object' || typeof (window as Record<string, unknown>).from !== 'string'
      || typeof (window as Record<string, unknown>).to !== 'string' || typeof data.source !== 'string'
      || typeof data.dataset !== 'string' || typeof data.release !== 'string'
      || !Number.isFinite(data.value) || !Number.isFinite(data.threshold)
      || !Number.isFinite(data.numerator) || !Number.isFinite(data.denominator) || data.denominator <= 0
      || !data.label || !data.source || !data.dataset || !data.release
      || !Number.isFinite(Date.parse((window as Record<string, string>).from))
      || !Number.isFinite(Date.parse((window as Record<string, string>).to))) return []
    return [{
      id: row.id,
      label: data.label,
      value: data.value,
      threshold: data.threshold,
      numerator: data.numerator,
      denominator: data.denominator,
      window: window as { from: string; to: string },
      source: data.source,
      dataset: data.dataset,
      release: data.release,
      updatedAt: new Date(row.created_at).toISOString(),
      evidenceId: row.id,
    }]
  })
}

export async function insertTrustSnapshot(db: Queryable, input: {
  id: string; companyId: string; projectId: string; audienceLevel: TrustAudienceLevel
  payload: Record<string, unknown>; payloadHash: string; signature: string; evidenceId: string; actorUserId: string
}): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO trust_snapshots
       (id,company_id,project_id,audience_level,dataset_release,payload,payload_hash,signature,
        signing_key_id,evidence_id,created_by)
     VALUES ($1,$2,$3,$4,'trust-bff-v1',$5::jsonb,$6,$7,'lingxiloop-server-v1',$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [input.id,input.companyId,input.projectId,input.audienceLevel,JSON.stringify(input.payload),
      input.payloadHash,input.signature,input.evidenceId,input.actorUserId],
  )
  return (result.rowCount ?? 0) === 1
}

export async function findTrustSnapshot(db: Queryable, input: {
  id: string; companyId: string; projectId: string
}) {
  const { rows } = await db.query<{
    id: string; audience_level: TrustAudienceLevel; payload: Record<string, unknown>
    payload_hash: string; signature: string; evidence_id: string; created_at: string
  }>(
    `SELECT id,audience_level,payload,payload_hash,signature,evidence_id,created_at
       FROM trust_snapshots WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [input.id,input.companyId,input.projectId],
  )
  return rows[0] ?? null
}
