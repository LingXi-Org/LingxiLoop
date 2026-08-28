import type { Queryable } from '../../db/queryable.js'
import type { LearningActivity, LearningActivityType, LearningObjective, LearningObjectiveStatus } from './types.js'

export async function listDeliveries(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT * FROM learning_notification_deliveries
      WHERE company_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`,
    [companyId, userId],
  )
  return rows
}

export async function insertLearningObjective(
  db: Queryable,
  args: {
    id: string
    companyId: string
    courseId: string
    actorId: string
    title: string
    successCriteria: string
    targetLevel: 1 | 2 | 3 | 4
    position: number
  },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_objectives
       (id,course_id,company_id,title,success_criteria,target_level,position,status,created_by)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,'draft',$8
       FROM courses course WHERE course.id=$2 AND course.company_id=$3`,
    [args.id,args.courseId,args.companyId,args.title,args.successCriteria,args.targetLevel,args.position,args.actorId],
  )
  if (!result.rowCount) throw new Error('course not found')
}

export async function insertLearningObjectiveDependency(
  db: Queryable,
  args: { companyId: string; courseId: string; objectiveId: string; prerequisiteId: string },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_objective_dependencies(objective_id,prerequisite_objective_id)
     SELECT objective.id,prerequisite.id
       FROM learning_objectives objective
       JOIN learning_objectives prerequisite
         ON prerequisite.id=$4 AND prerequisite.course_id=objective.course_id
        AND prerequisite.company_id=objective.company_id
      WHERE objective.id=$1 AND objective.course_id=$2 AND objective.company_id=$3
     ON CONFLICT DO NOTHING`,
    [args.objectiveId,args.courseId,args.companyId,args.prerequisiteId],
  )
  if (!result.rowCount) throw new Error('prerequisite objective not found in the current course')
}

export async function listLearningObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<LearningObjective[]> {
  const { rows } = await db.query<{
    id: string; course_id: string; title: string; success_criteria: string; target_level: 1|2|3|4
    position: number; status: LearningObjectiveStatus; prerequisite_ids: string[]
  }>(
    `SELECT objective.id,objective.course_id,objective.title,objective.success_criteria,
            objective.target_level,objective.position,objective.status,
            COALESCE(array_agg(dependency.prerequisite_objective_id)
              FILTER (WHERE dependency.prerequisite_objective_id IS NOT NULL),'{}') AS prerequisite_ids
       FROM learning_objectives objective
       LEFT JOIN learning_objective_dependencies dependency ON dependency.objective_id=objective.id
      WHERE objective.course_id=$2 AND objective.company_id=$1
      GROUP BY objective.id ORDER BY objective.position,objective.created_at`,
    [companyId, courseId],
  )
  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    successCriteria: row.success_criteria,
    targetLevel: row.target_level,
    position: Number(row.position),
    status: row.status,
    prerequisiteIds: row.prerequisite_ids,
  }))
}

export async function updateLearningObjectiveStatus(
  db: Queryable,
  args: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: LearningObjectiveStatus
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_objectives objective SET status=$5,updated_at=NOW()
      WHERE objective.id=$3 AND objective.course_id=$2 AND objective.company_id=$1
        AND EXISTS(
          SELECT 1 FROM course_members member
           WHERE member.course_id=objective.course_id AND member.company_id=objective.company_id
             AND member.user_id=$4 AND member.role='teacher'
        )`,
    [args.companyId,args.courseId,args.objectiveId,args.teacherId,args.status],
  )
  return Boolean(result.rowCount)
}

interface LearningActivityRow {
  id: string
  course_id: string
  title: string
  instructions: string
  type: LearningActivity['type']
  status: LearningActivity['status']
  evaluation_mode: LearningActivity['evaluationMode']
  target_level: 1 | 2 | 3 | 4
  rubric: unknown[]
  objective_ids: string[]
  due_at: string | null
}

function mapLearningActivity(row: LearningActivityRow): LearningActivity {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    instructions: row.instructions,
    type: row.type,
    status: row.status,
    evaluationMode: row.evaluation_mode,
    targetLevel: row.target_level,
    rubric: Array.isArray(row.rubric) ? row.rubric : [],
    objectiveIds: Array.isArray(row.objective_ids) ? row.objective_ids.map(String) : [],
    ...(row.due_at ? { dueAt: String(row.due_at) } : {}),
  }
}

export async function countCourseObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveIds: string[],
): Promise<number> {
  if (!objectiveIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM learning_objectives
      WHERE company_id=$1 AND course_id=$2 AND id=ANY($3::text[])`,
    [companyId,courseId,objectiveIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function insertLearningActivity(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; actorId: string; title: string; instructions: string
    type: LearningActivityType; evaluationMode: LearningActivity['evaluationMode']; targetLevel: 1|2|3|4
    rubric: unknown[]; objectiveIds: string[]; dueAt?: string
  },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_activities
       (id,course_id,company_id,title,instructions,type,evaluation_mode,target_level,rubric,objective_ids,due_at,created_by)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12
       FROM courses course WHERE course.id=$2 AND course.company_id=$3`,
    [args.id,args.courseId,args.companyId,args.title,args.instructions,args.type,args.evaluationMode,args.targetLevel,
      JSON.stringify(args.rubric),JSON.stringify(args.objectiveIds),args.dueAt ?? null,args.actorId],
  )
  if (!result.rowCount) throw new Error('course not found')
}

