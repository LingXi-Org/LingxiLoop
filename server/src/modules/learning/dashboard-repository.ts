import type { Queryable } from '../../db/queryable.js'
import type { ProjectKind, ProjectRole, ProjectStatus } from '../../domain/public.js'

export type LearningLifecycleAction = 'END' | 'ENTER_READ_ONLY' | 'ENTER_RETENTION' | 'ARCHIVE'

export interface LearningSpaceRow {
  companyId: string
  projectId: string
  projectKind: ProjectKind
  courseId: string | null
  title: string
  description: string
  color: string | null
  status: ProjectStatus
  perspective: 'learner' | 'teacher'
  roleCanManage: boolean
  studyRoomId: string | null
  isDefault: boolean
  lastVisitedAt: Date | string | null
  sortAt: Date | string
}

export interface AuthorizedLearningSpaceScope {
  companyId: string
  projectId: string
  projectRole: ProjectRole
  lastVisitedAt: Date | string | null
  sortAt: Date | string
}

export async function listLearningSpaceRows(
  db: Queryable,
  scopes: AuthorizedLearningSpaceScope[],
): Promise<LearningSpaceRow[]> {
  if (scopes.length === 0) return []
  const { rows } = await db.query<LearningSpaceRow>(
    `WITH authorized_scope AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS scope(
         "companyId" text,"projectId" text,"projectRole" text,
         "lastVisitedAt" timestamptz,"sortAt" timestamptz
       )
     )
     SELECT project.company_id AS "companyId",project.id AS "projectId",
            project.kind AS "projectKind",course.id AS "courseId",project.name AS title,
            project.description,project.color,project.status,
            CASE WHEN project.kind<>'PERSONAL_LEARNING'
                   AND authorized_scope."projectRole" IN ('OWNER','TEACHER')
                 THEN 'teacher' ELSE 'learner' END AS perspective,
            (project.kind<>'PERSONAL_LEARNING'
              AND authorized_scope."projectRole" IN ('OWNER','TEACHER')) AS "roleCanManage",
            course.study_room_conversation_id AS "studyRoomId",project.is_default AS "isDefault",
            authorized_scope."lastVisitedAt" AS "lastVisitedAt",
            authorized_scope."sortAt" AS "sortAt"
       FROM authorized_scope
       JOIN projects project ON project.id=authorized_scope."projectId"
        AND project.company_id=authorized_scope."companyId"
       LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
      WHERE project.status<>'DELETED'
      ORDER BY authorized_scope."sortAt" DESC,project.id DESC`,
    [JSON.stringify(scopes)],
  )
  return rows
}

type DataRow = Record<string, unknown>

export interface LearnerOverviewRows {
  summary: DataRow
  masteryDistribution: DataRow[]
  attemptTrend: DataRow[]
  assistanceDistribution: DataRow[]
  dueReviews: DataRow[]
  missionProgress: DataRow[]
}

