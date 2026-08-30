import type { Queryable } from '../../db/queryable.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import type {
  LearningKnowledgeUnit,
  LearningKnowledgeUnitStatus,
  LearningObjective,
} from './types.js'

export * from './activities-repository.js'
export * from './project-scope-repository.js'

interface KnowledgeUnitWrite {
  id: string
  companyId: string
  projectId: string
  actorId: string
  title: string
  successCriteria: string
  targetLevel: 1 | 2 | 3 | 4
  position: number
}

export async function insertLearningKnowledgeUnit(db: Queryable, args: KnowledgeUnitWrite): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_knowledge_units
       (id,company_id,project_id,title,success_criteria,target_level,position,status,created_by)
     SELECT $1,project.company_id,project.id,$4,$5,$6,$7,'DRAFT',$8
       FROM projects project WHERE project.company_id=$2 AND project.id=$3`,
    [args.id,args.companyId,args.projectId,args.title,args.successCriteria,args.targetLevel,args.position,args.actorId],
  )
  if (!result.rowCount) throw new Error('project not found')
}

export async function insertLearningObjective(
  db: Queryable,
  args: Omit<KnowledgeUnitWrite, 'projectId'> & { courseId: string },
): Promise<void> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  await insertLearningKnowledgeUnit(db, { ...args, projectId: project.projectId })
}

export async function insertLearningKnowledgeUnitDependency(
  db: Queryable,
  args: { companyId: string; projectId: string; knowledgeUnitId: string; prerequisiteKnowledgeUnitId: string },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_knowledge_unit_dependencies
       (company_id,project_id,knowledge_unit_id,prerequisite_knowledge_unit_id)
     SELECT unit.company_id,unit.project_id,unit.id,prerequisite.id
       FROM learning_knowledge_units unit
       JOIN learning_knowledge_units prerequisite
         ON prerequisite.company_id=unit.company_id AND prerequisite.project_id=unit.project_id
        AND prerequisite.id=$4
      WHERE unit.company_id=$1 AND unit.project_id=$2 AND unit.id=$3
     ON CONFLICT(company_id,project_id,knowledge_unit_id,prerequisite_knowledge_unit_id)
     DO UPDATE SET prerequisite_knowledge_unit_id=EXCLUDED.prerequisite_knowledge_unit_id`,
    [args.companyId,args.projectId,args.knowledgeUnitId,args.prerequisiteKnowledgeUnitId],
  )
  if (!result.rowCount) throw new Error('prerequisite knowledge unit not found in the current project')
}

export async function insertLearningObjectiveDependency(
  db: Queryable,
  args: { companyId: string; courseId: string; objectiveId: string; prerequisiteId: string },
): Promise<void> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  await insertLearningKnowledgeUnitDependency(db, {
    companyId: args.companyId,
    projectId: project.projectId,
    knowledgeUnitId: args.objectiveId,
    prerequisiteKnowledgeUnitId: args.prerequisiteId,
  })
}

interface LearningKnowledgeUnitRow {
  id: string
  project_id: string
  title: string
  success_criteria: string
  target_level: 1 | 2 | 3 | 4
  position: number
  status: LearningKnowledgeUnitStatus
  prerequisite_knowledge_unit_ids: string[]
}

function mapLearningKnowledgeUnit(row: LearningKnowledgeUnitRow): LearningKnowledgeUnit {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    successCriteria: row.success_criteria,
    targetLevel: row.target_level,
    position: Number(row.position),
    status: row.status,
    prerequisiteKnowledgeUnitIds: row.prerequisite_knowledge_unit_ids,
  }
}

export async function listProjectLearningKnowledgeUnits(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<LearningKnowledgeUnit[]> {
  const { rows } = await db.query<LearningKnowledgeUnitRow>(
    `SELECT unit.id,unit.project_id,unit.title,unit.success_criteria,unit.target_level,unit.position,unit.status,
            COALESCE(array_agg(dependency.prerequisite_knowledge_unit_id)
              FILTER (WHERE dependency.prerequisite_knowledge_unit_id IS NOT NULL),'{}')
              AS prerequisite_knowledge_unit_ids
       FROM learning_knowledge_units unit
       LEFT JOIN learning_knowledge_unit_dependencies dependency
         ON dependency.company_id=unit.company_id AND dependency.project_id=unit.project_id
        AND dependency.knowledge_unit_id=unit.id
      WHERE unit.company_id=$1 AND unit.project_id=$2
      GROUP BY unit.id ORDER BY unit.position,unit.created_at`,
    [companyId, projectId],
  )
  return rows.map(mapLearningKnowledgeUnit)
}

function projectObjective(unit: LearningKnowledgeUnit, courseId: string): LearningObjective {
  return {
    id: unit.id,
    courseId,
    title: unit.title,
    successCriteria: unit.successCriteria,
    targetLevel: unit.targetLevel,
    position: unit.position,
    status: unit.status,
    prerequisiteIds: unit.prerequisiteKnowledgeUnitIds,
  }
}

export async function listLearningObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<LearningObjective[]> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  return (await listProjectLearningKnowledgeUnits(db, companyId, project.projectId))
    .map((unit) => projectObjective(unit, courseId))
}

export async function updateLearningKnowledgeUnitStatus(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    knowledgeUnitId: string
    teacherId: string
    status: LearningKnowledgeUnitStatus
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_knowledge_units unit SET status=$4,updated_at=NOW()
      WHERE unit.company_id=$1 AND unit.project_id=$2 AND unit.id=$3`,
    [args.companyId,args.projectId,args.knowledgeUnitId,args.status],
  )
  return Boolean(result.rowCount)
}

export async function updateLearningObjectiveStatus(
  db: Queryable,
  args: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: LearningKnowledgeUnitStatus
  },
): Promise<boolean> {
  const project = await requireLearningCourseProjectScope(db, args.companyId, args.courseId)
  return updateLearningKnowledgeUnitStatus(db, {
    companyId: args.companyId,
    projectId: project.projectId,
    knowledgeUnitId: args.objectiveId,
    teacherId: args.teacherId,
    status: args.status,
  })
}

export async function countProjectLearningKnowledgeUnits(
  db: Queryable,
  companyId: string,
  projectId: string,
  knowledgeUnitIds: string[],
): Promise<number> {
  if (!knowledgeUnitIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM learning_knowledge_units
      WHERE company_id=$1 AND project_id=$2 AND id=ANY($3::text[])`,
    [companyId,projectId,knowledgeUnitIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function countCourseObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveIds: string[],
): Promise<number> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  return countProjectLearningKnowledgeUnits(db, companyId, project.projectId, objectiveIds)
}

export async function countPublishedProjectLearningKnowledgeUnits(
  db: Queryable,
  companyId: string,
  projectId: string,
  knowledgeUnitIds: string[],
): Promise<number> {
  if (!knowledgeUnitIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT id FROM learning_knowledge_units
        WHERE company_id=$1 AND project_id=$2 AND status='PUBLISHED' AND id=ANY($3::text[])
        FOR SHARE
     ) locked_unit`,
    [companyId,projectId,knowledgeUnitIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function countPublishedCourseObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveIds: string[],
): Promise<number> {
  const project = await requireLearningCourseProjectScope(db, companyId, courseId)
  return countPublishedProjectLearningKnowledgeUnits(db, companyId, project.projectId, objectiveIds)
}
