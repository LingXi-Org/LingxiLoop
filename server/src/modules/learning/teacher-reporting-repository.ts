import type { Queryable } from '../../db/queryable.js'

export interface TeacherReportingScope {
  companyId: string
  courseId: string
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
          (SELECT COUNT(*) FROM course_members
            WHERE company_id=$1 AND course_id=$2 AND role='learner') *
          (SELECT COUNT(*) FROM learning_objectives
            WHERE company_id=$1 AND course_id=$2 AND status<>'archived') AS possible
      ), levels AS (SELECT generate_series(0,4) AS level)
      SELECT levels.level,
        CASE WHEN levels.level=0
          THEN GREATEST(totals.possible-COUNT(mastery.objective_id) FILTER(WHERE mastery.level<>0),0)::int
          ELSE COUNT(mastery.objective_id) FILTER(WHERE mastery.level=levels.level)::int
        END AS objective_states
      FROM levels CROSS JOIN totals
      LEFT JOIN learning_mastery mastery
        ON mastery.company_id=$1 AND mastery.course_id=$2
      GROUP BY levels.level,totals.possible
      ORDER BY levels.level`,
      [scope.companyId, scope.courseId],
    ),
    db.query<DataRow>(
      `SELECT status,COUNT(*)::int AS count
         FROM learning_missions
        WHERE company_id=$1 AND course_id=$2
        GROUP BY status
        ORDER BY status`,
      [scope.companyId, scope.courseId],
    ),
    db.query<DataRow>(
      `SELECT
        COUNT(DISTINCT attempt.id) FILTER(
          WHERE attempt.submitted_at>=NOW()-($3::int*INTERVAL '1 day')
        )::int AS attempts,
        COUNT(DISTINCT evaluation.id) FILTER(WHERE evaluation.status='pending')::int AS pending_reviews,
        COUNT(DISTINCT evaluation.id) FILTER(WHERE evaluation.status='accepted')::int AS accepted_evaluations,
        COUNT(DISTINCT evaluation.id) FILTER(WHERE evaluation.status='rejected')::int AS rejected_evaluations
      FROM learning_attempts attempt
      LEFT JOIN learning_evaluations evaluation ON evaluation.attempt_id=attempt.id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2`,
      [scope.companyId, scope.courseId, windowDays],
    ),
    db.query<DataRow>(
      `SELECT member.user_id,user_account.display_name,
        COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.next_review_at<=NOW())::int AS due_reviews,
        COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.status='needs_review')::int AS needs_review,
        COUNT(DISTINCT mission.id) FILTER(WHERE mission.status='paused')::int AS paused_missions
      FROM course_members member
      JOIN users user_account ON user_account.id=member.user_id
      LEFT JOIN learning_mastery mastery
        ON mastery.company_id=member.company_id
       AND mastery.course_id=member.course_id
       AND mastery.learner_id=member.user_id
      LEFT JOIN learning_missions mission
        ON mission.company_id=member.company_id
       AND mission.course_id=member.course_id
       AND mission.learner_id=member.user_id
      WHERE member.company_id=$1 AND member.course_id=$2 AND member.role='learner'
      GROUP BY member.user_id,user_account.display_name
      HAVING COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.next_review_at<=NOW())>0
          OR COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.status='needs_review')>0
          OR COUNT(DISTINCT mission.id) FILTER(WHERE mission.status='paused')>0
      ORDER BY needs_review DESC,due_reviews DESC
      LIMIT 20`,
      [scope.companyId, scope.courseId],
    ),
    db.query<DataRow>(
      `SELECT
        (SELECT COUNT(*)::int FROM course_members
          WHERE company_id=$1 AND course_id=$2 AND role='learner') AS learners,
        COUNT(DISTINCT attempt.learner_id)::int AS learners_with_evidence,
        COUNT(DISTINCT attempt.id)::int AS verified_attempts,
        COUNT(DISTINCT mastery.learner_id||':'||mastery.objective_id)
          FILTER(WHERE mastery.next_review_at<=NOW())::int AS due_reviews
      FROM learning_attempts attempt
      FULL JOIN learning_mastery mastery
        ON mastery.company_id=attempt.company_id
       AND mastery.course_id=attempt.course_id
       AND mastery.learner_id=attempt.learner_id
      WHERE COALESCE(attempt.company_id,mastery.company_id)=$1
        AND COALESCE(attempt.course_id,mastery.course_id)=$2`,
      [scope.companyId, scope.courseId],
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
      COALESCE(AVG(mastery.level),0)::float AS average_level,
      COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.level>=3)::int AS verified_objectives,
      COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.next_review_at<=NOW())::int AS due_reviews,
      COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.status='needs_review')::int AS needs_review,
      COUNT(DISTINCT mission.id) FILTER(WHERE mission.status='paused')::int AS paused_missions
    FROM course_members member
    JOIN users user_account ON user_account.id=member.user_id
    LEFT JOIN learning_mastery mastery
      ON mastery.company_id=member.company_id
     AND mastery.course_id=member.course_id
     AND mastery.learner_id=member.user_id
    LEFT JOIN learning_missions mission
      ON mission.company_id=member.company_id
     AND mission.course_id=member.course_id
     AND mission.learner_id=member.user_id
    WHERE member.company_id=$1 AND member.course_id=$2 AND member.role='learner'
    GROUP BY member.user_id,user_account.display_name,user_account.email
    HAVING NOT $3::boolean
      OR COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.next_review_at<=NOW())>0
      OR COUNT(DISTINCT mastery.objective_id) FILTER(WHERE mastery.status='needs_review')>0
      OR COUNT(DISTINCT mission.id) FILTER(WHERE mission.status='paused')>0
    ORDER BY needs_review DESC,due_reviews DESC,user_account.display_name
    LIMIT 100`,
    [scope.companyId, scope.courseId, attentionOnly],
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
       FROM course_members member
       JOIN users user_account ON user_account.id=member.user_id
      WHERE member.company_id=$1 AND member.course_id=$2
        AND member.user_id=$3 AND member.role='learner'`,
    [scope.companyId, scope.courseId, learnerId],
  )
  return rows[0]
}

export async function loadTeacherLearnerDetailRows(
  db: Queryable,
  scope: TeacherReportingScope,
  learnerId: string,
): Promise<{ mastery: DataRow[]; missions: DataRow[]; attempts: DataRow[] }> {
  const [mastery, missions, attempts] = await Promise.all([
    db.query<DataRow>(
      `SELECT mastery.objective_id,objective.title,mastery.level,mastery.status,
              mastery.next_review_at,mastery.review_interval_days
         FROM learning_mastery mastery
         JOIN learning_objectives objective
           ON objective.id=mastery.objective_id
          AND objective.company_id=mastery.company_id
          AND objective.course_id=mastery.course_id
        WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3
        ORDER BY objective.position
        LIMIT 100`,
      [scope.companyId, scope.courseId, learnerId],
    ),
    db.query<DataRow>(
      `SELECT id,goal,success_criteria,status,updated_at
         FROM learning_missions
        WHERE company_id=$1 AND course_id=$2 AND learner_id=$3
        ORDER BY updated_at DESC
        LIMIT 20`,
      [scope.companyId, scope.courseId, learnerId],
    ),
    db.query<DataRow>(
      `SELECT attempt.id,attempt.activity_id,attempt.mission_step_id,attempt.assistance,
              attempt.status,attempt.submitted_at,evaluation.demonstrated_level,
              evaluation.confidence,evaluation.status AS evaluation_status,evaluation.feedback
         FROM learning_attempts attempt
         LEFT JOIN LATERAL (
           SELECT * FROM learning_evaluations candidate
            WHERE candidate.attempt_id=attempt.id
            ORDER BY candidate.created_at DESC LIMIT 1
         ) evaluation ON TRUE
        WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND attempt.learner_id=$3
        ORDER BY attempt.submitted_at DESC
        LIMIT 20`,
      [scope.companyId, scope.courseId, learnerId],
    ),
  ])
  return { mastery: mastery.rows, missions: missions.rows, attempts: attempts.rows }
}

export async function findTeacherAttemptDetail(
  db: Queryable,
  scope: TeacherReportingScope,
  attemptId: string,
): Promise<DataRow | undefined> {
  const { rows } = await db.query<DataRow>(
    `SELECT attempt.id,attempt.learner_id,attempt.activity_id,attempt.mission_step_id,
            attempt.assistance,attempt.status,attempt.submitted_at,attempt.evidence,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id',evaluation.id,'level',evaluation.demonstrated_level,
              'confidence',evaluation.confidence,'status',evaluation.status,
              'feedback',evaluation.feedback
            )) FILTER(WHERE evaluation.id IS NOT NULL),'[]'::jsonb) AS evaluations
       FROM learning_attempts attempt
       LEFT JOIN learning_evaluations evaluation ON evaluation.attempt_id=attempt.id
      WHERE attempt.id=$3 AND attempt.company_id=$1 AND attempt.course_id=$2
      GROUP BY attempt.id`,
    [scope.companyId, scope.courseId, attemptId],
  )
  return rows[0]
}

export async function listTeacherObjectives(
  db: Queryable,
  scope: TeacherReportingScope,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT objective.*,
      COALESCE(jsonb_agg(dependency.prerequisite_objective_id)
        FILTER(WHERE dependency.prerequisite_objective_id IS NOT NULL),'[]'::jsonb) AS prerequisite_ids
     FROM learning_objectives objective
     LEFT JOIN learning_objective_dependencies dependency ON dependency.objective_id=objective.id
    WHERE objective.company_id=$1 AND objective.course_id=$2
    GROUP BY objective.id
    ORDER BY objective.position`,
    [scope.companyId, scope.courseId],
  )
  return rows
}

export async function listTeacherActivities(
  db: Queryable,
  scope: TeacherReportingScope,
): Promise<DataRow[]> {
  const { rows } = await db.query<DataRow>(
    `SELECT * FROM learning_activities
      WHERE company_id=$1 AND course_id=$2
      ORDER BY created_at DESC`,
    [scope.companyId, scope.courseId],
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
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'
      ORDER BY evaluation.created_at
      LIMIT 100`,
    [scope.companyId, scope.courseId],
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
