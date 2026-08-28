import type { Queryable } from '../../db/queryable.js'

export async function findLearningDocumentEvidence(
  db: Queryable,
  args: { companyId: string; projectId: string; documentId: string },
): Promise<{ id: string; revision: number; authorId: string } | null> {
  const { rows } = await db.query<{ id: string; revision: number; author_id: string }>(
    `SELECT document.id,COALESCE(MAX(document_update.id),0)::int AS revision,
            COALESCE((array_agg(document_update.author_id ORDER BY document_update.id DESC)
              FILTER(WHERE document_update.author_id IS NOT NULL))[1],document.created_by) AS author_id
       FROM documents document
       LEFT JOIN document_updates document_update ON document_update.document_id=document.id
      WHERE document.id=$1 AND document.company_id=$2 AND document.project_id=$3
      GROUP BY document.id`,
    [args.documentId,args.companyId,args.projectId],
  )
  const row = rows[0]
  return row ? { id: row.id, revision: Number(row.revision), authorId: row.author_id } : null
}

export async function findLearningCanvasEvidence(
  db: Queryable,
  args: { companyId: string; projectId: string; frameId: string },
): Promise<{ id: string; revision: number; authorId: string } | null> {
  const { rows } = await db.query<{ id: string; revision: number; updated_by: string }>(
    `SELECT frame.id,frame.revision,frame.updated_by
       FROM canvas_frames frame JOIN canvases canvas ON canvas.id=frame.canvas_id
      WHERE frame.id=$1 AND canvas.company_id=$2 AND canvas.project_id=$3`,
    [args.frameId,args.companyId,args.projectId],
  )
  const row = rows[0]
  return row ? { id: row.id, revision: Number(row.revision), authorId: row.updated_by } : null
}

export async function insertAgentLearningAttempt(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; channelId: string; learnerId: string
    activityId?: string; missionStepId?: string; assistance: 'none'|'hint'|'guided'
    evidence: Record<string, unknown>
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_attempts
       (id,course_id,company_id,learner_id,activity_id,mission_step_id,assistance,evidence)
     SELECT $1,course.id,course.company_id,$5,activity.id,step.id,$8,$9::jsonb
       FROM courses course
       LEFT JOIN learning_activities activity
         ON activity.id=$6 AND activity.course_id=course.id AND activity.company_id=course.company_id
           AND activity.status='published'
       LEFT JOIN learning_mission_steps step ON step.id=$7
       LEFT JOIN learning_missions mission
         ON mission.id=step.mission_id AND mission.course_id=course.id
           AND mission.company_id=course.company_id AND mission.conversation_id=$4 AND mission.learner_id=$5
      WHERE course.id=$2 AND course.company_id=$3
        AND (($6::text IS NOT NULL AND activity.id IS NOT NULL AND $7::text IS NULL)
          OR ($7::text IS NOT NULL AND mission.id IS NOT NULL AND $6::text IS NULL))`,
    [args.id,args.courseId,args.companyId,args.channelId,args.learnerId,args.activityId ?? null,
      args.missionStepId ?? null,args.assistance,JSON.stringify(args.evidence)],
  )
  return Boolean(result.rowCount)
}

export async function learningMasteryContext(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string },
) {
  const { rows } = await db.query<{
    objective_id: string; level: number; status: string; next_review_at: string | null
  }>(
    `SELECT mastery.objective_id,mastery.level,mastery.status,mastery.next_review_at
       FROM learning_mastery mastery
      WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3`,
    [args.companyId,args.courseId,args.learnerId],
  )
  return rows.map((row) => ({
    objectiveId: row.objective_id,
    level: Number(row.level),
    status: row.status,
    nextReviewAt: row.next_review_at ? String(row.next_review_at) : null,
  }))
}

export async function activeLearningMissionId(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; channelId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT mission.id FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.learner_id=$3
        AND mission.conversation_id=$4 AND mission.status IN ('planning','active','paused')
      ORDER BY mission.updated_at DESC LIMIT 1`,
    [args.companyId,args.courseId,args.learnerId,args.channelId],
  )
  return rows[0]?.id ?? null
}

