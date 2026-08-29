import type { Queryable } from '../../db/queryable.js'

export async function insertLearningEvaluation(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; attemptId: string; demonstratedLevel: number
    confidence: number; rubricResults: unknown[]; feedback: string; evaluatorId: string
    status: 'accepted'|'pending'; sourceReportId?: string; verifierReportId?: string
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_evaluations
       (id,attempt_id,demonstrated_level,confidence,rubric_results,feedback,evaluator_id,evaluator_kind,
        status,source_report_id,verifier_report_id)
     SELECT $1,attempt.id,$5,$6,$7::jsonb,$8,$9,'agent',$10,$11,$12
       FROM learning_attempts attempt
      WHERE attempt.id=$4 AND attempt.company_id=$2 AND attempt.course_id=$3`,
    [args.id,args.companyId,args.courseId,args.attemptId,args.demonstratedLevel,args.confidence,
      JSON.stringify(args.rubricResults),args.feedback,args.evaluatorId,args.status,
      args.sourceReportId ?? null,args.verifierReportId ?? null],
  )
  return Boolean(result.rowCount)
}

export async function independentLearningEvidenceKeys(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; objectiveId: string },
): Promise<string[]> {
  const { rows } = await db.query<{ evidence_key: string | null }>(
    `SELECT DISTINCT COALESCE(attempt.activity_id,attempt.mission_step_id) AS evidence_key
       FROM learning_mastery_events event
       JOIN learning_evaluations evaluation ON evaluation.id=event.evaluation_id
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE event.company_id=$1 AND event.course_id=$2 AND event.learner_id=$3 AND event.objective_id=$4
        AND evaluation.status='accepted' AND attempt.assistance='none' AND evaluation.demonstrated_level>=3`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveId],
  )
  return rows.map((row) => row.evidence_key).filter((value): value is string => Boolean(value))
}

export async function learningEvaluationEvidenceKey(
  db: Queryable,
  args: { companyId: string; courseId: string; evaluationId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ evidence_key: string | null }>(
    `SELECT COALESCE(attempt.activity_id,attempt.mission_step_id) AS evidence_key
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE evaluation.id=$1 AND attempt.company_id=$2 AND attempt.course_id=$3`,
    [args.evaluationId,args.companyId,args.courseId],
  )
  return rows[0]?.evidence_key ?? null
}

export async function lockLearningMastery(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; objectiveId: string },
): Promise<{ level: number; independentEvidenceCount: number; reviewIntervalDays: number }> {
  const { rows } = await db.query<{
    level: number; independent_evidence_count: number; review_interval_days: number
  }>(
    `SELECT mastery.level,mastery.independent_evidence_count,mastery.review_interval_days
       FROM learning_mastery mastery
      WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3
        AND mastery.objective_id=$4 FOR UPDATE`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveId],
  )
  return rows[0] ? {
    level: Number(rows[0].level), independentEvidenceCount: Number(rows[0].independent_evidence_count),
    reviewIntervalDays: Number(rows[0].review_interval_days),
  } : { level: 0, independentEvidenceCount: 0, reviewIntervalDays: 1 }
}

export async function upsertLearningMastery(
  db: Queryable,
  args: {
    companyId: string; courseId: string; learnerId: string; objectiveId: string; level: number
    status: string; independentEvidenceCount: number; reviewIntervalDays: number
  },
): Promise<void> {
  await db.query(
    `INSERT INTO learning_mastery
       (course_id,company_id,learner_id,objective_id,level,status,independent_evidence_count,
        review_interval_days,next_review_at)
     SELECT course.id,course.company_id,$3,$4,$5,$6,$7,$8,NOW()+($8::int * INTERVAL '1 day')
       FROM courses course WHERE course.id=$2 AND course.company_id=$1
     ON CONFLICT(course_id,learner_id,objective_id) DO UPDATE SET
       level=EXCLUDED.level,status=EXCLUDED.status,
       independent_evidence_count=EXCLUDED.independent_evidence_count,
       review_interval_days=EXCLUDED.review_interval_days,next_review_at=EXCLUDED.next_review_at,
       version=learning_mastery.version+1,updated_at=NOW()`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveId,args.level,args.status,
      args.independentEvidenceCount,args.reviewIntervalDays],
  )
}

export async function insertLearningMasteryEvent(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; learnerId: string; objectiveId: string
    evaluationId: string; previousLevel: number; nextLevel: number; kind: string; reason: string; actorId: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO learning_mastery_events
       (id,course_id,company_id,learner_id,objective_id,evaluation_id,previous_level,next_level,kind,reason,actor_id)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,$8,$9,$10,$11
       FROM courses course WHERE course.id=$3 AND course.company_id=$2`,
    [args.id,args.companyId,args.courseId,args.learnerId,args.objectiveId,args.evaluationId,
      args.previousLevel,args.nextLevel,args.kind,args.reason,args.actorId],
  )
}

