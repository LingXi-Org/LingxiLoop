import type { Queryable } from '../../db/queryable.js'
import type {
  LearningActivityType,
  LearningAssistance,
  LearningStateStatus,
} from './types.js'

export type LearningEvaluationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'

export async function insertLearningEvaluation(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    attemptId: string
    demonstratedLevel: number
    confidence: number
    rubricResults: unknown[]
    feedback: string
    evaluatorId: string
    status: 'PENDING' | 'ACCEPTED'
    sourceEvidenceId?: string
    verifierEvidenceId?: string
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_evaluations
       (id,company_id,project_id,attempt_id,demonstrated_level,confidence,rubric_results,feedback,
        evaluator_id,evaluator_kind,status,source_evidence_id,verifier_evidence_id)
     SELECT $1,attempt.company_id,attempt.project_id,attempt.id,$5,$6,$7::jsonb,$8,$9,'AGENT',$10,$11,$12
       FROM learning_attempts attempt
      WHERE attempt.id=$4 AND attempt.company_id=$2 AND attempt.project_id=$3`,
    [
      args.id,
      args.companyId,
      args.projectId,
      args.attemptId,
      args.demonstratedLevel,
      args.confidence,
      JSON.stringify(args.rubricResults),
      args.feedback,
      args.evaluatorId,
      args.status,
      args.sourceEvidenceId ?? null,
      args.verifierEvidenceId ?? null,
    ],
  )
  return Boolean(result.rowCount)
}

/** Returns accepted, independent sources already counted for one unit. The
 * current evaluation is excluded so its qualified source can be compared. */
export async function independentLearningEvidenceKeys(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    userId: string
    knowledgeUnitId: string
    evaluationId: string
  },
): Promise<string[]> {
  const { rows } = await db.query<{ evidence_key: string | null }>(
    `SELECT DISTINCT CASE
              WHEN attempt.activity_id IS NOT NULL THEN 'ACTIVITY:' || attempt.activity_id
              WHEN attempt.mission_step_id IS NOT NULL THEN 'MISSION_STEP:' || attempt.mission_step_id
            END AS evidence_key
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
        AND attempt.project_id=evaluation.project_id
       LEFT JOIN learning_activity_knowledge_units activity_unit
         ON activity_unit.company_id=attempt.company_id AND activity_unit.project_id=attempt.project_id
        AND activity_unit.activity_id=attempt.activity_id
       LEFT JOIN learning_mission_steps step
         ON step.company_id=attempt.company_id AND step.project_id=attempt.project_id
        AND step.id=attempt.mission_step_id
      WHERE evaluation.company_id=$1 AND evaluation.project_id=$2 AND attempt.learner_id=$3
        AND evaluation.status='ACCEPTED' AND attempt.assistance='NONE'
        AND evaluation.demonstrated_level>=3 AND evaluation.id<>$5
        AND (activity_unit.knowledge_unit_id=$4 OR step.knowledge_unit_id=$4)`,
    [
      args.companyId,
      args.projectId,
      args.userId,
      args.knowledgeUnitId,
      args.evaluationId,
    ],
  )
  return rows.map((row) => row.evidence_key).filter((value): value is string => Boolean(value))
}

export async function learningEvaluationEvidenceKey(
  db: Queryable,
  args: { companyId: string; projectId: string; evaluationId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ evidence_key: string | null }>(
    `SELECT CASE
              WHEN attempt.activity_id IS NOT NULL THEN 'ACTIVITY:' || attempt.activity_id
              WHEN attempt.mission_step_id IS NOT NULL THEN 'MISSION_STEP:' || attempt.mission_step_id
            END AS evidence_key
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
        AND attempt.project_id=evaluation.project_id
      WHERE evaluation.id=$1 AND evaluation.company_id=$2 AND evaluation.project_id=$3`,
    [args.evaluationId, args.companyId, args.projectId],
  )
  return rows[0]?.evidence_key ?? null
}

export interface LockedLearningState {
  level: number
  independentEvidenceCount: number
  reviewIntervalDays: number
}

/** Serializes projections even before the first LearningState row exists, then
 * locks the row when present. Call only inside the owning transaction. */
export async function lockLearningState(
  db: Queryable,
  args: { companyId: string; projectId: string; userId: string; knowledgeUnitId: string },
): Promise<LockedLearningState> {
  const params = [args.companyId, args.projectId, args.userId, args.knowledgeUnitId]
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(
       jsonb_build_array($1::text,$2::text,$3::text,$4::text)::text,0
     ))`,
    params,
  )
  const { rows } = await db.query<{
    level: number
    independent_evidence_count: number
    review_interval_days: number
  }>(
    `SELECT state.level,state.independent_evidence_count,state.review_interval_days
       FROM learning_states state
      WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
        AND state.knowledge_unit_id=$4
      FOR UPDATE`,
    params,
  )
  const row = rows[0]
  return row ? {
    level: Number(row.level),
    independentEvidenceCount: Number(row.independent_evidence_count),
    reviewIntervalDays: Number(row.review_interval_days),
  } : { level: 0, independentEvidenceCount: 0, reviewIntervalDays: 1 }
}

