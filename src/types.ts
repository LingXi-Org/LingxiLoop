import type { CanvasActivityKind } from '@/lib/canvasEventKinds'

export type { CanvasActivityKind } from '@/lib/canvasEventKinds'

export type AgentRole = 'researcher' | 'designer' | 'engineer' | 'pm' | 'brand' | 'ops'
export type ParticipantKind = 'agent' | 'human'
export type Status = 'avail' | 'working' | 'thinking' | 'waiting' | 'resting'
export type AgentCapability = 'canvas' | 'web' | 'files' | 'email' | 'documents' | 'calendar' | 'knowledge' | 'learning' | 'teacher_admin'

export type KnowledgeSourceStatus = 'upload_pending' | 'queued' | 'processing' | 'ready' | 'failed'

export interface WorkspaceSummary {
  id: string
  name: string
  description: string
  color: string | null
  status: 'active' | 'archived'
  createdBy: string
  isGeneral: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  lastVisitedAt: string | null
  sourceCount: number
  conversationCount: number
  documentCount: number
  boardCount: number
  calendarEventCount: number
  canvasCount: number
  canManage: boolean
}

export interface KnowledgeSource {
  id: string
  kind: 'file' | 'url' | 'text'
  title: string
  mimeType: string | null
  sizeBytes: number
  originalUrl: string | null
  originalFileUrl?: string | null
  status: KnowledgeSourceStatus
  stage: string
  error: string | null
  isTruncated: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  chunkCount?: number
  extractedText?: string | null
  /** Present for sources automatically ingested from a chat attachment. */
  originClientMsgNo?: string | null
}

export interface KnowledgeCitation {
  sourceId: string
  sourceTitle: string
  chunkId: string
  excerpt: string
  sourceUrl?: string
  position: number
  marker: string
}

export interface ConversationSourceSelection {
  conversationId: string
  sources: Array<{ sourceId: string; title: string; status: KnowledgeSourceStatus; enabled: boolean }>
}

