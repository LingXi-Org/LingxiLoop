import { http } from '@/api/core/http'
import type { ApiProjectInvitationPreview, ApiProjectInvitationAccept, LearningSpace, CursorPage, LearningNotificationPreferences, LearningDelivery } from './contracts'
export const learningApi = {
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
