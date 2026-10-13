export interface ForumAttachment { key: string; name: string }
export type ForumTarget = 'post' | 'activity' | 'source' | 'homework'
export type ForumFilter = 'all' | 'assignment' | 'resource' | 'case'
export interface ForumItem {
  id: string
  targetType: ForumTarget
  kind: 'share' | 'resource' | 'case' | 'assignment'
  title: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  tags: string[]
  links: string[]
  attachments: ForumAttachment[]
  sourceId: string | null
  dueAt: string | null
  status: string | null
  pinned: boolean
  official: boolean
  featured: boolean
  commentCount: number
}
export interface ForumComment { id: string; authorId: string; authorName: string; body: string; links: string[]; attachments: ForumAttachment[]; createdAt: string }
export interface ForumPage<T> { items: T[]; nextOffset: number | null }
export interface SubmissionVersion {
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
