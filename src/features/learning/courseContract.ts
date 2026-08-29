import type { ApiCourse } from './contracts'

const requiredStrings = ['id', 'companyId', 'projectId', 'projectKind', 'name', 'description', 'color', 'createdBy'] as const

/** Reject contract drift at the HTTP boundary; production data is never padded. */
export function normalizeCourseContract(value: unknown): ApiCourse {
  if (!value || typeof value !== 'object') throw new Error('invalid course response')
  const course = value as Record<string, unknown>
  for (const key of requiredStrings) {
    if (typeof course[key] !== 'string') throw new Error(`invalid course response: ${key} is required`)
  }
  if (!['PERSONAL_LEARNING', 'TEACHING', 'INSTITUTIONAL_COURSE'].includes(String(course.projectKind))) {
    throw new Error('invalid course response: projectKind')
  }
  if (course.status !== 'active' && course.status !== 'archived') throw new Error('invalid course response: status')
  if (course.courseRole !== null && course.courseRole !== 'teacher' && course.courseRole !== 'learner') throw new Error('invalid course response: courseRole')
  if (course.studyRoomId !== null && typeof course.studyRoomId !== 'string') throw new Error('invalid course response: studyRoomId')
  if (typeof course.memberCount !== 'number' || !Number.isFinite(course.memberCount)) throw new Error('invalid course response: memberCount')
  if (typeof course.canManage !== 'boolean') throw new Error('invalid course response: canManage')
  return course as unknown as ApiCourse
}
