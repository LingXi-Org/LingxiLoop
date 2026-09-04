import type { ProjectKind, ProjectStatus } from '../../domain/public.js'
import type { Queryable } from '../../db/queryable.js'

export interface LearningProjectScope {
  companyId: string
  projectId: string
  projectKind: ProjectKind
  projectStatus: ProjectStatus
}

export interface LearningCourseProjectScope extends LearningProjectScope {
  courseId: string
}

/**
 * Resolves the teaching-only Course address to its owning Project. ProjectKind
 * is read from projects.kind and is never inferred from the presence of a Course.
 */
export async function findLearningCourseProjectScope(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<LearningCourseProjectScope | null> {
  const { rows } = await db.query<{
    course_id: string
    company_id: string
    project_id: string
    project_kind: ProjectKind
    project_status: ProjectStatus
  }>(
    `SELECT course.id AS course_id,project.company_id,project.id AS project_id,
            project.kind AS project_kind,project.status AS project_status
      FROM courses course
      JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE course.company_id=$1 AND course.id=$2
        AND project.kind IN ('TEACHING','INSTITUTIONAL_COURSE')`,
    [companyId, courseId],
  )
  const row = rows[0]
  return row ? {
    companyId: row.company_id,
    projectId: row.project_id,
    projectKind: row.project_kind,
    projectStatus: row.project_status,
    courseId: row.course_id,
  } : null
}

export async function requireLearningCourseProjectScope(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<LearningCourseProjectScope> {
  const scope = await findLearningCourseProjectScope(db, companyId, courseId)
  if (!scope) throw new Error('course not found')
  return scope
}
