import type { Queryable } from '../../db/queryable.js'
import type { ProjectStatus } from '../../domain/public.js'
import { enqueueLearningEffect } from './effects-repository.js'

export async function projectLifecycleProjection(
  db: Queryable,
  input: { companyId: string; projectId: string; status: ProjectStatus },
): Promise<void> {
  if (input.status !== 'READ_ONLY' && input.status !== 'ARCHIVED') return
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM courses WHERE company_id=$1 AND project_id=$2`,
    [input.companyId, input.projectId],
  )
  const courseId = rows[0]?.id
  if (!courseId) return
  await db.query(
    `UPDATE learning_course_teacher_rooms
        SET status='closed',closed_at=COALESCE(closed_at,NOW())
      WHERE company_id=$1 AND course_id=$2 AND status<>'closed'`,
    [input.companyId, courseId],
  )
  await enqueueLearningEffect(db, {
    companyId: input.companyId,
    courseId,
    kind: 'course_archive.sync',
    payload: { projectId: input.projectId, archive: true, projectStatus: input.status },
  })
}
