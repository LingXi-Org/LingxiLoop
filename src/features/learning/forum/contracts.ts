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
  authorName: string; authorAvatarUrl?: string | null
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
export interface ForumComment { id: string; authorId: string; authorName: string; authorAvatarUrl?: string | null; body: string; links: string[]; attachments: ForumAttachment[]; createdAt: string }
export interface ForumPage<T> { items: T[]; nextOffset: number | null }
export interface SubmissionVersion {
  conversationReferences:ConversationEvidence[]
  assessment:SubmissionAssessment|null
  feedback: Array<{id: string; body: string; authorId: string; createdAt: string; kind: string; status: string}>
  id: string
  learnerId: string
  learnerName: string; learnerAvatarUrl?: string | null
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

export interface ConversationReference { channelId: string; messageIds: string[] }
export interface EvidenceMessage { id: string; role: 'user' | 'assistant'; text: string; sequence: number }
export interface ConversationEvidence extends ConversationReference { title: string; capturedAt: string; messages: EvidenceMessage[] }
export interface SubmissionAssessment {
  status: 'PENDING' | 'FAILED' | 'READY'; mastery?: 'MASTERED' | 'DEVELOPING' | 'INSUFFICIENT'; reason?: string
  evidence?: {reference:number;messageId:string;excerpt:string}[]
}
export interface SubmissionStudent {
  id:string;learnerId:string;learnerName:string;learnerAvatarUrl?:string|null;submittedAt:string;version:number;assessment:SubmissionAssessment|null
  conversationReferences:{title:string;index:number}[]
}
