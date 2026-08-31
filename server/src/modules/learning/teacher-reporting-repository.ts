import type { Queryable } from '../../db/queryable.js'

export interface TeacherReportingScope {
  companyId: string
  projectId: string
  courseId: string
  teacherUserId?: string
}

type DataRow = Record<string, unknown>

export interface TeacherOverviewRows {
  distribution: DataRow[]
  missions: DataRow[]
  activity: DataRow[]
  attention: DataRow[]
  coverage: DataRow[]
}

/** Read models used by Pulse. Every query is rooted in the trusted tenant scope. */
export async function loadTeacherOverviewRows(
  db: Queryable,
  scope: TeacherReportingScope,
  windowDays: number,
): Promise<TeacherOverviewRows> {
  const [distribution, missions, activity, attention, coverage] = await Promise.all([
    db.query<DataRow>(
      `WITH totals AS (
        SELECT
          (SELECT COUNT(*) FROM project_memberships member
            WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
              AND member.role IN ('STUDENT','OBSERVER')) *
          (SELECT COUNT(*) FROM learning_knowledge_units
            WHERE company_id=$1 AND project_id=$2 AND status<>'ARCHIVED') AS possible
      ), levels AS (SELECT generate_series(0,4) AS level)
      SELECT levels.level,
        CASE WHEN levels.level=0
          THEN GREATEST(totals.possible-COUNT(state.knowledge_unit_id) FILTER(WHERE state.level<>0),0)::int
          ELSE COUNT(state.knowledge_unit_id) FILTER(WHERE state.level=levels.level)::int
        END AS knowledge_unit_states
      FROM levels CROSS JOIN totals
      LEFT JOIN learning_states state
        ON state.company_id=$1 AND state.project_id=$2
      GROUP BY levels.level,totals.possible
      ORDER BY levels.level`,
      [scope.companyId, scope.projectId],
    ),
    db.query<DataRow>(
      `SELECT status,COUNT(*)::int AS count
         FROM learning_missions
        WHERE company_id=$1 AND project_id=$2
        GROUP BY status
        ORDER BY status`,
      [scope.companyId, scope.projectId],
    ),
    db.query<DataRow>(
      `SELECT
        COUNT(DISTINCT attempt.id) FILTER(
          WHERE attempt.submitted_at>=NOW()-($3::int*INTERVAL '1 day')
        )::int AS attempts,
        COUNT(DISTINCT evaluation.id) FILTER(WHERE evaluation.status='PENDING')::int AS pending_reviews,
        COUNT(DISTINCT evaluation.id) FILTER(WHERE evaluation.status='ACCEPTED')::int AS accepted_evaluations,
        COUNT(DISTINCT evaluation.id) FILTER(WHERE evaluation.status='REJECTED')::int AS rejected_evaluations
      FROM learning_attempts attempt
      LEFT JOIN learning_evaluations evaluation
        ON evaluation.company_id=attempt.company_id AND evaluation.project_id=attempt.project_id
       AND evaluation.attempt_id=attempt.id
      WHERE attempt.company_id=$1 AND attempt.project_id=$2`,
      [scope.companyId, scope.projectId, windowDays],
    ),
    db.query<DataRow>(
      `SELECT attention.learner_user_id AS user_id,user_account.display_name,
              jsonb_agg(DISTINCT attention.reason ORDER BY attention.reason) AS attention_reasons,
              MAX(attention.rank_score)::int AS rank_score,
              MIN(attention.expected_minutes)::int AS expected_minutes
         FROM attention_items attention
         JOIN users user_account ON user_account.id=attention.learner_user_id
        WHERE attention.company_id=$1 AND attention.project_id=$2
          AND (attention.status IN ('OPEN','ACKNOWLEDGED')
            OR (attention.status='DEFERRED' AND attention.deferred_until<=NOW()))
          AND ($3::text IS NULL OR attention.teacher_user_id=$3)
        GROUP BY attention.learner_user_id,user_account.display_name
        ORDER BY rank_score DESC,attention.learner_user_id
      LIMIT 20`,
      [scope.companyId, scope.projectId, scope.teacherUserId ?? null],
    ),
    db.query<DataRow>(
      `SELECT
        (SELECT COUNT(*)::int FROM project_memberships member
          WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
            AND member.role IN ('STUDENT','OBSERVER')) AS learners,
        COUNT(DISTINCT attempt.learner_id)::int AS learners_with_evidence,
        COUNT(DISTINCT attempt.id)::int AS verified_attempts,
        COUNT(DISTINCT state.user_id||':'||state.knowledge_unit_id)
          FILTER(WHERE state.next_review_at<=NOW())::int AS due_reviews
      FROM learning_attempts attempt
      FULL JOIN learning_states state
        ON state.company_id=attempt.company_id AND state.project_id=attempt.project_id
       AND state.user_id=attempt.learner_id
      WHERE COALESCE(attempt.company_id,state.company_id)=$1
        AND COALESCE(attempt.project_id,state.project_id)=$2`,
      [scope.companyId, scope.projectId],
    ),
  ])

  return {
    distribution: distribution.rows,
    missions: missions.rows,
    activity: activity.rows,
    attention: attention.rows,
    coverage: coverage.rows,
  }
}