export async function markLearningAttemptEvaluated(
  db: Queryable,
  args: { companyId: string; courseId: string; attemptId: string },
): Promise<void> {
  await db.query(
    `UPDATE learning_attempts SET status='evaluated'
      WHERE id=$1 AND company_id=$2 AND course_id=$3`,
    [args.attemptId,args.companyId,args.courseId],
  )
}

export interface PendingLearningEvaluation {
  attemptId: string
  demonstratedLevel: number
  confidence: number
  learnerId: string
  assistance: 'none'|'hint'|'guided'
  activityType: 'lesson'|'practice'|'assessment'|'project'|'review' | null
  targetLevel: number
  objectiveIds: string[]
}

export async function lockPendingLearningEvaluation(
  db: Queryable,
  args: { companyId: string; courseId: string; evaluationId: string },
): Promise<PendingLearningEvaluation | null> {
  const { rows } = await db.query<{
    attempt_id: string; demonstrated_level: number; confidence: number; learner_id: string
    assistance: PendingLearningEvaluation['assistance']; activity_type: PendingLearningEvaluation['activityType']
    target_level: number; objective_ids: string[]
  }>(
    `SELECT evaluation.attempt_id,evaluation.demonstrated_level,evaluation.confidence,
            attempt.learner_id,attempt.assistance,activity.type AS activity_type,
            COALESCE(activity.target_level,objective.target_level,2) AS target_level,
            COALESCE(activity.objective_ids,
              CASE WHEN step.objective_id IS NOT NULL THEN jsonb_build_array(step.objective_id) ELSE '[]'::jsonb END
            ) AS objective_ids
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.course_id=attempt.course_id
       LEFT JOIN learning_mission_steps step ON step.id=attempt.mission_step_id
       LEFT JOIN learning_missions mission ON mission.id=step.mission_id
         AND mission.company_id=attempt.company_id AND mission.course_id=attempt.course_id
       LEFT JOIN learning_objectives objective ON objective.id=step.objective_id
         AND objective.company_id=attempt.company_id AND objective.course_id=attempt.course_id
      WHERE evaluation.id=$1 AND attempt.company_id=$2 AND attempt.course_id=$3
        AND evaluation.status='pending' FOR UPDATE`,
    [args.evaluationId,args.companyId,args.courseId],
  )
  const row = rows[0]
  return row ? {
    attemptId: row.attempt_id, demonstratedLevel: Number(row.demonstrated_level),
    confidence: Number(row.confidence), learnerId: row.learner_id, assistance: row.assistance,
    activityType: row.activity_type, targetLevel: Number(row.target_level),
    objectiveIds: (row.objective_ids ?? []).map(String),
  } : null
}

export async function reviewLearningEvaluationRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; evaluationId: string; status: 'accepted'|'rejected'
    reason: string; teacherId: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_evaluations evaluation
        SET status=$4,review_reason=$5,reviewed_by=$6,reviewed_at=NOW()
       FROM learning_attempts attempt
      WHERE evaluation.id=$3 AND evaluation.attempt_id=attempt.id
        AND attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'`,
    [args.companyId,args.courseId,args.evaluationId,args.status,args.reason,args.teacherId],
  )
  return Boolean(result.rowCount)
}