export interface Participant {
  id: string
  kind: ParticipantKind
  name: string
  role?: string
  initial: string
  /** linear-gradient or any css background — fallback when avatarUrl is empty */
  avatarBg: string
  /** AI-generated portrait URL (preferred over avatarBg when set) */
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

export type MessageKind = 'text' | 'tool' | 'attachment' | 'thought' | 'system' | 'email' | 'poll' | 'handoff' | 'approval' | 'canvas' | 'learning_mission'

export interface HandoffPayload {
  id: string
  fromAgentId: string
  toAgentId: string
  title: string
  status: 'pending' | 'accepted' | 'working' | 'completed' | 'blocked'
  note?: string | null
  sharedPaths: string[]
  browserTargets: string[]
}

export interface ApprovalPayload {
  id: string
  agentId: string
  kind: 'external_communication' | 'sensitive_or_destructive_action' | 'financial_or_irreversible_action' | 'course_management' | 'learning_evaluation'
  summary: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  payload: Record<string, unknown>
  requestedAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  requestedBy?: string | null
  scope?: Record<string,unknown>
  preview?: Record<string,unknown>
  error?: string | null
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

/** Headers + transport status for a single email message. Populated by the
 *  server's `/conversations/:id/messages` LEFT JOIN against `email_messages`,
 *  so it's only present when `Message.kind === 'email'`. */
export interface EmailFields {
  subject: string
  /** "Name <addr@host>" or just "addr@host" — already formatted for display. */
  from: string
  to: string[]
  cc: string[]
  /** 'in'  = arrived from outside via the Cloudflare Email Worker;
   *  'out' = sent by an agent / human in this workspace. */
  direction: 'in' | 'out'
  /** 'queued' | 'sent' | 'failed' | 'received' — drives the bubble's
   *  failed-state badge and the "still being sent" spinner. */
  transportStatus: string
  transportError?: string | null
  /** RFC 5322 Message-ID, bracket-less. Useful for debug overlays + the
   *  reply-thread anchor when the renderer eventually adds compose. */
  smtpMessageId?: string | null
  inReplyTo?: string | null
  hasHtml?: boolean
  /** RFC 3834 Auto-Submitted marker. true when the row was originated by
   *  automation — heartbeat, agent CLI, or an upstream vacation responder.
   *  The renderer can use this to dim auto-replies or keep them out of
   *  the "needs human attention" count. */
  autoSubmitted?: boolean
  /** Attachments parsed from the original MIME message. Inbound mail
   *  uploads bytes to object storage during the webhook flow; the renderer
   *  receives a signed download URL on each entry. `truncated` means the
   *  upstream attachment was too big to forward — metadata only, no bytes. */
  attachments?: Array<{
    id: string
    filename: string
    mimeType: string
    sizeBytes: number
    url: string | null
    truncated?: boolean
  }>
}

export interface ReactionEntry {
  emoji: string
  count: number
  mine?: boolean
  /** participant ids of who reacted with this emoji, sorted */
  users?: string[]
}

/** Minimal inlined view of a quoted-original — server resolves this on read so
 *  the renderer can draw the quote card without per-bubble fetches. Body is
 *  truncated to ~240 chars; full original lives at `quoted.id` if needed. */
export interface QuotedSummary {
  id: string
  authorId: string
  authorName?: string
  kind: MessageKind
  body: string
  sequence: number
}

export interface Message {
  id: string
  conversationId: string
  authorId: string
  kind: MessageKind
  body: string
  citations?: KnowledgeCitation[]
  /** Structured mention metadata resolved against the conversation roster. */
  mentionedIds?: string[]
  mentionAll?: boolean
  /** Agent OS run identity used to hand off a live Markdown stream to its
   * persisted final message without briefly rendering both. */
  runId?: string
  at: string
  /** Canonical timestamp used for transcript grouping. Legacy/mock rows may omit it. */
  createdAt?: string
  reactions?: ReactionEntry[]
  /** for tool messages */
  tool?: {
    name: string
    arg: string
    status: string
    detail: string
    icon?: 'web' | 'github' | 'figma' | 'db'
  }
  /** for attachments */
  attachment?: {
    name: string
    /** kind 'img' renders inline; others render as a file card */
    kind: 'img' | 'pdf' | 'file' | 'fig'
    /** real assets carry a URL; mock/legacy data may not */
    url?: string
    mime?: string
    size?: number
    /** legacy descriptor — fallback when no real file is present (e.g. mock data) */
    meta?: string
  }
  /** Populated by the server when kind === 'email'. Carries headers,
   *  direction, and transport status so the email bubble can render the
   *  "subject + from / to / cc + sent/failed" chrome. */
  email?: EmailFields
  /** Populated by the server when kind === 'poll'. */
  poll?: PollPayload
  /** Per-option aggregated tallies for kind === 'poll'. Empty array for
   *  any other message kind. Updated in place by `poll.updated` WS events. */
  pollTallies?: PollTally[]
  handoff?: HandoffPayload
  approval?: ApprovalPayload
  canvas?: {
    canvasId: string
    title: string
    goal: string
    status: CanvasWorkspaceStatus
    members: Array<{ agentId: string; assignment: string; color: string; status: CanvasAssignmentStatus }>
    frameCount: number
  }
  learningMission?: {
    missionId: string
    courseId: string
    goal: string
    successCriteria: string
    status: string
  }
  /** Reply-to / quote pointer: the id of another message in this same
   *  conversation that this one is quoting. Null for non-reply messages. */
  quotedMessageId?: string
  /** Inlined summary of the quoted-original, resolved server-side so the
   *  renderer can draw the quote card without a second roundtrip. Missing
   *  when the original was deleted — bubble renders "[deleted]". */
  quoted?: QuotedSummary
  /** Number of OTHER messages quoting this one. Drives the "N 条回复" link
   *  under the bubble that opens the thread drawer. Server-computed on
   *  fetch; 0 / undefined means no replies. */
  replyCount?: number
  /** Optimistic-render flags. Only set on locally-inserted messages awaiting
   *  the server round-trip; never returned from the API. */
  pending?: boolean
  failed?: boolean
  /** Stable identity that survives the temp-id → real-id rename so React
   *  keeps the same DOM node (avoids re-firing the entry animation). Set on
   *  optimistic insert; carried onto the server echo in `applyEvent`. */
  clientId?: string
  /** Renderer-only lifecycle marker for the single in-flight bubble. */
  streaming?: 'placeholder' | 'markdown'
}

export interface ViewKey {
  view: 'sources' | 'conversations' | 'mail' | 'convene' | 'agents' | 'canvas' | 'boards' | 'calendar' | 'documents' | 'shipping' | 'observability' | 'me' | 'library' | 'learning'
}

export type LearningRole = 'teacher' | 'learner'

export interface LearningCourse {
  id: string
  companyId: string
  projectId: string
  title: string
  description: string
  status: 'draft' | 'active' | 'archived'
  roles: LearningRole[]
  roomCount: number
  objectiveCount: number
  learnerCount: number
  createdAt: string
  updatedAt: string
}

export interface LearningObjective {
  id: string
  courseId: string
  title: string
  successCriteria: string
  targetLevel: 1 | 2 | 3 | 4
  position: number
  status: 'draft' | 'published' | 'archived'
  prerequisiteIds: string[]
}

export interface LearningActivity {
  id: string
  courseId: string
  title: string
  instructions: string
  type: 'lesson' | 'practice' | 'assessment' | 'project' | 'review'
  status: 'draft' | 'published' | 'closed'
  evaluationMode: 'agent_formative' | 'teacher_required'
  targetLevel: 1 | 2 | 3 | 4
  rubric: unknown[]
  objectiveIds: string[]
  dueAt?: string
}

export interface LearningDashboard {
  courses: LearningCourse[]
  due: Array<{ course_id: string; objective_id: string; title: string; level: number; status: string; next_review_at: string }>
  mastery: Array<{ course_id: string; objective_id: string; title: string; level: number; status: string; next_review_at: string | null; review_interval_days: number }>
  pendingReviews: number
}

export interface TeacherDigestSchedule {
  frequency:'daily'|'weekly'|'off'
  timezone:string
  localTime?:string
  weekday?:'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'
  status:'active'|'paused'
  nextRunAt?:string
}

export interface TeacherAgentSummary {
  agentId:string
  displayName:string
  projectId:string
  courseId:string
  roomId:string
  roomStatus:'active'|'closed'
  digest:TeacherDigestSchedule
  pendingApprovals:number
}

/* ============== Shared Canvas ======================================== */

export type CanvasFrameType = 'html' | 'markdown' | 'document' | 'image' | 'artifact'

export interface CanvasFrame {
  id: string
  canvasId: string
  type: CanvasFrameType
  title: string
  x: number
  y: number
  width: number
  height: number
  content: string
  data: Record<string, unknown>
  revision: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface CanvasPresence {
  participantId: string
  participantKind: 'user' | 'agent'
  status: string
  frameId: string | null
  color?: string | null
  cursorX?: number | null
  cursorY?: number | null
  lastSeenAt: string
}

export type CanvasWorkspaceStatus = 'active' | 'summarizing' | 'completed' | 'stopped' | 'failed'
export type CanvasAssignmentStatus = 'queued' | 'blocked' | 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type AgentExecutionRole = 'coordinator' | 'specialist' | 'verifier' | 'reporter'
export type CanvasAssignmentExecutionRole = 'specialist' | 'verifier'
export interface CanvasAssignmentReport {
  id:string;canvasId:string;assignmentId:string|null;authorAgentId:string;executionRole:Exclude<AgentExecutionRole,'coordinator'>
  schemaVersion:'learning_report_v1';finding:string;evidenceRefs:Array<{kind:'frame'|'message'|'document'|'source'|'attempt'|'report';id:string}>
  confidence:number;unresolved:string[];nextStep:string|null;verifiesReportId:string|null;disconfirmingChecks:string[]
  verdict:'supported'|'rejected'|'inconclusive'|null;consumedReportIds:string[];conflictResolution:unknown[];createdAt:string
}

export interface CanvasAgentAssignment {
  id: string
  canvasId: string
  agentId: string
  assignment: string
  color: string
  status: CanvasAssignmentStatus
  workArea: { x: number; y: number; width: number; height: number }
  activeFrameId: string | null
  cursor: { x: number; y: number } | null
  workId: string | null
  dependsOnAgentIds: string[]
  executionRole: CanvasAssignmentExecutionRole
  verifiesAssignmentId: string | null
  progressFingerprint?: string | null
  noProgressCount?: number
  result: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface CanvasWorkspaceSummary {
  id: string
  title: string
  goal: string
  conversationId: string | null
  initiatorAgentId: string | null
  status: CanvasWorkspaceStatus
  origin: string
  frameCount: number
  assignmentCount: number
  updatedAt: string
  createdAt: string
}

export interface CanvasComment {
  id: string
  canvasId: string
  frameId: string | null
  authorId: string
  authorKind: 'user' | 'agent'
  body: string
  createdAt: string
}

export interface CanvasActivity {
  id: string
  canvasId: string
  frameId: string | null
  actorId: string
  actorKind: 'user' | 'agent'
  action: CanvasActivityKind
  detail: Record<string, unknown>
  createdAt: string
}

export interface CanvasSnapshot {
  id: string
  title: string
  companyId: string
  conversationId: string | null
  triggerClientMsgNo: string | null
  goal: string
  initiatorAgentId: string | null
  status: CanvasWorkspaceStatus
  origin: string
  summary: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  frames: CanvasFrame[]
  assignments: CanvasAgentAssignment[]
  presence: CanvasPresence[]
  comments: CanvasComment[]
  activity: CanvasActivity[]
  reports: CanvasAssignmentReport[]
}

/* ============== Calendar (AI-native shared schedule) ============== */

/** Minimal recurrence rule — mirrors the server-side shape in
 *  `server/src/calendar.ts`. We keep this client-side type narrow on
 *  purpose: anything not expressible here is rejected at the form layer
 *  rather than silently dropped on save. */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  /** 0=Sun … 6=Sat. Only used when freq='weekly'. */
  byweekday?: number[]
  /** Inclusive ISO timestamp upper bound for the series. */
  until?: string | null
  /** Hard cap on total firings. */
  count?: number | null
}

export type CalendarEventKind = 'personal' | 'agent_task'
export type CalendarEventStatus = 'active' | 'paused' | 'done' | 'cancelled'
export type CalendarReminderChannel = 'toast' | 'email' | 'both'

export interface CalendarEvent {
  id: string
  companyId: string
  createdBy: string
  kind: CalendarEventKind
  title: string
  description: string | null
  /** Participant id (agent or human) that this event "fires at" — only
   *  meaningful when kind='agent_task'. Personal events ignore it. */
  assigneeId: string | null
  /** Conversation the dispatch message lands in on each firing. Null =
   *  scheduler will fall back to the creator↔assignee DM if it exists. */
  targetConversationId: string | null
  /** The body posted on each occurrence (rendered as a system message). */
  agentPrompt: string | null
  startAt: string
  endAt: string | null
  allDay: boolean
  recurrence: RecurrenceRule | null
  status: CalendarEventStatus
  lastFiredAt: string | null
  /** Pre-event heads-up: notify N minutes before each occurrence. Null
   *  means no reminder. Paired with `reminderChannel`. */
  reminderMinutesBefore: number | null
  reminderChannel: CalendarReminderChannel | null
  /** When true, only the row's `createdBy` and `assigneeId` can see it.
   *  The company owner additionally sees private rows where either side
   *  is an agent (workspace-supervision affordance). Default false. */
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

export interface CalendarDispatch {
  id: string
  eventId: string
  scheduledFor: string
  dispatchedAt: string
  status: string
  conversationId: string | null
  messageId: string | null
  error: string | null
}

/* ============== Kanban boards ============== */

export interface BoardSummary {
  id: string
  title: string
  description: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BoardColumn {
  id: string
  title: string
  position: number
  createdAt: string
}

export interface BoardCard {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  position: number
  assigneeId: string | null
  mentions: string[]
  commentCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BoardCardComment {
  id: string
  authorId: string
  body: string
  mentions: string[]
  createdAt: string
}

export interface BoardSnapshot extends BoardSummary {
  columns: BoardColumn[]
  cards: BoardCard[]
}

export interface BoardCardLookup {
  board: BoardSummary
  column: BoardColumn
  card: BoardCard
}
