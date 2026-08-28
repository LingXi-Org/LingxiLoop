import type { Queryable } from '../../db/queryable.js'

type DataRow = Record<string, unknown>

export async function updateTeacherCourseMetadata(
  db: Queryable,
  input: {
    companyId: string
    courseId: string
    title?: string
    description?: string
  },
): Promise<DataRow | undefined> {
  const { rows } = await db.query<DataRow>(
    `UPDATE projects project
        SET name=COALESCE($3,project.name),description=COALESCE($4,project.description),
            updated_at=NOW()
       FROM courses course
      WHERE course.company_id=$1 AND course.id=$2
        AND course.project_id=project.id AND course.company_id=project.company_id
      RETURNING project.*`,
    [input.companyId, input.courseId, input.title ?? null, input.description ?? null],
  )
  if (input.title) {
    await db.query(
      `UPDATE participants participant
          SET name=$3,updated_at=NOW()
         FROM courses course
         JOIN learning_project_teacher_agents project_agent
           ON project_agent.project_id=course.project_id
          AND project_agent.company_id=course.company_id
        WHERE course.company_id=$1 AND course.id=$2
          AND participant.id=project_agent.agent_id
          AND participant.company_id=project_agent.company_id`,
      [input.companyId, input.courseId, `Pulse · ${input.title}`.slice(0, 80)],
    )
  }
  return rows[0]
}

export async function setTeacherCourseStatus(
  db: Queryable,
  companyId: string,
  courseId: string,
  status: 'active' | 'archived',
): Promise<DataRow | undefined> {
  const { rows } = await db.query<DataRow>(
    `UPDATE projects project
        SET status=$3,updated_at=NOW(),
            archived_at=CASE WHEN $3='archived' THEN NOW() ELSE NULL END
       FROM courses course
      WHERE course.company_id=$1 AND course.id=$2
        AND course.project_id=project.id AND course.company_id=project.company_id
      RETURNING project.*`,
    [companyId, courseId, status],
  )
  return rows[0]
}
