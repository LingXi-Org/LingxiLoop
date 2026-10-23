import type { ApiCourse, ApiCourseMember, ApiProjectInvitation, ApiProjectInvitationWithToken } from './contracts'
import { http } from '@/api/core/http'
import type { ApiProjectInvitationPreview, ApiProjectInvitationAccept, LearningSpace, CursorPage, LearningNotificationPreferences, LearningDelivery } from './contracts'
export const learningApi = {
  getCourse: (courseId: string) => http<ApiCourse>(`/courses/${encodeURIComponent(courseId)}`),
  updateCourse: (courseId: string, input: { name?: string; description?: string; color?: string; avatar?: { seed: string } | { key: string } }) =>
    http<{ ok: true; avatarUrl?: string; avatarSeed?: string | null }>(`/courses/${encodeURIComponent(courseId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  listCourseMembers: (courseId: string) =>
    http<ApiCourseMember[]>(`/courses/${encodeURIComponent(courseId)}/members`),
  addCourseTeacher: (courseId: string, userId: string, idempotencyKey: string) =>
    http<{ ok: true; userId: string; role: 'TEACHER' }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ role: 'TEACHER', idempotencyKey }) }),
  updateCourseMember: (courseId: string, userId: string, role: 'teacher' | 'learner') =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeCourseMember: (courseId: string, userId: string) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  listProjectInvitations: (projectId: string) =>
    http<ApiProjectInvitation[]>(`/projects/${encodeURIComponent(projectId)}/invitations`),
  createProjectInvitation: (projectId: string, input: { email?: string | null; note?: string | null; expiresInDays?: number; maxUses?: number }) =>
    http<ApiProjectInvitationWithToken>(`/projects/${encodeURIComponent(projectId)}/invitations`, { method: 'POST', body: JSON.stringify(input) }),
  revokeProjectInvitation: (projectId: string, invitationId: string) =>
    http<{ ok: true; revoked: boolean }>(`/projects/${encodeURIComponent(projectId)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' }),

  previewProjectInvitation: (token: string) => http<ApiProjectInvitationPreview>(`/project-invitations/${encodeURIComponent(token)}`),
  acceptProjectInvitation: (token: string) => http<ApiProjectInvitationAccept>(`/project-invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: '{}' }),
  listSpaces: (input: { cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (input.cursor) params.set('cursor', input.cursor)
    if (input.limit) params.set('limit', String(input.limit))
    const query = params.size > 0 ? `?${params.toString()}` : ''
    return http<CursorPage<LearningSpace>>(`/learning/spaces${query}`)
  },
  getNotificationPreferences: (projectId?: string) =>
    http<LearningNotificationPreferences>(`/notification-preferences${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  setNotificationPreferences: (input: {
    projectId?: string; inAppEnabled: boolean; emailEnabled: boolean; timezone: string;
    dailyTime: string; weeklyDay: number; quietStart: string | null; quietEnd: string | null
  }) => http<LearningNotificationPreferences>('/notification-preferences', {
    method: 'PUT', body: JSON.stringify(input),
  }),
  listDeliveries: () => http<LearningDelivery[]>('/notification-deliveries'),
}
