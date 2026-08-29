import type { Status } from '@/types'

export interface ApiConversation {
  id: string
  kind: 'group' | 'direct' | 'email'
  title: string
  subtitle: string | null
  topic: string | null
  members: string[]
  leaderId: string | null
  pinned: boolean
  muted: boolean
  mutedUntil: string | null
  tag: string | null
  pulledBy: { agentId: string; at: string; reason: string } | null
  createdAt: string
  updatedAt: string
  unreadCount: number
  lastMessage: {
    id: string
    authorId: string
    kind: string
    body: string
    tool?: unknown
    attachment?: { name?: string; kind?: 'img' | 'pdf' | 'file' | 'fig' } | null
    createdAt: string
    email?: { subject: string; direction: 'in' | 'out'; from: string } | null
  } | null
}

export interface ConversationSearchResults {
  participants: Array<{
    id: string
    kind: 'agent' | 'human'
    name: string
    role: string | null
    initial: string
    avatarBg: string
    avatarUrl: string | null
    status: Status
    bio: string | null
  }>
  rooms: Array<{
    id: string
    kind: 'direct'
    title: string
    members: string[]
    projectName: string | null
  }>
  groups: Array<{
    id: string
    kind: 'group'
    title: string
    members: string[]
    projectName: string | null
  }>
  messages: Array<{
    id: string
    conversationId: string
    conversationTitle: string
    conversationKind: 'group' | 'direct'
    authorId: string
    authorName: string | null
    snippet: string
    createdAt: string
  }>
}
