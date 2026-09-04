import type { Queryable } from '../../db/queryable.js'
import type {
  LearningCaseActionKind,
  LearningCaseStatus,
} from '../../domain/public.js'

export interface LearningCaseRecord {
  id: string
  projectId: string
  learnerId: string
  knowledgeUnitId: string
  status: LearningCaseStatus
  reason: string
  summary: string
  version: number
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
}

export type LearningCaseActionResult = 'APPLIED' | 'ALREADY_APPLIED'

export interface LearningCaseActionRecord {
  id: string
  caseId: string
  learnerId: string
  knowledgeUnitId: string
  kind: LearningCaseActionKind
  result: LearningCaseActionResult
  fromStatus: LearningCaseStatus
  toStatus: LearningCaseStatus
  caseVersion: number
  idempotencyKey: string
  actorId: string
  reason: string
  activityId: string | null
  missionId: string | null
  attemptId: string | null
  evaluationId: string | null
  createdAt: string
}

interface LearningCaseRow {
  id: string
  project_id: string
  user_id: string
  knowledge_unit_id: string
  status: LearningCaseStatus
  reason: string
  summary: string
  version: number
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

interface LearningCaseActionRow {
  id: string
  case_id: string
  user_id: string
  knowledge_unit_id: string
  kind: LearningCaseActionKind
  result: LearningCaseActionResult
  from_status: LearningCaseStatus
  to_status: LearningCaseStatus
  case_version: number
  idempotency_key: string
  actor_id: string
  reason: string
  activity_id: string | null
  mission_id: string | null
  attempt_id: string | null
  evaluation_id: string | null
  created_at: string
}

const learningCaseColumns = `learning_case.id,learning_case.project_id,learning_case.user_id,
  learning_case.knowledge_unit_id,learning_case.status,learning_case.reason,learning_case.summary,
  learning_case.version,learning_case.created_at,learning_case.updated_at,learning_case.resolved_at,
  learning_case.closed_at`

const learningCaseActionColumns = `case_action.id,case_action.case_id,case_action.user_id,
  case_action.knowledge_unit_id,case_action.kind,case_action.result,case_action.from_status,
  case_action.to_status,case_action.case_version,case_action.idempotency_key,case_action.actor_id,
  case_action.reason,case_action.activity_id,case_action.mission_id,case_action.attempt_id,
  case_action.evaluation_id,case_action.created_at`

function mapLearningCase(row: LearningCaseRow): LearningCaseRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    learnerId: row.user_id,
    knowledgeUnitId: row.knowledge_unit_id,
    status: row.status,
    reason: row.reason,
    summary: row.summary,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
  }
}

function mapLearningCaseAction(row: LearningCaseActionRow): LearningCaseActionRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    learnerId: row.user_id,
    knowledgeUnitId: row.knowledge_unit_id,
    kind: row.kind,
    result: row.result,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    caseVersion: Number(row.case_version),
    idempotencyKey: row.idempotency_key,
    actorId: row.actor_id,
    reason: row.reason,
    activityId: row.activity_id,
    missionId: row.mission_id,
    attemptId: row.attempt_id,
    evaluationId: row.evaluation_id,
    createdAt: String(row.created_at),
  }
}

interface LearningCaseReadScope {
  companyId: string
  projectId: string
  learnerFilterId: string | null
}

interface LearningCaseListScope extends LearningCaseReadScope {
  status?: LearningCaseStatus
  knowledgeUnitId?: string
  limit?: number
}

export async function listLearningCases(
  db: Queryable,
  scope: LearningCaseListScope,
): Promise<LearningCaseRecord[]> {
  const requestedLimit = scope.limit ?? 100
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 100
  const { rows } = await db.query<LearningCaseRow>(
    `SELECT ${learningCaseColumns} FROM learning_cases learning_case
      WHERE learning_case.company_id=$1 AND learning_case.project_id=$2
        AND ($3::text IS NULL OR learning_case.user_id=$3)
        AND ($4::text IS NULL OR learning_case.status=$4)
        AND ($5::text IS NULL OR learning_case.knowledge_unit_id=$5)
      ORDER BY learning_case.updated_at DESC,learning_case.id LIMIT $6`,
    [scope.companyId, scope.projectId, scope.learnerFilterId, scope.status ?? null,
      scope.knowledgeUnitId ?? null, limit],
  )
  return rows.map(mapLearningCase)
}

export async function findLearningCase(
  db: Queryable,
  scope: LearningCaseReadScope & { caseId: string },
): Promise<LearningCaseRecord | null> {
  const { rows } = await db.query<LearningCaseRow>(
    `SELECT ${learningCaseColumns} FROM learning_cases learning_case
      WHERE learning_case.company_id=$1 AND learning_case.project_id=$2 AND learning_case.id=$3
        AND ($4::text IS NULL OR learning_case.user_id=$4)`,
    [scope.companyId, scope.projectId, scope.caseId, scope.learnerFilterId],
  )
  return rows[0] ? mapLearningCase(rows[0]) : null
}

