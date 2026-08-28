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
