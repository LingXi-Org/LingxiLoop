export interface ForumAttachment { key: string; name: string }
export type ForumTarget = 'post' | 'homework'
export type ForumFilter = 'all' | 'assignment' | 'share'
export interface ForumItem {
  id: string
  targetType: ForumTarget
  kind: 'share' | 'assignment'
  title: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
  tags: string[]
  links: string[]
  attachments: ForumAttachment[]
  sourceId: string | null
  dueAt: string | null
  status: string | null
  pinned: boolean
  archived: boolean
  commentCount: number
  reactions: { emoji: string; userIds: string[] }[]
}
export interface ForumComment { id: string; authorId: string; authorName: string; body: string; links: string[]; attachments: ForumAttachment[]; createdAt: string }
export interface ForumPage<T> { items: T[]; nextOffset: number | null }
export interface SubmissionVersion {
  feedback: Array<{id: string; body: string; authorId: string; createdAt: string; kind: string; status: string}>
  id: string
  learnerId: string
  learnerName: string
  submittedAt: string
  version: number
  source: 'STUDENT_ORIGINAL' | 'AGENT_RELAY' | 'AGENT_GENERATED'
  agentId: string | null
  agentWorkId: string | null
  late: boolean
  answer: string
  links: string[]
  attachments: ForumAttachment[]
}
