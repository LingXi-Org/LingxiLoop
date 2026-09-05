import type { Queryable } from '../../db/queryable.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import type {
  LearningActivity,
  LearningActivityType,
  LearningCourseActivity,
} from './types.js'

interface LearningActivityRow {
  id: string
  project_id: string
  title: string
  instructions: string
  kind: LearningActivity['kind']
  status: LearningActivity['status']
  evaluation_mode: LearningActivity['evaluationMode']
  target_level: 1 | 2 | 3 | 4
  rubric: unknown[]
  knowledge_unit_ids: string[]
  due_at: string | null
}

const learningActivityColumns = `activity.id,activity.project_id,activity.title,activity.instructions,
  activity.kind,activity.status,activity.evaluation_mode,activity.target_level,activity.rubric,activity.due_at,
  COALESCE((SELECT array_agg(link.knowledge_unit_id ORDER BY link.knowledge_unit_id)
    FROM learning_activity_knowledge_units link
    WHERE link.company_id=activity.company_id AND link.project_id=activity.project_id
      AND link.activity_id=activity.id),'{}') AS knowledge_unit_ids`

function mapLearningActivity(row: LearningActivityRow): LearningActivity {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    instructions: row.instructions,
    kind: row.kind,
    status: row.status,
    evaluationMode: row.evaluation_mode,
    targetLevel: row.target_level,
    rubric: Array.isArray(row.rubric) ? row.rubric : [],
    knowledgeUnitIds: Array.isArray(row.knowledge_unit_ids) ? row.knowledge_unit_ids.map(String) : [],
    ...(row.due_at ? { dueAt: String(row.due_at) } : {}),
  }
}

function projectCourseActivity(activity: LearningActivity, courseId: string): LearningCourseActivity {
  return {
    id: activity.id,
    courseId,
    title: activity.title,
    instructions: activity.instructions,
    type: activity.kind,
    status: activity.status,
    evaluationMode: activity.evaluationMode,
    targetLevel: activity.targetLevel,
    rubric: activity.rubric,
    objectiveIds: activity.knowledgeUnitIds,
    ...(activity.dueAt ? { dueAt: activity.dueAt } : {}),
  }
}

interface LearningActivityWrite {
  id: string
  companyId: string
  projectId: string
  actorId: string
  title: string
  instructions: string
  kind: LearningActivityType
  evaluationMode: LearningActivity['evaluationMode']
  targetLevel: 1 | 2 | 3 | 4
  rubric: unknown[]
  knowledgeUnitIds: string[]
  dueAt?: string
}

export async function insertProjectLearningActivity(db: Queryable, args: LearningActivityWrite): Promise<void> {
  const { rows } = await db.query<{ id: string | null }>(
    `WITH valid_project AS (
       SELECT project.company_id,project.id AS project_id
         FROM projects project
        WHERE project.company_id=$2 AND project.id=$3
          AND (SELECT COUNT(*)::int FROM learning_knowledge_units unit
                WHERE unit.company_id=project.company_id AND unit.project_id=project.id
                  AND unit.id=ANY($11::text[]))=cardinality($11::text[])
     ), inserted_activity AS (
       INSERT INTO learning_activities
         (id,company_id,project_id,title,instructions,kind,evaluation_mode,target_level,rubric,due_at,created_by)
       SELECT $1,company_id,project_id,$4,$5,$6,$7,$8,$9::jsonb,$10,$12 FROM valid_project
       RETURNING id,company_id,project_id
     ), inserted_links AS (
       INSERT INTO learning_activity_knowledge_units(company_id,project_id,activity_id,knowledge_unit_id)
       SELECT activity.company_id,activity.project_id,activity.id,unit.id
         FROM inserted_activity activity
         JOIN learning_knowledge_units unit
           ON unit.company_id=activity.company_id AND unit.project_id=activity.project_id
          AND unit.id=ANY($11::text[])
       RETURNING knowledge_unit_id
     )
     SELECT (SELECT id FROM inserted_activity) AS id`,
    [args.id,args.companyId,args.projectId,args.title,args.instructions,args.kind,args.evaluationMode,args.targetLevel,
      JSON.stringify(args.rubric),args.dueAt ?? null,args.knowledgeUnitIds,args.actorId],
  )
  if (!rows[0]?.id) throw new Error('project or knowledge unit not found')
}

export async function insertLearningActivity(
  db: Queryable,
  args: Omit<LearningActivityWrite, 'projectId'|'kind'|'knowledgeUnitIds'> & {
    courseId: string
    type: LearningActivityType
    objectiveIds: string[]
  },
): Promise<void> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  await insertProjectLearningActivity(db, {
    ...args,
    projectId: project.projectId,
    kind: args.type,
    knowledgeUnitIds: args.objectiveIds,
  })
}

export async function findProjectLearningActivity(
  db: Queryable,
  companyId: string,
  projectId: string,
  activityId: string,
): Promise<LearningActivity | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT ${learningActivityColumns} FROM learning_activities activity
      WHERE activity.company_id=$1 AND activity.project_id=$2 AND activity.id=$3`,
    [companyId,projectId,activityId],
  )
  return rows[0] ? mapLearningActivity(rows[0]) : null
}

export async function findLearningActivity(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<LearningCourseActivity | null> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  const activity = await findProjectLearningActivity(db, companyId, project.projectId, activityId)
  return activity ? projectCourseActivity(activity, courseId) : null
}

export async function findVisibleProjectLearningActivity(
  db: Queryable,
  companyId: string,
  projectId: string,
  activityId: string,
): Promise<LearningActivity | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT ${learningActivityColumns} FROM learning_activities activity
      WHERE activity.company_id=$1 AND activity.project_id=$2 AND activity.id=$3
        AND activity.status IN ('PUBLISHED','CLOSED')`,
    [companyId,projectId,activityId],
  )
  return rows[0] ? mapLearningActivity(rows[0]) : null
}