export async function upsertLearningState(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    userId: string
    knowledgeUnitId: string
    level: number
    status: LearningStateStatus
    independentEvidenceCount: number
    reviewIntervalDays: number
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_states
       (project_id,user_id,knowledge_unit_id,company_id,level,status,independent_evidence_count,
        review_interval_days,next_review_at,last_evidence_at)
     SELECT unit.project_id,member.user_id,unit.id,unit.company_id,$5,$6,$7,$8,
            NOW()+($8::int * INTERVAL '1 day'),NOW()
       FROM learning_knowledge_units unit
       JOIN project_memberships member
         ON member.company_id=unit.company_id AND member.project_id=unit.project_id
        AND member.user_id=$3
      WHERE unit.company_id=$1 AND unit.project_id=$2 AND unit.id=$4
     ON CONFLICT(project_id,user_id,knowledge_unit_id) DO UPDATE SET
       level=EXCLUDED.level,status=EXCLUDED.status,
       independent_evidence_count=EXCLUDED.independent_evidence_count,
       review_interval_days=EXCLUDED.review_interval_days,
       next_review_at=EXCLUDED.next_review_at,last_evidence_at=EXCLUDED.last_evidence_at,
       version=learning_states.version+1,updated_at=NOW()
     WHERE learning_states.company_id=EXCLUDED.company_id`,
    [
      args.companyId,
      args.projectId,
      args.userId,
      args.knowledgeUnitId,
      args.level,
      args.status,
      args.independentEvidenceCount,
      args.reviewIntervalDays,
    ],
  )
  return Boolean(result.rowCount)
}

export async function markLearningAttemptEvaluated(
  db: Queryable,
  args: { companyId: string; projectId: string; attemptId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_attempts SET status='EVALUATED'
      WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [args.attemptId, args.companyId, args.projectId],
  )
  return Boolean(result.rowCount)
}

export interface PendingLearningEvaluation {
  attemptId: string
  demonstratedLevel: number
  confidence: number
  userId: string
  assistance: LearningAssistance
  activityType: LearningActivityType | null
  targetLevel: number
  knowledgeUnitIds: string[]
}

export async function lockPendingLearningEvaluation(
  db: Queryable,
  args: { companyId: string; projectId: string; evaluationId: string },
): Promise<PendingLearningEvaluation | null> {
  const { rows } = await db.query<{
    attempt_id: string
    demonstrated_level: number
    confidence: number
    learner_id: string
    assistance: LearningAssistance
    activity_type: LearningActivityType | null
    target_level: number
    knowledge_unit_ids: string[]
  }>(
    `SELECT evaluation.attempt_id,evaluation.demonstrated_level,evaluation.confidence,
            attempt.learner_id,attempt.assistance,activity.kind AS activity_type,
            COALESCE(activity.target_level,step_unit.target_level,2) AS target_level,
            CASE WHEN activity.id IS NOT NULL THEN COALESCE((
              SELECT array_agg(link.knowledge_unit_id ORDER BY link.knowledge_unit_id)
                FROM learning_activity_knowledge_units link
               WHERE link.company_id=attempt.company_id AND link.project_id=attempt.project_id
                 AND link.activity_id=activity.id
            ),'{}'::text[])
            WHEN step.knowledge_unit_id IS NOT NULL THEN ARRAY[step.knowledge_unit_id]
            ELSE '{}'::text[] END AS knowledge_unit_ids
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
        AND attempt.project_id=evaluation.project_id
       LEFT JOIN learning_activities activity
         ON activity.id=attempt.activity_id AND activity.company_id=attempt.company_id
        AND activity.project_id=attempt.project_id
       LEFT JOIN learning_mission_steps step
         ON step.id=attempt.mission_step_id AND step.company_id=attempt.company_id
        AND step.project_id=attempt.project_id
       LEFT JOIN learning_knowledge_units step_unit
         ON step_unit.id=step.knowledge_unit_id AND step_unit.company_id=step.company_id
        AND step_unit.project_id=step.project_id
      WHERE evaluation.id=$1 AND evaluation.company_id=$2 AND evaluation.project_id=$3
        AND evaluation.status='PENDING'
      FOR UPDATE OF evaluation`,
    [args.evaluationId, args.companyId, args.projectId],
  )
  const row = rows[0]
  return row ? {
    attemptId: row.attempt_id,
    demonstratedLevel: Number(row.demonstrated_level),
    confidence: Number(row.confidence),
    userId: row.learner_id,
    assistance: row.assistance,
    activityType: row.activity_type,
    targetLevel: Number(row.target_level),
    knowledgeUnitIds: (row.knowledge_unit_ids ?? []).map(String),
  } : null
}

export async function reviewLearningEvaluationRecord(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    evaluationId: string
    status: 'ACCEPTED' | 'REJECTED'
    reason: string
    reviewerId: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_evaluations evaluation
        SET status=$4,review_reason=$5,reviewed_by=$6,reviewed_at=NOW()
      WHERE evaluation.id=$3 AND evaluation.company_id=$1 AND evaluation.project_id=$2
        AND evaluation.status='PENDING'`,
    [
      args.companyId,
      args.projectId,
      args.evaluationId,
      args.status,
      args.reason,
      args.reviewerId,
    ],
  )
  return Boolean(result.rowCount)
}
