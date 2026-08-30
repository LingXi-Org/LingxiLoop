import type { Queryable } from '../../db/queryable.js'
import type { LearningActivityType, LearningAssistance, LearningEvaluationMode } from './types.js'

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
    id: string
    companyId: string
    projectId: string
    channelId: string
    learnerId: string
    activityId?: string
    missionStepId?: string
    assistance: LearningAssistance
    evidence: Record<string, unknown>
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_attempts
       (id,company_id,project_id,learner_id,activity_id,mission_step_id,assistance,evidence)
     SELECT $1,project.company_id,project.id,$5,activity.id,step.id,$8,$9::jsonb
       FROM projects project
       LEFT JOIN learning_activities activity
         ON activity.id=$6 AND activity.company_id=project.company_id AND activity.project_id=project.id
        AND activity.status='PUBLISHED'
       LEFT JOIN learning_mission_steps step
         ON step.id=$7 AND step.company_id=project.company_id AND step.project_id=project.id
       LEFT JOIN learning_missions mission
         ON mission.id=step.mission_id AND mission.company_id=step.company_id AND mission.project_id=step.project_id
        AND mission.conversation_id=$4 AND mission.learner_id=$5
      WHERE project.company_id=$2 AND project.id=$3
        AND (($6::text IS NOT NULL AND activity.id IS NOT NULL AND $7::text IS NULL)
          OR ($7::text IS NOT NULL AND mission.id IS NOT NULL AND $6::text IS NULL))`,
    [args.id,args.companyId,args.projectId,args.channelId,args.learnerId,args.activityId ?? null,
      args.missionStepId ?? null,args.assistance,JSON.stringify(args.evidence)],
  )
  return Boolean(result.rowCount)
}

export async function learningStateContext(
  db: Queryable,
  args: { companyId: string; projectId: string; userId: string },
) {
  const { rows } = await db.query<{
    knowledge_unit_id: string
    level: number
    status: 'LEARNING'|'VERIFIED'|'NEEDS_REVIEW'
    next_review_at: string | null
  }>(
    `SELECT state.knowledge_unit_id,state.level,state.status,state.next_review_at
       FROM learning_states state
      WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3`,
    [args.companyId,args.projectId,args.userId],
  )
  return rows.map((row) => ({
    knowledgeUnitId: row.knowledge_unit_id,
    level: Number(row.level),
    status: row.status,
    nextReviewAt: row.next_review_at ? String(row.next_review_at) : null,
  }))
}

export async function activeLearningMissionId(
  db: Queryable,
  args: { companyId: string; projectId: string; learnerId: string; channelId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT mission.id FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.learner_id=$3
        AND mission.conversation_id=$4 AND mission.status IN ('PLANNING','ACTIVE','PAUSED')
      ORDER BY mission.updated_at DESC LIMIT 1`,
    [args.companyId,args.projectId,args.learnerId,args.channelId],
  )
  return rows[0]?.id ?? null
}

