import type { Queryable } from '../../db/queryable.js'
import { LearningApplicationError } from './errors.js'
import {
  courseManager,
  courseRole,
  deleteLearningCourseRoom,
  owningCourseRole,
  setLearningCourseMembershipRecord,
  upsertLearningCourseRoom,
} from './repository.js'

const privilegedRoles = new Set(['owner', 'admin'])

export type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

export async function requireLearningCourseRole(
  db: Queryable,
  input: { courseId: string; userId: string; role: 'teacher'|'learner'; companyId?: string },
): Promise<void> {
  const membership = input.companyId
    ? await courseRole(db, input.courseId, input.companyId, input.userId).then((role) => (
      role ? { company_id: input.companyId as string, role } : null
    ))
    : await owningCourseRole(db, input.courseId, input.userId)
  if (!membership || membership.role !== input.role) {
    throw new LearningApplicationError('forbidden', `course ${input.role} role required`)
  }
}

async function requireLearningCourseManager(
  db: Queryable,
  input: { companyId: string; courseId: string; userId: string },
) {
  const manager = await courseManager(db, input.courseId, input.userId)
  if (!manager || manager.companyId !== input.companyId) {
    throw new LearningApplicationError('not_found', 'course not found')
  }
  if (!privilegedRoles.has(manager.companyRole) && manager.courseRole !== 'teacher') {
    throw new LearningApplicationError('forbidden', 'course manager role required')
  }
  return manager
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

