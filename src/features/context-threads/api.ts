import { http } from '@/api/core/http'

export interface ContextThreadResult {
  id: string
  channelId: string
  contextType: 'LEARNING' | 'TEACHER_TAKEOVER' | 'INTERVENTION'
  contextId: string
  participantIds: string[]
  created: boolean
}

export const contextThreadsApi = {
  openLearning: (projectId: string, agentId: string) => http<ContextThreadResult>(
    `/projects/${encodeURIComponent(projectId)}/context-threads/learning`,
    { method: 'POST', body: JSON.stringify({ agentId }) },
  ),
  openTeacher: (
    projectId: string,
    input: { contextType: 'TEACHER_TAKEOVER'; studentId: string }
      | { contextType: 'INTERVENTION'; studentId: string; caseId: string },
  ) => http<ContextThreadResult>(
    `/projects/${encodeURIComponent(projectId)}/context-threads/teacher`,
    { method: 'POST', body: JSON.stringify(input) },
  ),
}