export async function findLearningActivity(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<LearningActivity | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT id,course_id,title,instructions,type,status,evaluation_mode,target_level,rubric,objective_ids,due_at
       FROM learning_activities WHERE company_id=$1 AND course_id=$2 AND id=$3`,
    [companyId,courseId,activityId],
  )
  return rows[0] ? mapLearningActivity(rows[0]) : null
}

export async function findVisibleLearningActivity(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<LearningActivity | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT id,course_id,title,instructions,type,status,evaluation_mode,target_level,rubric,objective_ids,due_at
       FROM learning_activities
      WHERE company_id=$1 AND course_id=$2 AND id=$3 AND status IN ('published','closed')`,
    [companyId,courseId,activityId],
  )
  return rows[0] ? mapLearningActivity(rows[0]) : null
}

export async function listLearningActivities(
  db: Queryable,
  companyId: string,
  courseId: string,
  includeDrafts: boolean,
): Promise<LearningActivity[]> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT id,course_id,title,instructions,type,status,evaluation_mode,target_level,rubric,objective_ids,due_at
       FROM learning_activities
      WHERE company_id=$1 AND course_id=$2 AND ($3::boolean OR status IN ('published','closed'))
      ORDER BY created_at DESC`,
    [companyId,courseId,includeDrafts],
  )
  return rows.map(mapLearningActivity)
}

export async function lockLearningActivityForPublish(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<Pick<LearningActivity, 'type' | 'rubric' | 'objectiveIds'> | null> {
  const { rows } = await db.query<Pick<LearningActivityRow, 'type' | 'rubric' | 'objective_ids'>>(
    `SELECT type,rubric,objective_ids FROM learning_activities
      WHERE company_id=$1 AND course_id=$2 AND id=$3 AND status='draft' FOR UPDATE`,
    [companyId,courseId,activityId],
  )
  const row = rows[0]
  return row ? {
    type: row.type,
    rubric: Array.isArray(row.rubric) ? row.rubric : [],
    objectiveIds: Array.isArray(row.objective_ids) ? row.objective_ids.map(String) : [],
  } : null
}

export async function countPublishedCourseObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveIds: string[],
): Promise<number> {
  if (!objectiveIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT id FROM learning_objectives
        WHERE company_id=$1 AND course_id=$2 AND status='published' AND id=ANY($3::text[])
        FOR SHARE
     ) locked_objective`,
    [companyId,courseId,objectiveIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function publishLearningActivityRecord(
  db: Queryable,
  args: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_activities activity
        SET status='published',published_by=$4,published_at=NOW(),updated_at=NOW()
      WHERE activity.company_id=$1 AND activity.course_id=$2 AND activity.id=$3 AND activity.status='draft'
        AND EXISTS(SELECT 1 FROM course_members member
          WHERE member.company_id=activity.company_id AND member.course_id=activity.course_id
            AND member.user_id=$4 AND member.role='teacher')`,
    [args.companyId,args.courseId,args.activityId,args.teacherId],
  )
  return Boolean(result.rowCount)
}

export async function closeLearningActivityRecord(
  db: Queryable,
  args: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_activities activity SET status='closed',updated_at=NOW()
      WHERE activity.company_id=$1 AND activity.course_id=$2 AND activity.id=$3 AND activity.status='published'
        AND EXISTS(SELECT 1 FROM course_members member
          WHERE member.company_id=activity.company_id AND member.course_id=activity.course_id
            AND member.user_id=$4 AND member.role='teacher')`,
    [args.companyId,args.courseId,args.activityId,args.teacherId],
  )
  return Boolean(result.rowCount)
}

export async function insertLearningActivityAttempt(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; activityId: string; learnerId: string
    assistance: 'none'|'hint'|'guided'; answer: string; idempotencyKey: string
  },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO learning_attempts(id,course_id,company_id,learner_id,activity_id,assistance,evidence,client_submission_id)
     SELECT $1,course.id,course.company_id,$5,activity.id,$6,$7::jsonb,$8
       FROM courses course
       JOIN learning_activities activity
         ON activity.course_id=course.id AND activity.company_id=course.company_id
        AND activity.id=$4 AND activity.status='published'
       JOIN course_members learner
         ON learner.course_id=course.id AND learner.company_id=course.company_id
        AND learner.user_id=$5 AND learner.role='learner'
      WHERE course.company_id=$2 AND course.id=$3
     ON CONFLICT(company_id,course_id,activity_id,learner_id,client_submission_id)
       WHERE client_submission_id IS NOT NULL
     DO UPDATE SET id=learning_attempts.id
     RETURNING id`,
    [args.id,args.companyId,args.courseId,args.activityId,args.learnerId,args.assistance,
      JSON.stringify({ kind: 'ui_submission', submittedBy: args.learnerId, answer: args.answer }),args.idempotencyKey],
  )
  return rows[0]?.id ?? null
}
