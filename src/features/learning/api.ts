import { http } from '@/api/core/http'
import type {
  ApiCourse,
  ApiCourseInvitation,
  ApiCourseInvitationAccept,
  ApiCourseInvitationPreview,
  ApiCourseInvitationWithToken,
  ApiCourseMember,
  LearningActivity,
  LearningDashboard,
  LearningDelivery,
  LearningEvidence,
  LearningMission,
  LearningNotificationPreferences,
  LearningObjective,
  LearningProgress,
  LearningReview,
  TeacherAgentSummary,
} from './contracts'
import { normalizeCourseContract } from './courseContract'

export const learningApi = {
  listCourses: async () => (await http<ApiCourse[]>('/courses')).map(normalizeCourseContract),
  getCourse: (courseId: string) => http<ApiCourse>(`/courses/${encodeURIComponent(courseId)}`),
  createCourse: (input: { name: string; description?: string; color?: string }) =>
    http<ApiCourse>('/courses', { method: 'POST', body: JSON.stringify(input) }),
  updateCourse: (courseId: string, input: { name?: string; description?: string; color?: string }) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  listCourseMembers: (courseId: string) =>
    http<ApiCourseMember[]>(`/courses/${encodeURIComponent(courseId)}/members`),
  updateCourseMember: (courseId: string, userId: string, role: 'teacher' | 'learner') =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeCourseMember: (courseId: string, userId: string) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  listCourseInvitations: (courseId: string) =>
    http<ApiCourseInvitation[]>(`/courses/${encodeURIComponent(courseId)}/invitations`),
  createCourseInvitation: (courseId: string, input: { email?: string | null; role: 'teacher' | 'learner'; note?: string | null; expiresInDays?: number; maxUses?: number }) =>
    http<ApiCourseInvitationWithToken>(`/courses/${encodeURIComponent(courseId)}/invitations`, { method: 'POST', body: JSON.stringify(input) }),
  revokeCourseInvitation: (courseId: string, invitationId: string) =>
    http<{ ok: true; revoked: boolean }>(`/courses/${encodeURIComponent(courseId)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' }),
  previewCourseInvitation: (token: string) => http<ApiCourseInvitationPreview>(`/course-invitations/${encodeURIComponent(token)}`),
  acceptCourseInvitation: (token: string) => http<ApiCourseInvitationAccept>(`/course-invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: '{}' }),
  getDashboard: () => http<LearningDashboard>('/learning/dashboard'),
  getTeacherAgent: (courseId: string) =>
    http<TeacherAgentSummary>(`/courses/${encodeURIComponent(courseId)}/teacher-agent`),
  bindCourseRoom: (courseId: string, conversationId: string, purpose: 'lab' | 'discussion') =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/rooms/${encodeURIComponent(conversationId)}`, {
      method: 'PUT', body: JSON.stringify({ purpose }),
    }),
  listObjectives: (courseId: string) =>
    http<LearningObjective[]>(`/courses/${encodeURIComponent(courseId)}/objectives`),
  createObjectives: (courseId: string, objectives: Array<{
    title: string; successCriteria: string; targetLevel?: number; prerequisiteIds?: string[]
  }>) => http<LearningObjective[]>(`/courses/${encodeURIComponent(courseId)}/objectives`, {
    method: 'POST', body: JSON.stringify({ objectives }),
  }),
  setObjectiveStatus: (courseId: string, objectiveId: string, status: 'draft' | 'published' | 'archived') =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/objectives/${encodeURIComponent(objectiveId)}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    }),
  listActivities: (courseId: string) =>
    http<LearningActivity[]>(`/courses/${encodeURIComponent(courseId)}/activities`),
  createActivity: (courseId: string, input: Omit<LearningActivity, 'id' | 'courseId' | 'status'>) =>
    http<LearningActivity>(`/courses/${encodeURIComponent(courseId)}/activities`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  publishActivity: (courseId: string, activityId: string) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/publish`, { method: 'POST' }),
  closeActivity: (courseId: string, activityId: string) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/close`, { method: 'POST' }),
  submitActivity: (() => {
    const keys = new Map<string, string>()
    return async (courseId: string, activityId: string, answer: string, assistance: 'none' | 'hint' | 'guided' = 'none') => {
      const fingerprint = JSON.stringify([courseId, activityId, answer, assistance])
      const idempotencyKey = keys.get(fingerprint) ?? crypto.randomUUID()
      keys.set(fingerprint, idempotencyKey)
      const result = await http<{ attemptId: string }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/submit`, {
        method: 'POST', body: JSON.stringify({ answer, assistance, idempotencyKey }),
      })
      keys.delete(fingerprint)
      return result
    }
  })(),
  listMissions: (courseId: string) =>
    http<LearningMission[]>(`/courses/${encodeURIComponent(courseId)}/missions`),
  setMissionCoordinator: (courseId: string, missionId: string, agentId: string) =>
    http<LearningMission>(`/courses/${encodeURIComponent(courseId)}/missions/${encodeURIComponent(missionId)}/coordinator`, {
      method: 'PATCH', body: JSON.stringify({ agentId }),
    }),
  listEvidence: (courseId: string, learnerId?: string) =>
    http<LearningEvidence[]>(`/courses/${encodeURIComponent(courseId)}/evidence${learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''}`),
  listReviews: (courseId: string) =>
    http<LearningReview[]>(`/courses/${encodeURIComponent(courseId)}/reviews`),
  getCourseProgress: (courseId: string) =>
    http<LearningProgress[]>(`/courses/${encodeURIComponent(courseId)}/progress`),
  reviewEvaluation: (courseId: string, evaluationId: string, input: {
    decision: 'accept' | 'reject'; reason: string; overrideLevel?: number
  }) => http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/reviews/${encodeURIComponent(evaluationId)}`, {
    method: 'POST', body: JSON.stringify(input),
  }),
  getNotificationPreferences: (courseId?: string) =>
    http<LearningNotificationPreferences>(`/learning/notification-preferences${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`),
  setNotificationPreferences: (input: {
    courseId?: string; inAppEnabled: boolean; emailEnabled: boolean; timezone: string;
    preferredTime: string; quietStart?: string; quietEnd?: string
  }) => http<LearningNotificationPreferences>('/learning/notification-preferences', {
    method: 'PUT', body: JSON.stringify(input),
  }),
  listDeliveries: () => http<LearningDelivery[]>('/learning/deliveries'),
}
