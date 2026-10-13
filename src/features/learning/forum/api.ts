import { http } from '@/api/core/http'
import type { ForumAttachment, ForumComment, ForumFilter, ForumItem, ForumPage, SubmissionVersion } from './contracts'

const base = (courseId: string) => `/courses/${encodeURIComponent(courseId)}`
const itemPath = (courseId: string, item: ForumItem) => `${base(courseId)}/forum/${item.targetType}/${encodeURIComponent(item.id)}`
export const forumApi = {
  list: (courseId: string, query: { kind: ForumFilter; search: string; tag: string; offset: number }, signal?: AbortSignal) =>
    http<ForumPage<ForumItem>>(`${base(courseId)}/forum?${new URLSearchParams({ ...query,offset: String(query.offset) })}`, { signal }),
  create: (courseId: string, input: { kind: 'share' | 'resource' | 'case'; title: string; body: string; tags: string[]; links: string[]; attachments: ForumAttachment[]; sourceId?: string }) =>
    http<ForumItem>(`${base(courseId)}/forum`, { method: 'POST',body: JSON.stringify(input) }),
  flags: (courseId: string, item: ForumItem, flags: Partial<Pick<ForumItem, 'pinned' | 'official' | 'featured'>>) =>
    http<ForumItem>(itemPath(courseId, item), { method: 'PATCH',body: JSON.stringify(flags) }),
  comments: (courseId: string, item: ForumItem, offset = 0) =>
    http<ForumPage<ForumComment>>(`${itemPath(courseId, item)}/comments?offset=${offset}`),
  comment: (courseId: string, item: ForumItem, body: string) =>
    http<{ id: string }>(`${itemPath(courseId, item)}/comments`, { method: 'POST',body: JSON.stringify({ body }) }),
  submissions: (courseId: string, activityId: string, offset = 0) =>
    http<ForumPage<SubmissionVersion>>(`${base(courseId)}/activities/${encodeURIComponent(activityId)}/submissions?offset=${offset}`),
  submit: (courseId: string, activityId: string, input: { answer: string; links: string[]; attachments: ForumAttachment[]; idempotencyKey: string }) =>
    http<{ attemptId: string }>(`${base(courseId)}/activities/${encodeURIComponent(activityId)}/submit`, { method: 'POST',body: JSON.stringify(input) }),
}
