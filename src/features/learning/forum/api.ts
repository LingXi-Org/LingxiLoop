import { http } from '@/api/core/http'
import type { ConversationReference, EvidenceMessage, SubmissionStudent, ForumAttachment, ForumComment, ForumFilter, ForumItem, ForumPage, SubmissionVersion } from './contracts'

const base = (courseId: string) => `/courses/${encodeURIComponent(courseId)}`
const itemPath = (courseId: string, item: ForumItem) => `${base(courseId)}/forum/${item.targetType}/${encodeURIComponent(item.id)}`
export const forumApi = {
  list: (courseId: string, query: { kind: ForumFilter; search: string; tag: string; offset: number; archived?: string; from?: string; until?: string; property?: string; order?: string; timeBasis?: string }, signal?: AbortSignal) =>
    http<ForumPage<ForumItem>>(`${base(courseId)}/forum?${new URLSearchParams({ ...query,offset: String(query.offset) })}`, { signal }),
  detail: (courseId: string, id: string, type: ForumItem['targetType'] = 'post') => http<ForumItem>(`${base(courseId)}/forum/${type}/${encodeURIComponent(id)}`),
  create: (courseId: string, input: { kind: 'share' | 'assignment'; title: string; body: string; tags: string[]; links: string[]; attachments: ForumAttachment[]; sourceId?: string | null; dueAt?: string | null }) =>
    http<ForumItem>(`${base(courseId)}/forum`, { method: 'POST',body: JSON.stringify(input) }),
  flags: (courseId: string, item: ForumItem, flags: Partial<Pick<ForumItem, 'pinned' | 'archived'>>) =>
    http<ForumItem>(itemPath(courseId, item), { method: 'PATCH',body: JSON.stringify(flags) }),
  update: (courseId: string, item: ForumItem, input: { kind: 'share' | 'assignment'; title: string; body: string; tags: string[]; links: string[]; attachments: ForumAttachment[]; sourceId?: string | null; dueAt?: string | null }) =>
    http<ForumItem>(itemPath(courseId,item), { method: 'PUT', body: JSON.stringify({kind:input.kind,title:input.title,body:input.body,tags:input.tags,links:input.links,attachments:input.attachments,sourceId:input.sourceId,dueAt:input.dueAt}) }),
  remove: (courseId: string, item: ForumItem) => http(itemPath(courseId,item), { method: 'DELETE' }),
  close: (courseId: string, item: ForumItem) => http(`${itemPath(courseId,item)}/close`, { method: 'POST' }),
  feedback: (courseId: string, item: ForumItem, submissionId: string, body: string) => http(`${itemPath(courseId,item)}/submissions/${encodeURIComponent(submissionId)}/feedback`, { method: 'POST',body: JSON.stringify({ body }) }),
  comments: (courseId: string, item: ForumItem, offset = 0) =>
    http<ForumPage<ForumComment>>(`${itemPath(courseId, item)}/comments?offset=${offset}`),
  comment: (courseId: string, item: ForumItem, input: { body: string; links: string[]; attachments: ForumAttachment[] }) =>
    http<{ id: string }>(`${itemPath(courseId, item)}/comments`, { method: 'POST',body: JSON.stringify(input) }),
  editComment: (courseId: string, item: ForumItem, commentId: string, input: { body: string; links: string[]; attachments: ForumAttachment[] }) =>
    http(`${itemPath(courseId,item)}/comments/${encodeURIComponent(commentId)}`, {method:'PUT',body:JSON.stringify(input)}),
  deleteComment: (courseId: string, item: ForumItem, commentId: string) => http(`${itemPath(courseId,item)}/comments/${encodeURIComponent(commentId)}`, {method:'DELETE'}),
  react: (courseId: string, item: ForumItem, emoji: string, active: boolean) => http<ForumItem>(`${itemPath(courseId,item)}/reactions`, {method:'PUT',body:JSON.stringify({emoji,active})}),
  submissions: (courseId: string, assignmentId: string, offset = 0) =>
    http<ForumPage<SubmissionVersion>>(`${base(courseId)}/forum/post/${encodeURIComponent(assignmentId)}/submissions?offset=${offset}`),
  students:(courseId:string,id:string,offset=0,search='')=>http<ForumPage<SubmissionStudent>>(`${base(courseId)}/forum/post/${encodeURIComponent(id)}/students?${new URLSearchParams({offset:String(offset),search})}`),
  studentVersions:(courseId:string,id:string,learnerId:string,offset=0)=>http<ForumPage<SubmissionVersion>>(`${base(courseId)}/forum/post/${encodeURIComponent(id)}/students/${encodeURIComponent(learnerId)}/submissions?offset=${offset}`),
  conversations:(courseId:string,offset=0)=>http<ForumPage<{channelId:string;title:string}>>(`${base(courseId)}/submission-conversations?offset=${offset}`),
  conversation:(courseId:string,channelId:string,offset=0)=>http<{messages:EvidenceMessage[];nextBefore:number|null}>(`${base(courseId)}/submission-conversations/${encodeURIComponent(channelId)}?offset=${offset}`),
  submit: (courseId: string, assignmentId: string, input: { answer: string; links: string[]; attachments: ForumAttachment[]; idempotencyKey: string; conversationReferences:ConversationReference[] }) =>
    http<{ attemptId: string }>(`${base(courseId)}/forum/post/${encodeURIComponent(assignmentId)}/submit`, { method: 'POST',body: JSON.stringify(input) }),
}