export async function loadLearnerOverviewRows(
  db: Queryable,
  args: { companyId: string; projectId: string; learnerId: string; windowDays: number },
): Promise<LearnerOverviewRows> {
  const scopeParams = [args.companyId, args.projectId, args.learnerId] as const
  const windowParams = [...scopeParams, args.windowDays] as const
  const [summary, mastery, trend, assistance, due, missions] = await Promise.all([
    db.query<DataRow>(
      `SELECT
        (SELECT COUNT(DISTINCT state.knowledge_unit_id)::int FROM learning_states state
          WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
            AND state.next_review_at<=NOW()) AS "dueReviews",
        (SELECT COUNT(DISTINCT state.knowledge_unit_id)::int FROM learning_states state
          WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
            AND state.level>=3) AS "verifiedObjectives",
        (SELECT COUNT(DISTINCT mission.id)::int FROM learning_missions mission
          WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.learner_id=$3
            AND mission.status IN ('PLANNING','ACTIVE','PAUSED')) AS "activeMissions",
        (SELECT COUNT(DISTINCT attempt.id)::int FROM learning_attempts attempt
          WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3
            AND attempt.submitted_at>=NOW()-($4::int*INTERVAL '1 day')) AS "evidenceAttempts"`,
      windowParams,
    ),
    db.query<DataRow>(
      `WITH levels AS (SELECT generate_series(0,4)::int AS level),
        units AS (
          SELECT id FROM learning_knowledge_units
           WHERE company_id=$1 AND project_id=$2 AND status<>'ARCHIVED'
        ), state_counts AS (
          SELECT state.level,COUNT(DISTINCT state.knowledge_unit_id)::int AS count
            FROM learning_states state JOIN units ON units.id=state.knowledge_unit_id
           WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
           GROUP BY state.level
        )
       SELECT levels.level,
              CASE WHEN levels.level=0
                THEN GREATEST((SELECT COUNT(*) FROM units)
                  -(SELECT COALESCE(SUM(count),0) FROM state_counts WHERE level<>0),0)::int
                ELSE COALESCE(state_counts.count,0)::int END AS count
         FROM levels LEFT JOIN state_counts ON state_counts.level=levels.level
        ORDER BY levels.level`,
      scopeParams,
    ),
    db.query<DataRow>(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE-($4::int-1),CURRENT_DATE,INTERVAL '1 day')::date AS date
       ), attempt_counts AS (
         SELECT attempt.submitted_at::date AS date,COUNT(DISTINCT attempt.id)::int AS count
           FROM learning_attempts attempt
          WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3
            AND attempt.submitted_at>=CURRENT_DATE-($4::int-1)
          GROUP BY attempt.submitted_at::date
       )
       SELECT days.date::text AS date,COALESCE(attempt_counts.count,0)::int AS count
         FROM days LEFT JOIN attempt_counts USING(date) ORDER BY days.date`,
      windowParams,
    ),
    db.query<DataRow>(
      `WITH assistance_values(assistance) AS (VALUES ('NONE'::text),('HINT'::text),('GUIDED'::text)),
        attempt_counts AS (
          SELECT attempt.assistance,COUNT(DISTINCT attempt.id)::int AS count
            FROM learning_attempts attempt
           WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3
             AND attempt.submitted_at>=NOW()-($4::int*INTERVAL '1 day')
           GROUP BY attempt.assistance
        )
       SELECT assistance_values.assistance,COALESCE(attempt_counts.count,0)::int AS count
         FROM assistance_values LEFT JOIN attempt_counts USING(assistance)
        ORDER BY array_position(ARRAY['NONE','HINT','GUIDED'],assistance_values.assistance)`,
      windowParams,
    ),
    db.query<DataRow>(
      `SELECT state.knowledge_unit_id AS "knowledgeUnitId",unit.title,state.level,state.status,
              state.next_review_at AS "nextReviewAt"
         FROM learning_states state
         JOIN learning_knowledge_units unit ON unit.id=state.knowledge_unit_id
          AND unit.company_id=state.company_id AND unit.project_id=state.project_id
        WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
          AND state.next_review_at<=NOW() AND unit.status<>'ARCHIVED'
        ORDER BY state.next_review_at,state.knowledge_unit_id LIMIT 50`,
      scopeParams,
    ),
    db.query<DataRow>(
      `SELECT mission.id AS "missionId",mission.goal,mission.status,
              COUNT(step.id) FILTER(WHERE step.status='COMPLETED')::int AS "completedSteps",
              COUNT(step.id)::int AS "totalSteps",mission.updated_at AS "updatedAt"
         FROM learning_missions mission
         LEFT JOIN learning_mission_steps step ON step.company_id=mission.company_id
          AND step.project_id=mission.project_id AND step.mission_id=mission.id
        WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.learner_id=$3
        GROUP BY mission.id ORDER BY mission.updated_at DESC,mission.id LIMIT 20`,
      scopeParams,
    ),
  ])
  return {
    summary: summary.rows[0] ?? {
      dueReviews: 0, verifiedObjectives: 0, activeMissions: 0, evidenceAttempts: 0,
    },
    masteryDistribution: mastery.rows,
    attemptTrend: trend.rows,
    assistanceDistribution: assistance.rows,
    dueReviews: due.rows,
    missionProgress: missions.rows,
  }
}

export interface LearningLearnerDetailRows {
  summary: DataRow
  masteryDistribution: DataRow[]
  states: DataRow[]
  missions: DataRow[]
  attempts: DataRow[]
}

export async function loadLearningLearnerDetailRows(
  db: Queryable,
  args: { companyId: string; projectId: string; learnerId: string },
): Promise<LearningLearnerDetailRows> {
  const params = [args.companyId, args.projectId, args.learnerId] as const
  const [summary, mastery, states, missions, attempts] = await Promise.all([
    db.query<DataRow>(
      `SELECT
        (SELECT COALESCE(AVG(state.level),0)::float8 FROM learning_states state
          WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3) AS "averageLevel",
        (SELECT COUNT(DISTINCT state.knowledge_unit_id)::int FROM learning_states state
          WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
            AND state.level>=3) AS "verifiedObjectives",
        (SELECT COUNT(DISTINCT state.knowledge_unit_id)::int FROM learning_states state
          WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
            AND state.next_review_at<=NOW()) AS "dueReviews",
        (SELECT COUNT(DISTINCT attempt.id)::int FROM learning_attempts attempt
          WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3) AS "attemptCount",
        (SELECT COUNT(DISTINCT mission.id)::int FROM learning_missions mission
          WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.learner_id=$3
            AND mission.status IN ('PLANNING','ACTIVE','PAUSED')) AS "activeMissions"`,
      params,
    ),
    db.query<DataRow>(
      `WITH levels AS (SELECT generate_series(0,4)::int AS level), units AS (
         SELECT id FROM learning_knowledge_units
          WHERE company_id=$1 AND project_id=$2 AND status<>'ARCHIVED'
       ), state_counts AS (
         SELECT state.level,COUNT(DISTINCT state.knowledge_unit_id)::int AS count
           FROM learning_states state JOIN units ON units.id=state.knowledge_unit_id
          WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
          GROUP BY state.level
       )
       SELECT levels.level,
              CASE WHEN levels.level=0
                THEN GREATEST((SELECT COUNT(*) FROM units)
                  -(SELECT COALESCE(SUM(count),0) FROM state_counts WHERE level<>0),0)::int
                ELSE COALESCE(state_counts.count,0)::int END AS count
         FROM levels LEFT JOIN state_counts ON state_counts.level=levels.level ORDER BY levels.level`,
      params,
    ),
    db.query<DataRow>(
      `SELECT state.knowledge_unit_id AS "knowledgeUnitId",unit.title,state.level,state.status,
              state.next_review_at AS "nextReviewAt",state.review_interval_days AS "reviewIntervalDays",
              state.last_evidence_at AS "lastEvidenceAt"
         FROM learning_states state
         JOIN learning_knowledge_units unit ON unit.id=state.knowledge_unit_id
          AND unit.company_id=state.company_id AND unit.project_id=state.project_id
        WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
        ORDER BY unit.position,state.knowledge_unit_id LIMIT 200`,
      params,
    ),
    db.query<DataRow>(
      `SELECT mission.id AS "missionId",mission.goal,mission.success_criteria AS "successCriteria",
              mission.kind,mission.status,
              COUNT(step.id) FILTER(WHERE step.status='COMPLETED')::int AS "completedSteps",
              COUNT(step.id)::int AS "totalSteps",mission.updated_at AS "updatedAt"
         FROM learning_missions mission
         LEFT JOIN learning_mission_steps step ON step.company_id=mission.company_id
          AND step.project_id=mission.project_id AND step.mission_id=mission.id
        WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.learner_id=$3
        GROUP BY mission.id ORDER BY mission.updated_at DESC,mission.id LIMIT 50`,
      params,
    ),
    db.query<DataRow>(
      `SELECT attempt.id AS "attemptId",attempt.activity_id AS "activityId",
              attempt.mission_step_id AS "missionStepId",
              COALESCE(activity.title,step.description) AS title,attempt.assistance,attempt.status,
              attempt.submitted_at AS "submittedAt",
              CASE WHEN evaluation.id IS NULL THEN NULL ELSE jsonb_build_object(
                'evaluationId',evaluation.id,'demonstratedLevel',evaluation.demonstrated_level,
                'confidence',evaluation.confidence,'status',evaluation.status,'feedback',evaluation.feedback
              ) END AS evaluation
         FROM learning_attempts attempt
         LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
          AND activity.company_id=attempt.company_id AND activity.project_id=attempt.project_id
         LEFT JOIN learning_mission_steps step ON step.id=attempt.mission_step_id
          AND step.company_id=attempt.company_id AND step.project_id=attempt.project_id
         LEFT JOIN LATERAL (
           SELECT candidate.id,candidate.demonstrated_level,candidate.confidence,
                  candidate.status,candidate.feedback
             FROM learning_evaluations candidate
            WHERE candidate.company_id=attempt.company_id AND candidate.project_id=attempt.project_id
              AND candidate.attempt_id=attempt.id
            ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1
         ) evaluation ON TRUE
        WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3
        ORDER BY attempt.submitted_at DESC,attempt.id DESC LIMIT 50`,
      params,
    ),
  ])
  return {
    summary: summary.rows[0] ?? {
      averageLevel: 0, verifiedObjectives: 0, dueReviews: 0, attemptCount: 0, activeMissions: 0,
    },
    masteryDistribution: mastery.rows,
    states: states.rows,
    missions: missions.rows,
    attempts: attempts.rows,
  }
}

export async function findLearningAttemptDetail(
  db: Queryable,
  args: { companyId: string; projectId: string; attemptId: string },
): Promise<DataRow | null> {
  const { rows } = await db.query<DataRow>(
    `SELECT attempt.id AS "attemptId",
            jsonb_build_object('learnerId',attempt.learner_id,
              'displayName',user_account.display_name,'email',user_account.email) AS learner,
            jsonb_build_object('type',CASE WHEN attempt.activity_id IS NULL THEN 'missionStep' ELSE 'activity' END,
              'id',COALESCE(attempt.activity_id,attempt.mission_step_id),
              'title',COALESCE(activity.title,step.description)) AS source,
            attempt.assistance,attempt.status,attempt.submitted_at AS "submittedAt",
            jsonb_build_object('evidenceId',evidence.id,'kind',evidence.kind,
              'data',evidence.data,'createdAt',evidence.created_at) AS evidence,
            COALESCE(jsonb_agg(jsonb_build_object(
              'evaluationId',evaluation.id,'demonstratedLevel',evaluation.demonstrated_level,
              'confidence',evaluation.confidence,'rubricResults',evaluation.rubric_results,
              'feedback',evaluation.feedback,'evaluatorId',evaluation.evaluator_id,
              'evaluatorKind',evaluation.evaluator_kind,'status',evaluation.status,
              'reviewReason',evaluation.review_reason,'reviewedBy',evaluation.reviewed_by,
              'reviewedAt',evaluation.reviewed_at,'createdAt',evaluation.created_at
            ) ORDER BY evaluation.created_at,evaluation.id)
              FILTER(WHERE evaluation.id IS NOT NULL),'[]'::jsonb) AS evaluations
       FROM learning_attempts attempt
       JOIN users user_account ON user_account.id=attempt.learner_id
       JOIN evidence_records evidence ON evidence.id=attempt.evidence_id
        AND evidence.company_id=attempt.company_id AND evidence.project_id=attempt.project_id
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
        AND activity.company_id=attempt.company_id AND activity.project_id=attempt.project_id
       LEFT JOIN learning_mission_steps step ON step.id=attempt.mission_step_id
        AND step.company_id=attempt.company_id AND step.project_id=attempt.project_id
       LEFT JOIN learning_evaluations evaluation ON evaluation.company_id=attempt.company_id
        AND evaluation.project_id=attempt.project_id AND evaluation.attempt_id=attempt.id
      WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.id=$3
      GROUP BY attempt.id,user_account.id,evidence.id,activity.id,step.id`,
    [args.companyId, args.projectId, args.attemptId],
  )
  return rows[0] ?? null
}

export function learningPerspective(
  projectKind: ProjectKind,
  projectRole: ProjectRole,
): 'learner' | 'teacher' {
  if (projectKind === 'PERSONAL_LEARNING') return 'learner'
  return projectRole === 'OWNER' || projectRole === 'TEACHER' ? 'teacher' : 'learner'
}

export function learningLifecycleAction(
  projectKind: ProjectKind,
  projectStatus: ProjectStatus,
): LearningLifecycleAction | null {
  switch (projectStatus) {
    case 'ACTIVE':
      return projectKind === 'PERSONAL_LEARNING' ? null : 'END'
    case 'COURSE_ENDED':
      return projectKind === 'PERSONAL_LEARNING' ? null : 'ENTER_READ_ONLY'
    case 'READ_ONLY':
      if (projectKind === 'TEACHING') return 'ARCHIVE'
      return projectKind === 'INSTITUTIONAL_COURSE' ? 'ENTER_RETENTION' : null
    case 'RETENTION':
      return projectKind === 'INSTITUTIONAL_COURSE' ? 'ARCHIVE' : null
    case 'CREATED':
    case 'DRAFT':
    case 'TRANSFER_PENDING':
    case 'ARCHIVED':
    case 'DELETED':
      return null
  }
}
