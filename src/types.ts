export type AgentRole = 'researcher' | 'designer' | 'engineer' | 'pm' | 'brand' | 'ops'
export type ParticipantKind = 'agent' | 'human'
export type Status = 'avail' | 'working' | 'thinking' | 'waiting' | 'resting'
export type AgentCapability = 'canvas' | 'web' | 'files' | 'email' | 'documents' | 'calendar' | 'knowledge' | 'learning' | 'teacher_admin'

export type ProjectKind = 'PERSONAL_LEARNING' | 'TEACHING' | 'INSTITUTIONAL_COURSE'
export type ProjectStatus =
  | 'CREATED'
  | 'DRAFT'
  | 'ACTIVE'
  | 'COURSE_ENDED'
  | 'READ_ONLY'
  | 'TRANSFER_PENDING'
  | 'RETENTION'
  | 'ARCHIVED'
  | 'DELETED'

export interface WorkspaceSummary {
  id: string
  companyId: string
  kind: ProjectKind
  planId: string | null
  name: string
  description: string
  color: string | null
  status: ProjectStatus
  createdBy: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  lastVisitedAt: string | null
  sourceCount: number
  conversationCount: number
  documentCount: number
  calendarEventCount: number
  canvasCount: number
  canManage: boolean
}

export interface Participant {
  id: string
  kind: ParticipantKind
  name: string
  role?: string
  initial: string
  /** Human fallback background; agents use the deterministic Bloub renderer. */
  avatarBg: string
  /** Human profile image. Agent values are always null and ignored by the renderer. */
  avatarUrl?: string | null
  status: Status
  statusUpdatedAt?: string
  bio?: string
  tools?: string[]
  /** Product-level permissions selected by the workspace owner. */
  capabilities?: AgentCapability[]
  /** the agent's distinctive style — only set for agents */
  systemPrompt?: string
  /** Real external email address. Agents get one of the form
   *  `<id>@<companySlug>.<EMAIL_DOMAIN>` (auto-minted on first use);
   *  humans carry their auth email here for the renderer's contact
   *  picker. Null when the email feature isn't configured. */
  email?: string | null
  /** non-null = agent has been off-boarded; ISO timestamp of when */
  departedAt?: string | null
  /** Product-managed identities are discoverable only in their dedicated surface. */
  managed?: boolean
  projectId?: string | null
  presetKey?: string | null
}

export type ConversationKind = 'group' | 'direct' | 'email'

export interface Conversation {
  id: string
  kind: ConversationKind
  title: string
  /** Display subtitle or member summary. */
  subtitle?: string
  /** free-form purpose / topic line, editable by any member */
  topic?: string | null
  /** participant ids */
  members: string[]
  /** Explicit agent responsible for ordinary group messages. */
  leaderId: string | null
  /** Product-managed announcement rooms may be viewed but not replied to. */
  readOnly?: boolean
  pinned?: boolean
  /** Per-user mute. When true, the conversation suppresses notifications and
   *  is excluded from the global unread total (but its per-row badge still
   *  shows). Pair with `mutedUntil` to know when the mute auto-expires. */
  muted?: boolean
  /** ISO timestamp when the mute auto-expires; null/undefined = forever. */
  mutedUntil?: string | null
  unread?: number
  /** Latest persisted message id from the conversation list payload. Used to
   *  detect when the sidebar preview has advanced past the open transcript. */
  lastMessageId?: string | null
  lastAt: string
  /** Raw ISO timestamp the row was last touched (last message time, or
   *  the conversation's own updatedAt when there are no messages yet).
   *  Server returns the list in this order; we keep the raw value so any
   *  client-side re-sort uses real time rather than the display label. */
  lastAtIso: string
  preview: string
  /** optional special tag */
  tag?: 'team' | 'human' | 'fresh-pulled' | 'teacher'
  /** if pulled by an agent: the convener id and reason */
  pulledBy?: { agentId: string; at: string; reason: string }
}

/* ============== Polls (lightweight votes inline in any conversation) ====== */

export interface PollOption {
  id: string
  text: string
}

export interface PollPayload {
  question: string
  mode: 'single' | 'multi'
  options: PollOption[]
  /** iso timestamp; null = no expiration */
  expiresAt: string | null
  /** iso when manually or auto-closed; null while open */
  closedAt: string | null
  closedReason: 'expired' | 'manual' | null
}

export interface PollTally {
  optionId: string
  count: number
  /** participant ids of voters who picked this option, sorted ASC. */
  voterIds: string[]
}

export interface ViewKey {
  view: 'conversations' | 'mail' | 'calendar' | 'library' | 'learning' | 'courses'
}

