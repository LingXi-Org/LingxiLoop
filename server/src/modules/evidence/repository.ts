import type { Queryable } from '../../db/queryable.js'
import type {
  CreateEvidenceClaimInput,
  CreateEvidenceRecordInput,
  EvidenceLinkInput,
  EvidenceChainRecord,
  EvidenceRecord,
} from './contracts.js'
import type { JsonObject } from '../events/public.js'

interface EvidenceRecordRow {
  id: string
  company_id: string
  project_id: string
  level: EvidenceRecord['level']
  derivation: EvidenceRecord['derivation']
  kind: string
  subject_user_id: string | null
  data: JsonObject
  created_by_type: 'SYSTEM' | 'USER' | 'AGENT'
  created_by_id: string | null
  created_at: string | Date
}

export function mapEvidenceRecord<TData extends JsonObject>(row: EvidenceRecordRow): EvidenceRecord<TData> {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    level: row.level,
    derivation: row.derivation,
    kind: row.kind,
    ...(row.subject_user_id ? { subjectUserId: row.subject_user_id } : {}),
    data: row.data as TData,
    createdBy: row.created_by_type === 'SYSTEM'
      ? { type: 'SYSTEM' }
      : { type: row.created_by_type, id: row.created_by_id! },
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function findEvidenceRecord(
  db: Queryable,
  scope: { companyId: string; projectId: string; id: string },
): Promise<EvidenceRecord | null> {
  const { rows } = await db.query<EvidenceRecordRow>(
    `SELECT * FROM evidence_records WHERE company_id=$1 AND project_id=$2 AND id=$3`,
    [scope.companyId, scope.projectId, scope.id],
  )
  return rows[0] ? mapEvidenceRecord(rows[0]) : null
}

export async function insertEvidenceRecord<TData extends JsonObject>(
  db: Queryable,
  input: CreateEvidenceRecordInput<TData>,
): Promise<EvidenceRecord<TData>> {
  const { rows } = await db.query<EvidenceRecordRow>(
    `INSERT INTO evidence_records(
       id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING *`,
    [input.id, input.companyId, input.projectId, input.level, input.derivation, input.kind,
      input.subjectUserId ?? null, JSON.stringify(input.data), input.createdBy.type,
      input.createdBy.type === 'SYSTEM' ? null : input.createdBy.id],
  )
  return mapEvidenceRecord<TData>(rows[0]!)
}

export async function evidenceTargetExists(
  db: Queryable,
  scope: { companyId: string; projectId: string; targetKind: EvidenceLinkInput['targetKind']; targetId: string },
): Promise<boolean> {
  const statements: Record<EvidenceLinkInput['targetKind'], string> = {
    DOMAIN_EVENT: `SELECT 1 FROM domain_events WHERE company_id=$1 AND project_id=$2 AND id=$3`,
    LEARNING_ATTEMPT: `SELECT 1 FROM learning_attempts WHERE company_id=$1 AND project_id=$2 AND id=$3`,
    LEARNING_EVALUATION: `SELECT 1 FROM learning_evaluations WHERE company_id=$1 AND project_id=$2 AND id=$3`,
    CANVAS_REPORT: `SELECT 1 FROM canvas_assignment_reports report
      JOIN canvases canvas ON canvas.id=report.canvas_id AND canvas.company_id=report.company_id
      WHERE report.company_id=$1 AND canvas.project_id=$2 AND report.id=$3`,
    AUDIT_EVENT: `SELECT 1 FROM audit_events
      WHERE company_id=$1 AND detail->>'projectId'=$2 AND id::text=$3`,
    AGENT_RUN: `SELECT 1 FROM agent_runs
      WHERE company_id=$1 AND $2::text IS NOT NULL AND id=$3`,
    EVIDENCE_RECORD: `SELECT 1 FROM evidence_records WHERE company_id=$1 AND project_id=$2 AND id=$3`,
  }
  const { rows } = await db.query(statements[scope.targetKind], [
    scope.companyId, scope.projectId, scope.targetId,
  ])
  return Boolean(rows[0])
}

export async function insertEvidenceLink(
  db: Queryable,
  input: { id: string; companyId: string; projectId: string; evidenceId: string; link: EvidenceLinkInput },
): Promise<void> {
  await db.query(
    `INSERT INTO evidence_links(
       id,company_id,project_id,evidence_id,relation,target_level,target_kind,target_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(company_id,project_id,evidence_id,relation,target_kind,target_id) DO NOTHING`,
    [input.id, input.companyId, input.projectId, input.evidenceId, input.link.relation,
      input.link.targetLevel, input.link.targetKind, input.link.targetId],
  )
}

export async function modelRunBelongsToCompany(
  db: Queryable,
  companyId: string,
  modelRunId: string,
): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM agent_runs WHERE company_id=$1 AND id=$2`, [companyId, modelRunId])
  return Boolean(rows[0])
}

export async function countScopedEvidenceRecords(
  db: Queryable,
  input: { companyId: string; projectId: string; evidenceIds: string[] },
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM evidence_records
      WHERE company_id=$1 AND project_id=$2 AND id=ANY($3::text[])`,
    [input.companyId, input.projectId, input.evidenceIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function insertEvidenceClaim(db: Queryable, input: CreateEvidenceClaimInput): Promise<void> {
  await db.query(
    `INSERT INTO evidence_claims(
       id,company_id,project_id,subject_user_id,claim_type,statement,model_run_id,human_review_required
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
    [input.id, input.companyId, input.projectId, input.subjectUserId ?? null,
      input.claimType, input.statement, input.modelRunId],
  )
  await db.query(
    `INSERT INTO evidence_claim_evidence(company_id,project_id,claim_id,evidence_id)
     SELECT $1,$2,$3,evidence_id FROM unnest($4::text[]) evidence_id`,
    [input.companyId, input.projectId, input.id, input.evidenceIds],
  )
}

export async function listEvidenceChainRecords(
  db: Queryable,
  input: {
    companyId: string
    projectId: string
    subjectUserId?: string
    recordLevels: EvidenceRecord['level'][]
    linkLevels: string[]
    limit: number
  },
): Promise<EvidenceChainRecord[]> {
  if (input.recordLevels.length === 0) return []
  const { rows } = await db.query<EvidenceRecordRow & { links: EvidenceChainRecord['links'] }>(
    `SELECT record.*,
            COALESCE(jsonb_agg(jsonb_build_object(
              'relation',link.relation,'targetLevel',link.target_level,
              'targetKind',link.target_kind,'targetId',link.target_id
            ) ORDER BY link.created_at) FILTER(WHERE link.id IS NOT NULL),'[]'::jsonb) AS links
       FROM evidence_records record
       LEFT JOIN evidence_links link
         ON link.company_id=record.company_id AND link.project_id=record.project_id
        AND link.evidence_id=record.id AND link.target_level=ANY($5::text[])
      WHERE record.company_id=$1 AND record.project_id=$2
        AND ($3::text IS NULL OR record.subject_user_id=$3)
        AND record.level=ANY($4::text[])
      GROUP BY record.id
      ORDER BY record.created_at DESC
      LIMIT $6`,
    [input.companyId, input.projectId, input.subjectUserId ?? null,
      input.recordLevels, input.linkLevels, input.limit],
  )
  return rows.map((row) => ({ ...mapEvidenceRecord(row), links: row.links ?? [] }))
}
