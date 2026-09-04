import type { Queryable } from '../../db/queryable.js'
import type { AttentionStatus } from '../../domain/attention/public.js'
import type { AttentionItem, AttentionReason } from './contracts.js'

interface AttentionItemRow {
  id: string
  company_id: string
  project_id: string
  teacher_user_id: string
  case_id: string
  learner_user_id: string
  knowledge_unit_id: string
  reason: AttentionReason
  status: AttentionStatus
  source_event_sequence: string
  rule_version: string
  rank_score: number
  expected_minutes: number
  occurrence_count: number
  version: number
  deferred_until: string | null
  resolution_reason: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

function item(row: AttentionItemRow): AttentionItem {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    teacherUserId: row.teacher_user_id,
    caseId: row.case_id,
    learnerUserId: row.learner_user_id,
    knowledgeUnitId: row.knowledge_unit_id,
    reason: row.reason,
    status: row.status,
    sourceEventSequence: row.source_event_sequence,
    ruleVersion: row.rule_version,
    rankScore: row.rank_score,
    expectedMinutes: row.expected_minutes,
    occurrenceCount: row.occurrence_count,
    version: Number(row.version),
    deferredUntil: row.deferred_until,
    resolutionReason: row.resolution_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  }
}

const ITEM_COLUMNS = `id,company_id,project_id,teacher_user_id,case_id,learner_user_id,
  knowledge_unit_id,reason,status,source_event_sequence,rule_version,rank_score,
  expected_minutes,occurrence_count,version,deferred_until,resolution_reason,
  created_at,updated_at,resolved_at`

export async function listTeacherAttentionItems(db: Queryable, args: {
  companyId: string; projectId: string; teacherUserId: string; includeTerminal?: boolean
}): Promise<AttentionItem[]> {
  const { rows } = await db.query<AttentionItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM attention_items
      WHERE company_id=$1 AND project_id=$2 AND teacher_user_id=$3
        AND ($4::boolean OR status NOT IN ('RESOLVED','DISMISSED'))
      ORDER BY rank_score DESC,source_event_sequence,id
      LIMIT 200`,
    [args.companyId, args.projectId, args.teacherUserId, args.includeTerminal === true],
  )
  return rows.map(item)
}

export async function lockTeacherAttentionItem(db: Queryable, args: {
  companyId: string; projectId: string; teacherUserId: string; itemId: string
}): Promise<AttentionItem | null> {
  const { rows } = await db.query<AttentionItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM attention_items
      WHERE company_id=$1 AND project_id=$2 AND teacher_user_id=$3 AND id=$4
      FOR UPDATE`,
    [args.companyId, args.projectId, args.teacherUserId, args.itemId],
  )
  return rows[0] ? item(rows[0]) : null
}

export async function updateAttentionItemStatus(db: Queryable, args: {
  itemId: string
  status: AttentionStatus
  deferredUntil: Date | null
  resolutionReason: string | null
}): Promise<AttentionItem> {
  const terminal = args.status === 'RESOLVED' || args.status === 'DISMISSED'
  const { rows } = await db.query<AttentionItemRow>(
    `UPDATE attention_items SET
       status=$2,deferred_until=$3,resolution_reason=$4,
       resolved_at=CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
       version=version+1,updated_at=NOW()
     WHERE id=$1 RETURNING ${ITEM_COLUMNS}`,
    [args.itemId, args.status, args.deferredUntil, args.resolutionReason, terminal],
  )
  const row = rows[0]
  if (!row) throw new Error('Attention Item disappeared while locked')
  return item(row)
}

export async function listBriefingAttentionItemIds(db: Queryable, args: {
  companyId: string; projectId: string; teacherUserId: string
  afterSequence: number; throughSequence: number; limit?: number
}): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM attention_items
      WHERE company_id=$1 AND project_id=$2 AND teacher_user_id=$3
        AND source_event_sequence>$4 AND source_event_sequence<=$5
      ORDER BY rank_score DESC,source_event_sequence,id
      LIMIT $6`,
    [args.companyId, args.projectId, args.teacherUserId,
      args.afterSequence, args.throughSequence, args.limit ?? 50],
  )
  return rows.map((row) => row.id)
}