export async function listTeacherLearnerRows(
  db: Queryable,
  scope: TeacherReportingScope,
  attentionOnly: boolean,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT member.user_id,user_account.display_name,user_account.email,
      COALESCE(AVG(state.level),0)::float AS average_level,
      COUNT(DISTINCT state.knowledge_unit_id) FILTER(WHERE state.level>=3)::int AS verified_knowledge_units,
      COUNT(DISTINCT state.knowledge_unit_id) FILTER(WHERE state.next_review_at<=NOW())::int AS due_reviews,
      COUNT(DISTINCT state.knowledge_unit_id) FILTER(WHERE state.status='NEEDS_REVIEW')::int AS needs_review,
      COUNT(DISTINCT mission.id) FILTER(WHERE mission.status='PAUSED')::int AS paused_missions,
      COALESCE(jsonb_agg(DISTINCT attention.reason ORDER BY attention.reason)
        FILTER(WHERE attention.id IS NOT NULL),'[]'::jsonb) AS attention_reasons
    FROM project_memberships member
    JOIN users user_account ON user_account.id=member.user_id
    LEFT JOIN learning_states state
      ON state.company_id=member.company_id AND state.project_id=member.project_id
     AND state.user_id=member.user_id
    LEFT JOIN learning_missions mission
      ON mission.company_id=member.company_id AND mission.project_id=member.project_id
       AND mission.learner_id=member.user_id
    LEFT JOIN attention_items attention
      ON attention.company_id=member.company_id AND attention.project_id=member.project_id
     AND attention.learner_user_id=member.user_id
     AND (attention.status IN ('OPEN','ACKNOWLEDGED')
       OR (attention.status='DEFERRED' AND attention.deferred_until<=NOW()))
     AND ($4::text IS NULL OR attention.teacher_user_id=$4)
    WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
      AND member.role IN ('STUDENT','OBSERVER')
    GROUP BY member.user_id,user_account.display_name,user_account.email
    HAVING NOT $3::boolean OR COUNT(DISTINCT attention.id)>0
    ORDER BY needs_review DESC,due_reviews DESC,user_account.display_name
    LIMIT 100`,
    [scope.companyId, scope.projectId, attentionOnly, scope.teacherUserId ?? null],
  )
  return rows
}

export async function findTeacherLearner(
  db: Queryable,
  scope: TeacherReportingScope,
  learnerId: string,
): Promise<DataRow | undefined> {
  const { rows } = await db.query<DataRow>(
    `SELECT user_account.display_name,user_account.email
       FROM project_memberships member
       JOIN users user_account ON user_account.id=member.user_id
      WHERE member.company_id=$1 AND member.project_id=$2
        AND member.user_id=$3 AND member.status='ACTIVE'
        AND member.role IN ('STUDENT','OBSERVER')`,
    [scope.companyId, scope.projectId, learnerId],
  )
  return rows[0]
}

export async function loadTeacherLearnerDetailRows(
  db: Queryable,
  scope: TeacherReportingScope,
  learnerId: string,
): Promise<{ states: DataRow[]; missions: DataRow[]; attempts: DataRow[] }> {
  const [states, missions, attempts] = await Promise.all([
    db.query<DataRow>(
      `SELECT state.knowledge_unit_id,unit.title,state.level,state.status,
              state.next_review_at,state.review_interval_days
         FROM learning_states state
         JOIN learning_knowledge_units unit
           ON unit.id=state.knowledge_unit_id AND unit.company_id=state.company_id
          AND unit.project_id=state.project_id
        WHERE state.company_id=$1 AND state.project_id=$2 AND state.user_id=$3
        ORDER BY unit.position
        LIMIT 100`,
      [scope.companyId, scope.projectId, learnerId],
    ),
    db.query<DataRow>(
      `SELECT id,goal,success_criteria,status,updated_at
         FROM learning_missions
        WHERE company_id=$1 AND project_id=$2 AND learner_id=$3
        ORDER BY updated_at DESC
        LIMIT 20`,
      [scope.companyId, scope.projectId, learnerId],
    ),
    db.query<DataRow>(
      `SELECT attempt.id,attempt.activity_id,attempt.mission_step_id,attempt.assistance,
              attempt.status,attempt.submitted_at,evaluation.demonstrated_level,
              evaluation.confidence,evaluation.status AS evaluation_status,evaluation.feedback
         FROM learning_attempts attempt
         LEFT JOIN LATERAL (
           SELECT * FROM learning_evaluations candidate
            WHERE candidate.company_id=attempt.company_id AND candidate.project_id=attempt.project_id
              AND candidate.attempt_id=attempt.id
            ORDER BY candidate.created_at DESC LIMIT 1
         ) evaluation ON TRUE
        WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3
        ORDER BY attempt.submitted_at DESC
        LIMIT 20`,
      [scope.companyId, scope.projectId, learnerId],
    ),
  ])
  return { states: states.rows, missions: missions.rows, attempts: attempts.rows }
}

export async function findTeacherAttemptDetail(
  db: Queryable,
  scope: TeacherReportingScope,
  attemptId: string,
): Promise<DataRow | undefined> {
  const { rows } = await db.query<DataRow>(
    `SELECT attempt.id,attempt.learner_id,attempt.activity_id,attempt.mission_step_id,
            attempt.assistance,attempt.status,attempt.submitted_at,evidence.data AS evidence,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id',evaluation.id,'level',evaluation.demonstrated_level,
              'confidence',evaluation.confidence,'status',evaluation.status,
              'feedback',evaluation.feedback
            )) FILTER(WHERE evaluation.id IS NOT NULL),'[]'::jsonb) AS evaluations
       FROM learning_attempts attempt
       JOIN evidence_records evidence
         ON evidence.id=attempt.evidence_id AND evidence.company_id=attempt.company_id
        AND evidence.project_id=attempt.project_id
       LEFT JOIN learning_evaluations evaluation
         ON evaluation.company_id=attempt.company_id AND evaluation.project_id=attempt.project_id
        AND evaluation.attempt_id=attempt.id
      WHERE attempt.id=$3 AND attempt.company_id=$1 AND attempt.project_id=$2
      GROUP BY attempt.id,evidence.id`,
    [scope.companyId, scope.projectId, attemptId],
  )
  return rows[0]
}

export interface LearningDashboardTeacherOverviewRows {
  summary: DataRow
  masteryDistribution: DataRow[]
  missionDistribution: DataRow[]
  evaluationDistribution: DataRow[]
  attention: DataRow[]
}

export async function loadLearningDashboardTeacherOverviewRows(
  db: Queryable,
  args: { companyId: string; projectId: string; teacherId: string; windowDays: number },
): Promise<LearningDashboardTeacherOverviewRows> {
  const scopeParams = [args.companyId, args.projectId] as const
  const windowParams = [...scopeParams, args.windowDays] as const
  const teacherParams = [...scopeParams, args.teacherId] as const
  const [summary, mastery, missions, evaluations, attention] = await Promise.all([
    db.query<DataRow>(
      `SELECT
        (SELECT COUNT(*)::int FROM project_memberships member
          WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
            AND member.role IN ('STUDENT','OBSERVER')) AS "learnerCount",
        (SELECT COUNT(DISTINCT evaluation.id)::int FROM learning_evaluations evaluation
          WHERE evaluation.company_id=$1 AND evaluation.project_id=$2
            AND evaluation.status='PENDING') AS "pendingReviews",
        (SELECT COUNT(DISTINCT attempt.id)::int FROM learning_attempts attempt
          WHERE attempt.company_id=$1 AND attempt.project_id=$2
            AND attempt.submitted_at>=NOW()-($3::int*INTERVAL '1 day')) AS attempts,
        (SELECT COUNT(DISTINCT attempt.learner_id)::int
           FROM learning_attempts attempt
           JOIN project_memberships learner ON learner.company_id=attempt.company_id
            AND learner.project_id=attempt.project_id AND learner.user_id=attempt.learner_id
            AND learner.status='ACTIVE' AND learner.role IN ('STUDENT','OBSERVER')
          WHERE attempt.company_id=$1 AND attempt.project_id=$2
            AND attempt.submitted_at>=NOW()-($3::int*INTERVAL '1 day')) AS "learnersWithEvidence",
        (SELECT COUNT(DISTINCT (state.user_id,state.knowledge_unit_id))::int
           FROM learning_states state
           JOIN project_memberships learner ON learner.company_id=state.company_id
            AND learner.project_id=state.project_id AND learner.user_id=state.user_id
            AND learner.status='ACTIVE' AND learner.role IN ('STUDENT','OBSERVER')
          WHERE state.company_id=$1 AND state.project_id=$2
            AND state.next_review_at<=NOW()) AS "dueReviews"`,
      windowParams,
    ),
    db.query<DataRow>(
      `WITH levels AS (SELECT generate_series(0,4)::int AS level),
        learners AS (
          SELECT user_id FROM project_memberships
           WHERE company_id=$1 AND project_id=$2 AND status='ACTIVE'
             AND role IN ('STUDENT','OBSERVER')
        ), units AS (
          SELECT id FROM learning_knowledge_units
           WHERE company_id=$1 AND project_id=$2 AND status<>'ARCHIVED'
        ), totals AS (
          SELECT (SELECT COUNT(*) FROM learners)*(SELECT COUNT(*) FROM units) AS possible
        ), state_counts AS (
          SELECT state.level,COUNT(DISTINCT (state.user_id,state.knowledge_unit_id))::int AS count
            FROM learning_states state
            JOIN learners ON learners.user_id=state.user_id
            JOIN units ON units.id=state.knowledge_unit_id
           WHERE state.company_id=$1 AND state.project_id=$2 GROUP BY state.level
        )
       SELECT levels.level,
              CASE WHEN levels.level=0
                THEN GREATEST(totals.possible
                  -(SELECT COALESCE(SUM(count),0) FROM state_counts WHERE level<>0),0)::int
                ELSE COALESCE(state_counts.count,0)::int END AS count
         FROM levels CROSS JOIN totals LEFT JOIN state_counts ON state_counts.level=levels.level
        ORDER BY levels.level`,
      scopeParams,
    ),
    db.query<DataRow>(
      `WITH statuses(status,position) AS (VALUES
        ('PLANNING'::text,1),('ACTIVE'::text,2),('PAUSED'::text,3),
        ('COMPLETED'::text,4),('CANCELLED'::text,5)), counts AS (
          SELECT mission.status,COUNT(DISTINCT mission.id)::int AS count
            FROM learning_missions mission
            JOIN project_memberships learner ON learner.company_id=mission.company_id
             AND learner.project_id=mission.project_id AND learner.user_id=mission.learner_id
             AND learner.status='ACTIVE' AND learner.role IN ('STUDENT','OBSERVER')
           WHERE mission.company_id=$1 AND mission.project_id=$2 GROUP BY mission.status
        )
       SELECT statuses.status,COALESCE(counts.count,0)::int AS count
         FROM statuses LEFT JOIN counts USING(status) ORDER BY statuses.position`,
      scopeParams,
    ),
    db.query<DataRow>(
      `WITH statuses(status,position) AS (VALUES
        ('PENDING'::text,1),('ACCEPTED'::text,2),('REJECTED'::text,3)), counts AS (
          SELECT evaluation.status,COUNT(DISTINCT evaluation.id)::int AS count
            FROM learning_evaluations evaluation
           WHERE evaluation.company_id=$1 AND evaluation.project_id=$2
             AND evaluation.created_at>=NOW()-($3::int*INTERVAL '1 day')
           GROUP BY evaluation.status
        )
       SELECT statuses.status,COALESCE(counts.count,0)::int AS count
         FROM statuses LEFT JOIN counts USING(status) ORDER BY statuses.position`,
      windowParams,
    ),
    db.query<DataRow>(
      `SELECT attention.learner_user_id AS "learnerId",user_account.display_name AS "displayName",
              array_agg(DISTINCT attention.reason ORDER BY attention.reason) AS reasons,
              MAX(attention.rank_score)::int AS "rankScore",
              MIN(attention.expected_minutes)::int AS "expectedMinutes"
         FROM attention_items attention
         JOIN users user_account ON user_account.id=attention.learner_user_id
         JOIN project_memberships learner ON learner.company_id=attention.company_id
          AND learner.project_id=attention.project_id AND learner.user_id=attention.learner_user_id
          AND learner.status='ACTIVE' AND learner.role IN ('STUDENT','OBSERVER')
        WHERE attention.company_id=$1 AND attention.project_id=$2 AND attention.teacher_user_id=$3
          AND (attention.status IN ('OPEN','ACKNOWLEDGED')
            OR (attention.status='DEFERRED' AND attention.deferred_until<=NOW()))
        GROUP BY attention.learner_user_id,user_account.display_name
        ORDER BY "rankScore" DESC,attention.learner_user_id LIMIT 20`,
      teacherParams,
    ),
  ])
  return {
    summary: summary.rows[0] ?? {
      learnerCount: 0, pendingReviews: 0, attempts: 0, learnersWithEvidence: 0, dueReviews: 0,
    },
    masteryDistribution: mastery.rows,
    missionDistribution: missions.rows,
    evaluationDistribution: evaluations.rows,
    attention: attention.rows,
  }
}

export interface LearningDashboardLearnerRow extends DataRow {
  learnerId: string
}

export async function listLearningDashboardLearnerRows(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    reviewerId: string
    attentionOnly: boolean
    afterLearnerId: string | null
    search: string | null
    limit: number
  },
): Promise<LearningDashboardLearnerRow[]> {
  const { rows } = await db.query<LearningDashboardLearnerRow>(
    `WITH learners AS (
       SELECT member.user_id,member.created_at
         FROM project_memberships member
        WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
          AND member.role IN ('STUDENT','OBSERVER')
     ), state_summary AS (
       SELECT state.user_id,COALESCE(AVG(state.level),0)::float8 AS average_level,
              COUNT(DISTINCT state.knowledge_unit_id) FILTER(WHERE state.level>=3)::int AS verified_objectives,
              COUNT(DISTINCT state.knowledge_unit_id) FILTER(WHERE state.next_review_at<=NOW())::int AS due_reviews,
              COUNT(DISTINCT state.knowledge_unit_id) FILTER(WHERE state.status='NEEDS_REVIEW')::int AS needs_review
         FROM learning_states state JOIN learners ON learners.user_id=state.user_id
        WHERE state.company_id=$1 AND state.project_id=$2 GROUP BY state.user_id
     ), mission_summary AS (
       SELECT mission.learner_id,
              COUNT(DISTINCT mission.id) FILTER(WHERE mission.status='PAUSED')::int AS paused_missions
         FROM learning_missions mission JOIN learners ON learners.user_id=mission.learner_id
        WHERE mission.company_id=$1 AND mission.project_id=$2 GROUP BY mission.learner_id
     ), attempt_summary AS (
       SELECT attempt.learner_id,COUNT(DISTINCT attempt.id)::int AS attempt_count,
              MAX(attempt.submitted_at) AS last_attempt_at
         FROM learning_attempts attempt JOIN learners ON learners.user_id=attempt.learner_id
        WHERE attempt.company_id=$1 AND attempt.project_id=$2 GROUP BY attempt.learner_id
     ), attention_summary AS (
       SELECT attention.learner_user_id,
              array_agg(DISTINCT attention.reason ORDER BY attention.reason) AS attention_reasons
         FROM attention_items attention JOIN learners ON learners.user_id=attention.learner_user_id
        WHERE attention.company_id=$1 AND attention.project_id=$2 AND attention.teacher_user_id=$3
          AND (attention.status IN ('OPEN','ACKNOWLEDGED')
            OR (attention.status='DEFERRED' AND attention.deferred_until<=NOW()))
        GROUP BY attention.learner_user_id
     )
     SELECT learners.user_id AS "learnerId",user_account.display_name AS "displayName",user_account.email,
            COALESCE(state_summary.average_level,0)::float8 AS "averageLevel",
            COALESCE(state_summary.verified_objectives,0)::int AS "verifiedObjectives",
            COALESCE(state_summary.due_reviews,0)::int AS "dueReviews",
            COALESCE(state_summary.needs_review,0)::int AS "needsReview",
            COALESCE(mission_summary.paused_missions,0)::int AS "pausedMissions",
            COALESCE(attempt_summary.attempt_count,0)::int AS "attemptCount",
            attempt_summary.last_attempt_at AS "lastAttemptAt",
            COALESCE(attention_summary.attention_reasons,ARRAY[]::text[]) AS "attentionReasons"
       FROM learners JOIN users user_account ON user_account.id=learners.user_id
       LEFT JOIN state_summary ON state_summary.user_id=learners.user_id
       LEFT JOIN mission_summary ON mission_summary.learner_id=learners.user_id
       LEFT JOIN attempt_summary ON attempt_summary.learner_id=learners.user_id
       LEFT JOIN attention_summary ON attention_summary.learner_user_id=learners.user_id
      WHERE (NOT $4::boolean OR attention_summary.learner_user_id IS NOT NULL)
        AND ($5::text IS NULL OR learners.user_id>$5)
        AND ($6::text IS NULL OR user_account.display_name ILIKE '%'||$6||'%'
          OR user_account.email ILIKE '%'||$6||'%')
      ORDER BY learners.user_id LIMIT $7`,
    [
      args.companyId,
      args.projectId,
      args.reviewerId,
      args.attentionOnly,
      args.afterLearnerId,
      args.search,
      args.limit,
    ],
  )
  return rows
}

export async function findLearningDashboardLearner(
  db: Queryable,
  args: { companyId: string; projectId: string; learnerId: string },
): Promise<DataRow | null> {
  const { rows } = await db.query<DataRow>(
    `SELECT member.user_id AS "learnerId",user_account.display_name AS "displayName",
            user_account.email,member.created_at AS "joinedAt"
       FROM project_memberships member JOIN users user_account ON user_account.id=member.user_id
      WHERE member.company_id=$1 AND member.project_id=$2 AND member.user_id=$3
        AND member.status='ACTIVE' AND member.role IN ('STUDENT','OBSERVER')`,
    [args.companyId, args.projectId, args.learnerId],
  )
  return rows[0] ?? null
}

export async function listTeacherObjectives(
  db: Queryable,
  scope: TeacherReportingScope,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT unit.*,
      COALESCE(jsonb_agg(dependency.prerequisite_knowledge_unit_id)
        FILTER(WHERE dependency.prerequisite_knowledge_unit_id IS NOT NULL),'[]'::jsonb) AS prerequisite_ids
     FROM learning_knowledge_units unit
     LEFT JOIN learning_knowledge_unit_dependencies dependency
       ON dependency.company_id=unit.company_id AND dependency.project_id=unit.project_id
      AND dependency.knowledge_unit_id=unit.id
    WHERE unit.company_id=$1 AND unit.project_id=$2
    GROUP BY unit.id
    ORDER BY unit.position`,
    [scope.companyId, scope.projectId],
  )
  return rows
}