export async function findLearningCaseDetail(
  db: Queryable,
  scope: LearningCaseReadScope & { caseId: string },
): Promise<{ learningCase: LearningCaseRecord; actions: LearningCaseActionRecord[] } | null> {
  const learningCase = await findLearningCase(db, scope)
  if (!learningCase) return null
  const { rows } = await db.query<LearningCaseActionRow>(
    `SELECT ${learningCaseActionColumns} FROM learning_case_actions case_action
      WHERE case_action.company_id=$1 AND case_action.project_id=$2 AND case_action.case_id=$3
        AND ($4::text IS NULL OR case_action.user_id=$4)
      ORDER BY case_action.created_at DESC,case_action.id DESC LIMIT 100`,
    [scope.companyId, scope.projectId, scope.caseId, scope.learnerFilterId],
  )
  return { learningCase, actions: rows.map(mapLearningCaseAction) }
}

async function findOpenLearningCase(
  db: Queryable,
  args: { companyId: string; projectId: string; learnerId: string; knowledgeUnitId: string },
): Promise<LearningCaseRecord | null> {
  const { rows } = await db.query<LearningCaseRow>(
    `SELECT ${learningCaseColumns} FROM learning_cases learning_case
      JOIN projects project
        ON project.company_id=learning_case.company_id AND project.id=learning_case.project_id
      JOIN project_memberships member
        ON member.company_id=learning_case.company_id AND member.project_id=learning_case.project_id
       AND member.user_id=learning_case.user_id AND member.status='ACTIVE'
      WHERE learning_case.company_id=$1 AND learning_case.project_id=$2 AND learning_case.user_id=$3
        AND learning_case.knowledge_unit_id=$4 AND learning_case.status<>'CLOSED'
        AND ((project.kind='PERSONAL_LEARNING' AND member.role='OWNER')
          OR (project.kind IN ('TEACHING','INSTITUTIONAL_COURSE')
            AND member.role IN ('STUDENT','OBSERVER')))
      LIMIT 1`,
    [args.companyId, args.projectId, args.learnerId, args.knowledgeUnitId],
  )
  return rows[0] ? mapLearningCase(rows[0]) : null
}

export async function insertOrFindOpenLearningCase(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    learnerId: string
    knowledgeUnitId: string
    reason: string
    summary: string
  },
): Promise<{ learningCase: LearningCaseRecord; created: boolean } | null> {
  const { rows } = await db.query<LearningCaseRow>(
    `INSERT INTO learning_cases
       (id,company_id,project_id,user_id,knowledge_unit_id,status,reason,summary)
     SELECT $1,unit.company_id,unit.project_id,member.user_id,unit.id,'DETECTED',$6,$7
       FROM learning_knowledge_units unit
       JOIN projects project
         ON project.company_id=unit.company_id AND project.id=unit.project_id
       JOIN project_memberships member
         ON member.company_id=unit.company_id AND member.project_id=unit.project_id
        AND member.user_id=$4 AND member.status='ACTIVE'
      WHERE unit.company_id=$2 AND unit.project_id=$3 AND unit.id=$5
        AND ((project.kind='PERSONAL_LEARNING' AND member.role='OWNER')
          OR (project.kind IN ('TEACHING','INSTITUTIONAL_COURSE')
            AND member.role IN ('STUDENT','OBSERVER')))
     ON CONFLICT(project_id,user_id,knowledge_unit_id) WHERE status<>'CLOSED' DO NOTHING
     RETURNING id,project_id,user_id,knowledge_unit_id,status,reason,summary,version,created_at,
               updated_at,resolved_at,closed_at`,
    [args.id, args.companyId, args.projectId, args.learnerId, args.knowledgeUnitId, args.reason, args.summary],
  )
  if (rows[0]) return { learningCase: mapLearningCase(rows[0]), created: true }

  // A second statement gets a fresh READ COMMITTED snapshot after waiting on a
  // concurrent unique-index contender; a same-statement UNION can miss it.
  const existing = await findOpenLearningCase(db, args)
  return existing ? { learningCase: existing, created: false } : null
}

export async function lockLearningCase(
  db: Queryable,
  scope: LearningCaseReadScope & { caseId: string },
): Promise<LearningCaseRecord | null> {
  const { rows } = await db.query<LearningCaseRow>(
    `SELECT ${learningCaseColumns} FROM learning_cases learning_case
      WHERE learning_case.company_id=$1 AND learning_case.project_id=$2 AND learning_case.id=$3
        AND ($4::text IS NULL OR learning_case.user_id=$4)
      FOR UPDATE`,
    [scope.companyId, scope.projectId, scope.caseId, scope.learnerFilterId],
  )
  return rows[0] ? mapLearningCase(rows[0]) : null
}

