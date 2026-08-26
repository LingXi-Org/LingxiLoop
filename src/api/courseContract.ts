import type { ApiCourse } from './client'

/** Single production/mock boundary for the course contract. Keeping coercion
 * here prevents development fixtures from silently drifting from API JSON. */
export function normalizeCourseContract(value: Partial<ApiCourse> & Pick<ApiCourse, 'id' | 'companyId' | 'projectId' | 'name'>): ApiCourse {
  return {
    id: value.id, companyId: value.companyId, projectId: value.projectId, name: value.name,
    description: value.description ?? '', color: value.color ?? '#5266d6',
    status: value.status === 'archived' ? 'archived' : 'active', createdBy: value.createdBy ?? 'mock-user',
    studyRoomId: value.studyRoomId ?? null, companyRole: value.companyRole,
    courseRole: value.courseRole ?? null, memberCount: Number(value.memberCount ?? 0),
    canManage: Boolean(value.canManage), createdAt: value.createdAt, updatedAt: value.updatedAt,
  }
}