export async function listTeacherActivities(
  db: Queryable,
  scope: TeacherReportingScope,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT * FROM learning_activities
      WHERE company_id=$1 AND project_id=$2
      ORDER BY created_at DESC`,
    [scope.companyId, scope.projectId],
  )
  return rows
}

export async function listTeacherReviews(
  db: Queryable,
  scope: TeacherReportingScope,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT evaluation.*,attempt.learner_id,attempt.activity_id
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.company_id=evaluation.company_id AND attempt.project_id=evaluation.project_id
        AND attempt.id=evaluation.attempt_id
      WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND evaluation.status='PENDING'
      ORDER BY evaluation.created_at
      LIMIT 100`,
    [scope.companyId, scope.projectId],
  )
  return rows
}

export async function listTeacherBindableRooms(
  db: Queryable,
  scope: TeacherReportingScope,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT conversation.id AS conversation_id,conversation.title,
      CASE WHEN conversation.id=course.study_room_conversation_id
        THEN 'study'::text ELSE room.purpose END AS purpose,
      (conversation.id=course.study_room_conversation_id OR room.course_id=$2) AS bound
     FROM courses course
     JOIN conversations conversation
       ON conversation.project_id=course.project_id AND conversation.company_id=course.company_id
     LEFT JOIN learning_course_rooms room
       ON room.conversation_id=conversation.id AND room.company_id=course.company_id
    WHERE course.company_id=$1 AND course.id=$2 AND conversation.kind='group'
      AND NOT EXISTS(
        SELECT 1 FROM learning_course_teacher_rooms teacher_room
         WHERE teacher_room.company_id=$1 AND teacher_room.conversation_id=conversation.id
      )
      AND (room.course_id IS NULL OR room.course_id=$2)
    ORDER BY conversation.updated_at DESC
    LIMIT 100`,
    [scope.companyId, scope.courseId],
  )
  return rows
}
