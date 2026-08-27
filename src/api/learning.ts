import { isMockImDevelopment } from '@/lib/devMode'
import { http } from '@/api/core/http'
import { normalizeCourseContract } from './courseContract'
import type {
  ApiProject,
  ApiCourse,
  ApiCourseMember,
  ApiCourseInvitation,
  ApiCourseInvitationWithToken,
  ApiCourseInvitationPreview,
  ApiCourseInvitationAccept,
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
import { MOCK_COMPANY_ID, MOCK_NOW, mockApiData } from './mock-data'

async function learningHttp<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockImDevelopment()) {
    const { mockLearningHttp } = await import('@/dev/mockLearning')
    return mockLearningHttp<T>(path, init)
  }
  return http<T>(path, init)
}

export const learningApi = {
  listProjects: () => isMockImDevelopment() ? Promise.resolve(mockApiData.projects) : http<ApiProject[]>('/projects'),
  openProject: (id: string) => http<{ ok: boolean }>(`/projects/${encodeURIComponent(id)}/open`, { method: 'POST' }),
  createProject: (input: { name: string; description?: string; color?: string }) => http<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  archiveProject: (id: string, archive = true) => http<{ ok: boolean; status: string }>(`/projects/${encodeURIComponent(id)}/archive`, { method: 'POST', body: JSON.stringify({ archive }) }),
  listCourses: async () => {
    if (isMockImDevelopment()) return mockApiData.courses.map(normalizeCourseContract)
    return (await http<ApiCourse[]>('/courses')).map(normalizeCourseContract)
  },
  getCourse: (courseId: string) => {
    if (isMockImDevelopment()) {
      const course = mockApiData.courses.find((row) => row.id === courseId)
      return course ? Promise.resolve(course) : Promise.reject(new Error('course not found'))
    }
    return http<ApiCourse>(`/courses/${encodeURIComponent(courseId)}`)
  },
  createCourse: (input: { name: string; description?: string; color?: string }) => {
    if (!isMockImDevelopment()) return http<ApiCourse>('/courses', { method: 'POST', body: JSON.stringify(input) })
    const suffix = String(Date.now())
    const course = normalizeCourseContract({
      id: `mock-course-${suffix}`, companyId: MOCK_COMPANY_ID, projectId: `mock-project-${suffix}`,
      name: input.name, description: input.description ?? '', color: input.color,
      createdBy: 'mock-me', companyRole: 'owner', courseRole: 'teacher',
      studyRoomId: 'mock-general', memberCount: 1, canManage: true,
    })
    mockApiData.courses = [course, ...mockApiData.courses]
    mockApiData.courseMembers[course.id] = [{ id: 'mock-me', name: '林曦', email: 'dev@localhost', role: 'teacher', joinedAt: MOCK_NOW }]
    mockApiData.courseInvitations[course.id] = []
    return Promise.resolve(course)
  },
  updateCourse: (courseId: string, input: { name?: string; description?: string; color?: string }) =>
    http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  archiveCourse: (courseId: string, archive = true) => {
    if (!isMockImDevelopment()) return http<{ ok: true; status: 'active' | 'archived' }>(`/courses/${encodeURIComponent(courseId)}/archive`, { method: 'POST', body: JSON.stringify({ archive }) })
    const status = archive ? 'archived' : 'active'
    mockApiData.courses = mockApiData.courses.map((course) => course.id === courseId ? { ...course, status } : course)
    return Promise.resolve({ ok: true as const, status })
  },
  listCourseMembers: (courseId: string) => isMockImDevelopment()
    ? Promise.resolve(mockApiData.courseMembers[courseId] ?? [])
    : http<ApiCourseMember[]>(`/courses/${encodeURIComponent(courseId)}/members`),
  updateCourseMember: (courseId: string, userId: string, role: 'teacher' | 'learner') => {
    if (!isMockImDevelopment()) return http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    const member = mockApiData.courseMembers[courseId]?.find((row) => row.id === userId)
    if (member) member.role = role
    return Promise.resolve({ ok: true as const })
  },
  removeCourseMember: (courseId: string, userId: string) => {
    if (!isMockImDevelopment()) return http<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
    mockApiData.courseMembers[courseId] = (mockApiData.courseMembers[courseId] ?? []).filter((row) => row.id !== userId)
    return Promise.resolve({ ok: true as const })
  },
  listCourseInvitations: (courseId: string) => isMockImDevelopment()
    ? Promise.resolve(mockApiData.courseInvitations[courseId] ?? [])
    : http<ApiCourseInvitation[]>(`/courses/${encodeURIComponent(courseId)}/invitations`),
  createCourseInvitation: (courseId: string, input: { email?: string | null; role: 'teacher' | 'learner'; note?: string | null; expiresInDays?: number; maxUses?: number }) => {
    if (!isMockImDevelopment()) return http<ApiCourseInvitationWithToken>(`/courses/${encodeURIComponent(courseId)}/invitations`, { method: 'POST', body: JSON.stringify(input) })
    const id = `mock-invite-${Date.now()}`
    const invitation: ApiCourseInvitationWithToken = {
      id, token: id, url: `${location.origin}/invite/course/${id}`, email: input.email ?? null,
      role: input.role, note: input.note ?? null, maxUses: input.maxUses ?? 1, useCount: 0,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + (input.expiresInDays ?? 7) * 86_400_000).toISOString(), status: 'active',
    }
    mockApiData.courseInvitations[courseId] = [invitation, ...(mockApiData.courseInvitations[courseId] ?? [])]
    return Promise.resolve(invitation)
  },
  revokeCourseInvitation: (courseId: string, invitationId: string) => {
    if (!isMockImDevelopment()) return http<{ ok: true; revoked: boolean }>(`/courses/${encodeURIComponent(courseId)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' })
    let revoked = false
    mockApiData.courseInvitations[courseId] = (mockApiData.courseInvitations[courseId] ?? []).map((invitation) => {
      if (invitation.id !== invitationId) return invitation
      revoked = true
      return { ...invitation, status: 'revoked' as const, revokedAt: new Date().toISOString() }
    })
    return Promise.resolve({ ok: true as const, revoked })
  },
  previewCourseInvitation: (token: string) => http<ApiCourseInvitationPreview>(`/course-invitations/${encodeURIComponent(token)}`),
  acceptCourseInvitation: (token: string) => http<ApiCourseInvitationAccept>(`/course-invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: '{}' }),
  getDashboard: () => learningHttp<LearningDashboard>('/learning/dashboard'),
  getTeacherAgent: (courseId: string) =>
    learningHttp<TeacherAgentSummary>(`/courses/${encodeURIComponent(courseId)}/teacher-agent`),
  bindCourseRoom: (courseId: string, conversationId: string, purpose: 'lab' | 'discussion') =>
    learningHttp<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/rooms/${encodeURIComponent(conversationId)}`, {
      method: 'PUT', body: JSON.stringify({ purpose }),
    }),
  listObjectives: (courseId: string) =>
    learningHttp<LearningObjective[]>(`/courses/${encodeURIComponent(courseId)}/objectives`),
  createObjectives: (courseId: string, objectives: Array<{
    title: string; successCriteria: string; targetLevel?: number; prerequisiteIds?: string[]
  }>) => learningHttp<LearningObjective[]>(`/courses/${encodeURIComponent(courseId)}/objectives`, {
    method: 'POST', body: JSON.stringify({ objectives }),
  }),
  setObjectiveStatus: (courseId: string, objectiveId: string, status: 'draft' | 'published' | 'archived') =>
    learningHttp<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/objectives/${encodeURIComponent(objectiveId)}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    }),
  listActivities: (courseId: string) =>
    learningHttp<LearningActivity[]>(`/courses/${encodeURIComponent(courseId)}/activities`),
  createActivity: (courseId: string, input: Omit<LearningActivity, 'id' | 'courseId' | 'status'>) =>
    learningHttp<LearningActivity>(`/courses/${encodeURIComponent(courseId)}/activities`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  publishActivity: (courseId: string, activityId: string) =>
    learningHttp<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/publish`, { method: 'POST' }),
  closeActivity: (courseId: string, activityId: string) =>
    learningHttp<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/close`, { method: 'POST' }),
  submitActivity: (courseId: string, activityId: string, answer: string, assistance: 'none' | 'hint' | 'guided' = 'none') =>
    learningHttp<{ attemptId: string }>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/submit`, {
      method: 'POST', body: JSON.stringify({ answer, assistance }),
    }),
  listMissions: (courseId: string) =>
    learningHttp<LearningMission[]>(`/courses/${encodeURIComponent(courseId)}/missions`),
  setMissionCoordinator: (courseId: string, missionId: string, agentId: string) =>
    learningHttp<LearningMission>(`/courses/${encodeURIComponent(courseId)}/missions/${encodeURIComponent(missionId)}/coordinator`, {
      method: 'PATCH', body: JSON.stringify({ agentId }),
    }),
  listEvidence: (courseId: string, learnerId?: string) =>
    learningHttp<LearningEvidence[]>(`/courses/${encodeURIComponent(courseId)}/evidence${learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''}`),
  listReviews: (courseId: string) =>
    learningHttp<LearningReview[]>(`/courses/${encodeURIComponent(courseId)}/reviews`),
  getCourseProgress: (courseId: string) =>
    learningHttp<LearningProgress[]>(`/courses/${encodeURIComponent(courseId)}/progress`),
  reviewEvaluation: (courseId: string, evaluationId: string, input: {
    decision: 'accept' | 'reject'; reason: string; overrideLevel?: number
  }) => learningHttp<{ ok: true }>(`/courses/${encodeURIComponent(courseId)}/reviews/${encodeURIComponent(evaluationId)}`, {
    method: 'POST', body: JSON.stringify(input),
  }),
  getNotificationPreferences: (courseId?: string) =>
    learningHttp<LearningNotificationPreferences>(`/learning/notification-preferences${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`),
  setNotificationPreferences: (input: {
    courseId?: string; inAppEnabled: boolean; emailEnabled: boolean; timezone: string;
    preferredTime: string; quietStart?: string; quietEnd?: string
  }) => learningHttp<LearningNotificationPreferences>('/learning/notification-preferences', {
    method: 'PUT', body: JSON.stringify(input),
  }),
  listDeliveries: () => learningHttp<LearningDelivery[]>('/learning/deliveries'),
}