export async function countPendingLearningEvaluations(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'`,
    [companyId,courseId],
  )
  return Number(rows[0]?.count ?? 0)
}

export interface LearningEvaluationAttempt {
  learnerId: string
  assistance: 'none'|'hint'|'guided'
  activityId: string | null
  activityType: 'lesson'|'practice'|'assessment'|'project'|'review' | null
  evaluationMode: 'agent_formative'|'teacher_required' | null
  targetLevel: number
  objectiveIds: string[]
}

export async function findLearningEvaluationAttempt(
  db: Queryable,
  args: { companyId: string; courseId: string; attemptId: string },
): Promise<LearningEvaluationAttempt | null> {
  const { rows } = await db.query<{
    learner_id: string; assistance: LearningEvaluationAttempt['assistance']; activity_id: string | null
    activity_type: LearningEvaluationAttempt['activityType']; evaluation_mode: LearningEvaluationAttempt['evaluationMode']
    target_level: number; objective_ids: string[]
  }>(
    `SELECT attempt.learner_id,attempt.assistance,attempt.activity_id,activity.type AS activity_type,
            activity.evaluation_mode,
            COALESCE(activity.target_level,objective.target_level,2) AS target_level,
            COALESCE(activity.objective_ids,
              CASE WHEN step.objective_id IS NOT NULL THEN jsonb_build_array(step.objective_id) ELSE '[]'::jsonb END
            ) AS objective_ids
       FROM learning_attempts attempt
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.course_id=attempt.course_id
       LEFT JOIN learning_mission_steps step ON step.id=attempt.mission_step_id
       LEFT JOIN learning_missions mission ON mission.id=step.mission_id
         AND mission.company_id=attempt.company_id AND mission.course_id=attempt.course_id
       LEFT JOIN learning_objectives objective ON objective.id=step.objective_id
         AND objective.company_id=attempt.company_id AND objective.course_id=attempt.course_id
      WHERE attempt.id=$1 AND attempt.company_id=$2 AND attempt.course_id=$3
        AND (attempt.activity_id IS NULL OR activity.status='published')
        AND (attempt.mission_step_id IS NULL OR mission.id IS NOT NULL)`,
    [args.attemptId,args.companyId,args.courseId],
  )
  const row = rows[0]
  return row ? {
    learnerId: row.learner_id, assistance: row.assistance, activityId: row.activity_id,
    activityType: row.activity_type, evaluationMode: row.evaluation_mode,
    targetLevel: Number(row.target_level), objectiveIds: (row.objective_ids ?? []).map(String),
  } : null
}

export async function learningMasteryLevels(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; objectiveIds: string[] },
): Promise<number[]> {
  const { rows } = await db.query<{ level: number }>(
    `SELECT mastery.level FROM learning_mastery mastery
      WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3
        AND mastery.objective_id=ANY($4::text[])`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveIds],
  )
  return rows.map((row) => Number(row.level))
}

export async function verifyIndependentLearningReport(
  db: Queryable,
  args: { companyId: string; courseId: string; sourceReportId: string; verifierReportId: string },
): Promise<'supported'|'unsupported'|null> {
  const { rows } = await db.query<{
    source_author: string; verifier_author: string; verifies_report_id: string | null; verdict: string | null
  }>(
    `SELECT source.author_agent_id AS source_author,verifier.author_agent_id AS verifier_author,
            verifier.verifies_report_id,verifier.verdict
       FROM canvas_assignment_reports source
       JOIN canvases canvas ON canvas.id=source.canvas_id AND canvas.company_id=source.company_id
       JOIN courses course ON course.project_id=canvas.project_id AND course.company_id=canvas.company_id
       JOIN canvas_assignment_reports verifier ON verifier.id=$2
         AND verifier.canvas_id=source.canvas_id AND verifier.company_id=source.company_id
      WHERE source.id=$1 AND source.company_id=$3 AND course.id=$4`,
    [args.sourceReportId,args.verifierReportId,args.companyId,args.courseId],
  )
  const row = rows[0]
  if (!row || row.verifies_report_id !== args.sourceReportId || row.source_author === row.verifier_author) return null
  return row.verdict === 'supported' ? 'supported' : 'unsupported'
}
