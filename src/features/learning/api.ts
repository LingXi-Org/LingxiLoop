import { http } from '@/api/core/http'
import type {
  ApiCourse,
  ApiProjectInvitation,
  ApiProjectInvitationAccept,
  ApiProjectInvitationPreview,
  ApiProjectInvitationWithToken,
  ApiCourseMember,
  LearningActivity,
  LearningAttemptDetail,
  LearningDashboard,
  LearningDelivery,
  LearningEvidence,
  LearningMission,
  LearningNotificationPreferences,
  LearningObjective,
  LearningOverview,
  LearningProgress,
  LearningReview,
  LearningSpace,
  CursorPage,
  TeacherLearnerDetail,
  TeacherLearnerSummary,
  TeacherAgentSummary,
} from './contracts'
import { normalizeCourseContract } from './courseContract'

export const learningApi = {
  listCourses: async () => (await http<ApiCourse[]>('/courses')).map(normalizeCourseContract),
  getCourse: (courseId: string) => http<ApiCourse>(`/courses/${encodeURIComponent(courseId)}`),
  createCourse: (input: { name: string; description?: string; color?: string }, companyId?: string) =>
    http<ApiCourse>('/courses', {
      method: 'POST',
      headers: companyId ? { 'x-company-id': companyId } : undefined,
      body: JSON.stringify(input),
    }),
  updateCourse: (courseId: string, input: { name?: string; description?: string; color?: string }) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  listCourseMembers: (courseId: string) =>
    http<ApiCourseMember[]>(`/courses/${encodeURIComponent(courseId)}/members`),
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
  getDashboard: () => http<LearningDashboard>('/learning/dashboard'),
  listSpaces: (input: { cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (input.cursor) params.set('cursor', input.cursor)
    if (input.limit) params.set('limit', String(input.limit))
    const query = params.size > 0 ? `?${params.toString()}` : ''
    return http<CursorPage<LearningSpace>>(`/learning/spaces${query}`)
  },
  getOverview: (projectId: string, windowDays = 30) =>
    http<LearningOverview>(`/projects/${encodeURIComponent(projectId)}/learning/overview?windowDays=${windowDays}`),
  listLearners: (projectId: string, input: {
    cursor?: string
    limit?: number
    attentionOnly?: boolean
    search?: string
  } = {}) => {
    const params = new URLSearchParams()
    if (input.cursor) params.set('cursor', input.cursor)
    if (input.limit) params.set('limit', String(input.limit))
    if (input.attentionOnly) params.set('attentionOnly', 'true')
    if (input.search) params.set('search', input.search)
    const query = params.size > 0 ? `?${params.toString()}` : ''
    return http<CursorPage<TeacherLearnerSummary>>(
      `/projects/${encodeURIComponent(projectId)}/learning/learners${query}`,
    )
  },
  getLearner: (projectId: string, learnerId: string) =>
    http<TeacherLearnerDetail>(
      `/projects/${encodeURIComponent(projectId)}/learning/learners/${encodeURIComponent(learnerId)}`,
    ),
  getAttempt: (projectId: string, attemptId: string) =>
    http<LearningAttemptDetail>(
      `/projects/${encodeURIComponent(projectId)}/learning/attempts/${encodeURIComponent(attemptId)}`,
    ),
  getTeacherAgent: (courseId: string) =>
    http<TeacherAgentSummary>(`/courses/${encodeURIComponent(courseId)}/teacher-agent`),
  bindCourseRoom: (courseId: string, conversationId: string, purpose: 'lab' | 'discussion') =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/rooms/${encodeURIComponent(conversationId)}`, {
      method: 'PUT', body: JSON.stringify({ purpose }),
    }),
  listKnowledgeUnits: (projectId: string) =>
    http<LearningObjective[]>(`/projects/${encodeURIComponent(projectId)}/learning/knowledge-units`),
  createObjectives: (courseId: string, objectives: Array<{
    title: string; successCriteria: string; targetLevel?: number; prerequisiteIds?: string[]
  }>) => http<LearningObjective[]>(`/courses/${encodeURIComponent(courseId)}/objectives`, {
    method: 'POST', body: JSON.stringify({ objectives }),
  }),
  setObjectiveStatus: (courseId: string, objectiveId: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/objectives/${encodeURIComponent(objectiveId)}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    }),
  listActivities: (projectId: string) =>
    http<LearningActivity[]>(`/projects/${encodeURIComponent(projectId)}/learning/activities`),
  createActivity: (courseId: string, input: {
    title: string; instructions: string; type: LearningActivity['kind']; evaluationMode: LearningActivity['evaluationMode'];
    targetLevel: number; rubric: unknown[]; objectiveIds: string[]; dueAt?: string
  }) =>
    http<LearningActivity>(`/courses/${encodeURIComponent(courseId)}/activities`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  publishActivity: (courseId: string, activityId: string) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/publish`, { method: 'POST' }),
  closeActivity: (courseId: string, activityId: string) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/close`, { method: 'POST' }),
  submitActivity: (() => {
    const keys = new Map<string, string>()
    return async (projectId: string, activityId: string, answer: string, assistance: 'NONE' | 'HINT' | 'GUIDED' = 'NONE') => {
      const fingerprint = JSON.stringify([projectId, activityId, answer, assistance])
      const idempotencyKey = keys.get(fingerprint) ?? crypto.randomUUID()
      keys.set(fingerprint, idempotencyKey)
      const result = await http<{ attemptId: string }>(`/projects/${encodeURIComponent(projectId)}/learning/activities/${encodeURIComponent(activityId)}/submit`, {
        method: 'POST', body: JSON.stringify({ answer, assistance, idempotencyKey }),
      })
      keys.delete(fingerprint)
      return result
    }
  })(),
  listMissions: (projectId: string) =>
    http<LearningMission[]>(`/projects/${encodeURIComponent(projectId)}/learning/missions`),
  setMissionCoordinator: (courseId: string, missionId: string, agentId: string) =>
    http<LearningMission>(`/courses/${encodeURIComponent(courseId)}/missions/${encodeURIComponent(missionId)}/coordinator`, {
      method: 'PATCH', body: JSON.stringify({ agentId }),
    }),
  listEvidence: (projectId: string, learnerId?: string) =>
    http<LearningEvidence[]>(`/projects/${encodeURIComponent(projectId)}/learning/evidence${learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''}`),
  listReviews: (projectId: string) =>
    http<LearningReview[]>(`/projects/${encodeURIComponent(projectId)}/learning/reviews`),
  getProjectProgress: (projectId: string) =>
    http<LearningProgress[]>(`/projects/${encodeURIComponent(projectId)}/learning/progress`),
  reviewEvaluation: (projectId: string, evaluationId: string, input: {
    decision: 'accept' | 'reject'; reason: string
  }) => http<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/learning/reviews/${encodeURIComponent(evaluationId)}`, {
    method: 'POST', body: JSON.stringify(input),
  }),
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
