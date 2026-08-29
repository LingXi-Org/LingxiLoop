import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { LearningApplicationError } from './errors.js'
import {
  deleteLearningCourseRoom,
  setLearningCourseMembershipRecord,
  upsertLearningCourseRoom,
} from './repository.js'

export type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

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

async function requireLearningCourseManager(
  db: Queryable,
  input: { companyId: string; courseId: string; userId: string },
) {
  return createPermissionService(db).assertCan({
    actorUserId: input.userId,
    action: 'learning:manage',
    companyId: input.companyId,
    resource: { type: 'course', id: input.courseId },
  })
}

export async function setLearningCourseMembership(
  db: Queryable,
  transaction: LearningTransaction,
  input: {
    companyId: string; courseId: string; managerId: string; userId: string
    role: 'teacher'|'learner'; enabled: boolean
  },
): Promise<void> {
  await requireLearningCourseManager(db, {
    companyId: input.companyId, courseId: input.courseId, userId: input.managerId,
  })
  const outcome = await transaction((client) => setLearningCourseMembershipRecord(client, input))
  if (outcome === 'not_found') {
    throw new LearningApplicationError('not_found', 'course or company member not found')
  }
  if (outcome === 'last_teacher') {
    throw new LearningApplicationError('conflict', 'cannot remove the final course teacher')
  }
}

export async function bindLearningCourseRoom(
  db: Queryable,
  input: {
    companyId: string; courseId: string; managerId: string; conversationId: string
    purpose?: 'lab'|'discussion'; enabled: boolean
  },
): Promise<void> {
  await requireLearningCourseManager(db, {
    companyId: input.companyId, courseId: input.courseId, userId: input.managerId,
  })
  if (!input.enabled) {
    await deleteLearningCourseRoom(db, input)
    return
  }
  if (!input.purpose) throw new LearningApplicationError('invalid', 'room purpose is required')
  if (!await upsertLearningCourseRoom(db, {
    ...input, purpose: input.purpose, createdBy: input.managerId,
  })) throw new LearningApplicationError('not_found', 'room must be a group in the course project')
}