export async function countPendingLearningEvaluations(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
        AND attempt.project_id=evaluation.project_id
      WHERE evaluation.company_id=$1 AND evaluation.project_id=$2 AND evaluation.status='PENDING'`,
    [companyId,projectId],
  )
  return Number(rows[0]?.count ?? 0)
}

export interface LearningEvaluationAttempt {
  learnerId: string
  assistance: LearningAssistance
  activityId: string | null
  activityType: LearningActivityType | null
  evaluationMode: LearningEvaluationMode | null
  targetLevel: number
  knowledgeUnitIds: string[]
}

export async function findLearningEvaluationAttempt(
  db: Queryable,
  args: { companyId: string; projectId: string; attemptId: string },
): Promise<LearningEvaluationAttempt | null> {
  const { rows } = await db.query<{
    learner_id: string
    assistance: LearningEvaluationAttempt['assistance']
    activity_id: string | null
    activity_type: LearningEvaluationAttempt['activityType']
    evaluation_mode: LearningEvaluationAttempt['evaluationMode']
    target_level: number
    knowledge_unit_ids: string[]
  }>(
    `SELECT attempt.learner_id,attempt.assistance,attempt.activity_id,activity.kind AS activity_type,
            activity.evaluation_mode,COALESCE(activity.target_level,step_unit.target_level,2) AS target_level,
            CASE WHEN activity.id IS NOT NULL THEN COALESCE((
              SELECT array_agg(link.knowledge_unit_id ORDER BY link.knowledge_unit_id)
                FROM learning_activity_knowledge_units link
               WHERE link.company_id=attempt.company_id AND link.project_id=attempt.project_id
                 AND link.activity_id=activity.id
            ),'{}'::text[])
            WHEN step.knowledge_unit_id IS NOT NULL THEN ARRAY[step.knowledge_unit_id]
            ELSE '{}'::text[] END AS knowledge_unit_ids
       FROM learning_attempts attempt
       LEFT JOIN learning_activities activity
         ON activity.id=attempt.activity_id AND activity.company_id=attempt.company_id
        AND activity.project_id=attempt.project_id
       LEFT JOIN learning_mission_steps step
         ON step.id=attempt.mission_step_id AND step.company_id=attempt.company_id
        AND step.project_id=attempt.project_id
       LEFT JOIN learning_missions mission
         ON mission.id=step.mission_id AND mission.company_id=step.company_id AND mission.project_id=step.project_id
       LEFT JOIN learning_knowledge_units step_unit
         ON step_unit.id=step.knowledge_unit_id AND step_unit.company_id=step.company_id
        AND step_unit.project_id=step.project_id
      WHERE attempt.id=$1 AND attempt.company_id=$2 AND attempt.project_id=$3
        AND (attempt.activity_id IS NULL OR activity.status='PUBLISHED')
        AND (attempt.mission_step_id IS NULL OR mission.id IS NOT NULL)`,
    [args.attemptId,args.companyId,args.projectId],
  )
  const row = rows[0]
  return row ? {
    learnerId: row.learner_id,
    assistance: row.assistance,
    activityId: row.activity_id,
    activityType: row.activity_type,
    evaluationMode: row.evaluation_mode,
    targetLevel: Number(row.target_level),
    knowledgeUnitIds: (row.knowledge_unit_ids ?? []).map(String),
  } : null
}

export async function learningStateLevels(
  db: Queryable,
  args: { companyId: string; projectId: string; userId: string; knowledgeUnitIds: string[] },
): Promise<number[]> {
  const { rows } = await db.query<{ level: number }>(
    `SELECT state.level FROM learning_states state
      WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
        AND state.knowledge_unit_id=ANY($4::text[])`,
    [args.companyId,args.projectId,args.userId,args.knowledgeUnitIds],
  )
  return rows.map((row) => Number(row.level))
}

export async function verifyIndependentLearningReport(
  db: Queryable,
  args: { companyId: string; projectId: string; sourceReportId: string; verifierReportId: string },
): Promise<'supported'|'unsupported'|null> {
  const { rows } = await db.query<{
    source_author: string
    verifier_author: string
    verifies_report_id: string | null
    verdict: string | null
  }>(
    `SELECT source.author_agent_id AS source_author,verifier.author_agent_id AS verifier_author,
            verifier.verifies_report_id,verifier.verdict
       FROM canvas_assignment_reports source
       JOIN canvases canvas
         ON canvas.id=source.canvas_id AND canvas.company_id=source.company_id AND canvas.project_id=$4
       JOIN canvas_assignment_reports verifier
         ON verifier.id=$2 AND verifier.canvas_id=source.canvas_id AND verifier.company_id=source.company_id
      WHERE source.id=$1 AND source.company_id=$3`,
    [args.sourceReportId,args.verifierReportId,args.companyId,args.projectId],
  )
  const row = rows[0]
  if (!row || row.verifies_report_id !== args.sourceReportId || row.source_author === row.verifier_author) return null
  return row.verdict === 'supported' ? 'supported' : 'unsupported'
}
