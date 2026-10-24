import type { ContentDocument } from '@/features/content-editor'
import { http } from '@/api/core/http'
import type { ContextThreadResult } from '@/features/context-threads/api'
import type { ConversationReference, ForumPage, ForumAttachment } from '../forum/contracts'
import type { HomeworkAnswer, HomeworkDetail, HomeworkFields, HomeworkLearner, HomeworkStudent, HomeworkSubmission } from './contracts'

const base = (courseId: string, homeworkId: string) => `/courses/${encodeURIComponent(courseId)}/homeworks/${encodeURIComponent(homeworkId)}`
export const homeworkApi = {
  teacherRoom: (courseId: string, signal?: AbortSignal) => http<{ roomId: string; agentId: string; roomStatus: 'active' }>(`/courses/${encodeURIComponent(courseId)}/teacher-agent`, { method: 'POST', signal }),
  createDraft: (courseId: string, id: string, input: HomeworkFields) =>
    http<HomeworkDetail>(`${base(courseId, id)}/draft`, { method: 'PUT', body: JSON.stringify(input) }),
  detail: (courseId: string, id: string) => http<HomeworkDetail>(base(courseId, id)),
  saveDraft: (courseId: string, id: string, input: HomeworkFields & { expectedRevision: number }) =>
    http<HomeworkDetail>(`${base(courseId, id)}/draft`, { method: 'PATCH', body: JSON.stringify(input) }),
  publish: (courseId: string, id: string, input: { expectedRevision: number; visibleHash: string; idempotencyKey: string }) =>
    http<HomeworkDetail>(`${base(courseId, id)}/publish`, { method: 'POST', body: JSON.stringify(input) }),
  close: (courseId: string, id: string, expectedRevision: number) =>
    http<HomeworkDetail>(`${base(courseId, id)}/close`, { method: 'POST', body: JSON.stringify({ expectedRevision }) }),
  deadline: (courseId: string, id: string, input: { expectedRevision: number; dueAt: string }) =>
    http<HomeworkDetail>(`${base(courseId, id)}/deadline`, { method: 'PATCH', body: JSON.stringify(input) }),
  thread: (courseId: string, id: string) =>
    http<ContextThreadResult & { agentId: string }>(`${base(courseId, id)}/thread`, { method: 'POST', body: '{}' }),
  saveAnswer: (courseId: string, id: string, input: HomeworkAnswer & { expectedRevision: number }) =>
    http<HomeworkStudent>(`${base(courseId, id)}/answer`, { method: 'PATCH', body: JSON.stringify(input) }),
  report: (courseId: string, id: string, expectedAnswerRevision: number) =>
    http<HomeworkStudent>(`${base(courseId, id)}/report`, { method: 'POST', body: JSON.stringify({ expectedAnswerRevision }) }),
  submit: (courseId: string, id: string, input: { expectedAnswerRevision: number; reportId: string; idempotencyKey: string; conversationReferences:ConversationReference[] }) =>
    http<HomeworkSubmission>(`${base(courseId, id)}/submit`, { method: 'POST', body: JSON.stringify(input) }),
  learners: (courseId: string, id: string, offset = 0, search = '') => http<ForumPage<HomeworkLearner>>(`${base(courseId, id)}/learners?${new URLSearchParams({offset:String(offset),search})}`),
  submissions: (courseId: string, id: string, offset = 0, learnerId = '') => http<ForumPage<HomeworkSubmission>>(`${base(courseId, id)}/submissions?${new URLSearchParams({offset:String(offset),learnerId})}`),
  review: (courseId: string, id: string, input: { learnerId: string; expectedSubmissionId: string; decision: 'PASSED' | 'RETURNED'; reason: string; editorDocument?: ContentDocument | null; attachments?: ForumAttachment[]; links?: string[] }) =>
    http<{ ok: true }>(`${base(courseId, id)}/review`, { method: 'POST', body: JSON.stringify(input) }),
}
