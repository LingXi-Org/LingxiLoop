import type { Queryable } from '../../db/queryable.js'

import { createPermissionService } from '../access/public.js'




export async function requireLearningCourseRole(
  db: Queryable,
  input: { courseId: string; userId: string; role: 'teacher'|'learner'; companyId?: string },
): Promise<void> {
  await createPermissionService(db).assertCan({
    actorUserId: input.userId,
    action: input.role === 'teacher' ? 'learning:manage' : 'learning:submit',
    ...(input.companyId ? { companyId: input.companyId } : {}),
    resource: { type: 'course', id: input.courseId },
  })
}