export async function findVisibleLearningActivity(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<LearningCourseActivity | null> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  const activity = await findVisibleProjectLearningActivity(db, companyId, project.projectId, activityId)
  return activity ? projectCourseActivity(activity, courseId) : null
}

export async function listProjectLearningActivities(
  db: Queryable,
  companyId: string,
  projectId: string,
  includeDrafts: boolean,
): Promise<LearningActivity[]> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT ${learningActivityColumns} FROM learning_activities activity
      WHERE activity.company_id=$1 AND activity.project_id=$2
        AND ($3::boolean OR activity.status IN ('PUBLISHED','CLOSED'))
      ORDER BY activity.created_at DESC`,
    [companyId,projectId,includeDrafts],
  )
  return rows.map(mapLearningActivity)
}

export async function listLearningActivities(
  db: Queryable,
  companyId: string,
  courseId: string,
  includeDrafts: boolean,
): Promise<LearningCourseActivity[]> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  return (await listProjectLearningActivities(db, companyId, project.projectId, includeDrafts))
    .map((activity) => projectCourseActivity(activity, courseId))
}

export async function lockProjectLearningActivityForPublish(
  db: Queryable,
  companyId: string,
  projectId: string,
  activityId: string,
): Promise<Pick<LearningActivity, 'kind'|'rubric'|'knowledgeUnitIds'> | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT ${learningActivityColumns} FROM learning_activities activity
      WHERE activity.company_id=$1 AND activity.project_id=$2 AND activity.id=$3
        AND activity.status='DRAFT' FOR UPDATE`,
    [companyId,projectId,activityId],
  )
  const activity = rows[0] ? mapLearningActivity(rows[0]) : null
  return activity ? {
    kind: activity.kind,
    rubric: activity.rubric,
    knowledgeUnitIds: activity.knowledgeUnitIds,
  } : null
}

export async function lockLearningActivityForPublish(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<Pick<LearningCourseActivity, 'type'|'rubric'|'objectiveIds'> | null> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  const activity = await lockProjectLearningActivityForPublish(db, companyId, project.projectId, activityId)
  return activity ? { type: activity.kind, rubric: activity.rubric, objectiveIds: activity.knowledgeUnitIds } : null
}

interface ActivityStatusWrite {
  companyId: string
  projectId: string
  activityId: string
  teacherId: string
}

export async function publishProjectLearningActivityRecord(
  db: Queryable,
  args: ActivityStatusWrite,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_activities activity
        SET status='PUBLISHED',published_by=$4,published_at=NOW(),updated_at=NOW()
      WHERE activity.company_id=$1 AND activity.project_id=$2 AND activity.id=$3 AND activity.status='DRAFT'`,
    [args.companyId,args.projectId,args.activityId,args.teacherId],
  )
  return Boolean(result.rowCount)
}

export async function publishLearningActivityRecord(
  db: Queryable,
  args: Omit<ActivityStatusWrite, 'projectId'> & { courseId: string },
): Promise<boolean> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  return publishProjectLearningActivityRecord(db, { ...args, projectId: project.projectId })
}

export async function closeProjectLearningActivityRecord(
  db: Queryable,
  args: ActivityStatusWrite,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_activities activity SET status='CLOSED',updated_at=NOW()
      WHERE activity.company_id=$1 AND activity.project_id=$2 AND activity.id=$3
        AND activity.status='PUBLISHED'`,
    [args.companyId,args.projectId,args.activityId],
  )
  return Boolean(result.rowCount)
}

export async function closeLearningActivityRecord(
  db: Queryable,
  args: Omit<ActivityStatusWrite, 'projectId'> & { courseId: string },
): Promise<boolean> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  return closeProjectLearningActivityRecord(db, { ...args, projectId: project.projectId })
}

interface ActivityAttemptWrite {
  id: string
  companyId: string
  projectId: string
  activityId: string
  learnerId: string
  assistance: 'NONE'|'HINT'|'GUIDED'
  evidenceId: string
  idempotencyKey: string
}

export async function insertProjectLearningActivityAttempt(
  db: Queryable,
  args: ActivityAttemptWrite,
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO learning_attempts
       (id,company_id,project_id,learner_id,activity_id,assistance,evidence_id,client_submission_id)
     SELECT $1,activity.company_id,activity.project_id,$5,activity.id,$6,$7,$8
       FROM learning_activities activity
      WHERE activity.company_id=$2 AND activity.project_id=$3 AND activity.id=$4
        AND activity.status='PUBLISHED'
     ON CONFLICT(company_id,project_id,activity_id,learner_id,client_submission_id)
       WHERE activity_id IS NOT NULL AND client_submission_id IS NOT NULL
     DO UPDATE SET id=learning_attempts.id
     RETURNING id`,
    [args.id,args.companyId,args.projectId,args.activityId,args.learnerId,args.assistance,
      args.evidenceId,args.idempotencyKey],
  )
  return rows[0]?.id ?? null
}

export async function insertLearningActivityAttempt(
  db: Queryable,
  args: Omit<ActivityAttemptWrite, 'projectId'> & { courseId: string },
): Promise<string | null> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  return insertProjectLearningActivityAttempt(db, { ...args, projectId: project.projectId })
}