export async function findLearningCaseActionByIdempotencyKey(
  db: Queryable,
  args: { companyId: string; projectId: string; idempotencyKey: string },
): Promise<LearningCaseActionRecord | null> {
  const { rows } = await db.query<LearningCaseActionRow>(
    `SELECT ${learningCaseActionColumns} FROM learning_case_actions case_action
      WHERE case_action.company_id=$1 AND case_action.project_id=$2
        AND case_action.idempotency_key=$3`,
    [args.companyId, args.projectId, args.idempotencyKey],
  )
  return rows[0] ? mapLearningCaseAction(rows[0]) : null
}

export async function learningCaseActionLinksAreValid(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    learnerId: string
    activityId?: string
    missionId?: string
    attemptId?: string
    evaluationId?: string
  },
): Promise<boolean> {
  const { rows } = await db.query<{ valid: boolean }>(
    `SELECT
       ($4::text IS NULL OR EXISTS(
         SELECT 1 FROM learning_activities activity
          WHERE activity.company_id=$1 AND activity.project_id=$2 AND activity.id=$4
       )) AND
       ($5::text IS NULL OR EXISTS(
         SELECT 1 FROM learning_missions mission
          WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.id=$5
            AND mission.learner_id=$3
       )) AND
       ($6::text IS NULL OR EXISTS(
         SELECT 1 FROM learning_attempts attempt
          WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.id=$6
            AND attempt.learner_id=$3
       )) AND
       ($7::text IS NULL OR EXISTS(
         SELECT 1 FROM learning_evaluations evaluation
         JOIN learning_attempts attempt
           ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
          AND attempt.project_id=evaluation.project_id
          WHERE evaluation.company_id=$1 AND evaluation.project_id=$2 AND evaluation.id=$7
            AND attempt.learner_id=$3 AND ($6::text IS NULL OR attempt.id=$6)
       )) AS valid`,
    [args.companyId, args.projectId, args.learnerId, args.activityId ?? null, args.missionId ?? null,
      args.attemptId ?? null, args.evaluationId ?? null],
  )
  return rows[0]?.valid === true
}

export async function updateLearningCaseRecord(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    caseId: string
    expectedVersion: number
    fromStatus: LearningCaseStatus
    toStatus: LearningCaseStatus
    summary?: string
  },
): Promise<LearningCaseRecord | null> {
  const { rows } = await db.query<LearningCaseRow>(
    `UPDATE learning_cases learning_case
        SET status=$6,summary=COALESCE($7,learning_case.summary),version=learning_case.version+1,
            updated_at=NOW(),
            resolved_at=CASE WHEN $6='RESOLVED' THEN COALESCE(learning_case.resolved_at,NOW())
                             ELSE learning_case.resolved_at END,
            closed_at=CASE WHEN $6='CLOSED' THEN COALESCE(learning_case.closed_at,NOW())
                           ELSE learning_case.closed_at END
      WHERE learning_case.company_id=$1 AND learning_case.project_id=$2 AND learning_case.id=$3
        AND learning_case.version=$4 AND learning_case.status=$5
      RETURNING id,project_id,user_id,knowledge_unit_id,status,reason,summary,version,created_at,
                updated_at,resolved_at,closed_at`,
    [args.companyId, args.projectId, args.caseId, args.expectedVersion, args.fromStatus, args.toStatus,
      args.summary ?? null],
  )
  return rows[0] ? mapLearningCase(rows[0]) : null
}

export async function appendLearningCaseAction(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    caseId: string
    kind: LearningCaseActionKind
    result: LearningCaseActionResult
    fromStatus: LearningCaseStatus
    toStatus: LearningCaseStatus
    caseVersion: number
    idempotencyKey: string
    actorId: string
    reason: string
    activityId?: string
    missionId?: string
    attemptId?: string
    evaluationId?: string
  },
): Promise<LearningCaseActionRecord | null> {
  const { rows } = await db.query<LearningCaseActionRow>(
    `INSERT INTO learning_case_actions
       (id,company_id,project_id,case_id,user_id,knowledge_unit_id,kind,result,from_status,to_status,
        case_version,idempotency_key,actor_id,reason,activity_id,mission_id,attempt_id,evaluation_id)
     SELECT $1,learning_case.company_id,learning_case.project_id,learning_case.id,learning_case.user_id,
            learning_case.knowledge_unit_id,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
       FROM learning_cases learning_case
      WHERE learning_case.company_id=$2 AND learning_case.project_id=$3 AND learning_case.id=$4
        AND learning_case.status=$8 AND learning_case.version=$9
     RETURNING id,case_id,user_id,knowledge_unit_id,kind,result,from_status,to_status,case_version,
               idempotency_key,actor_id,reason,activity_id,mission_id,attempt_id,evaluation_id,created_at`,
    [args.id, args.companyId, args.projectId, args.caseId, args.kind, args.result, args.fromStatus,
      args.toStatus, args.caseVersion, args.idempotencyKey, args.actorId, args.reason,
      args.activityId ?? null, args.missionId ?? null, args.attemptId ?? null, args.evaluationId ?? null],
  )
  return rows[0] ? mapLearningCaseAction(rows[0]) : null
}
