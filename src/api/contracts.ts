import type {
  AgentCapability,
  CalendarEventKind,
  CalendarEventStatus,
  CalendarReminderChannel,
  CanvasActivity,
  CanvasComment,
  CanvasFrame,
  CanvasPresence,
  CanvasSnapshot,
  Message,
  RecurrenceRule,
  Status,
  WorkspaceSummary,
} from '@/types'


export interface ApiMessage extends Message {
  sequence: number
  createdAt?: string
  reactions?: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }>
}

export interface ApiConversation {
  id: string
  kind: 'group' | 'direct' | 'whisper' | 'email'
  title: string
  subtitle: string | null
  topic: string | null
  members: string[]
  leaderId: string | null
  pinned: boolean
  muted: boolean
  /** ISO timestamp when the mute auto-expires; null if muted forever or not muted. */
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
    /** Set when last message is an email — used to render "Re: subject"
     *  previews in the sidebar instead of the raw body excerpt. */
    email?: { subject: string; direction: 'in' | 'out'; from: string } | null
  } | null
}

export interface ApiQuotaWindow {
  usedUsd: number
  limitUsd: number | null
  windowStart: string | null
}

export interface ApiQuotaSnapshot {
  groupId: number
  groupName: string | null
  status: string
  expiresAt: string | null
  daily: ApiQuotaWindow
  weekly: ApiQuotaWindow
  monthly: ApiQuotaWindow
}

export interface ApiQuotaResponse {
  configured: boolean
  snapshot: ApiQuotaSnapshot | null
  error?: string
}

/** @deprecated Project APIs remain only for compatibility with stale, unmounted settings modules. */
export type ApiProject = WorkspaceSummary

export interface ApiParticipant {
  id: string
  kind: 'agent' | 'human'
  name: string
  role: string | null
  initial: string
  avatarBg: string
  avatarUrl?: string | null
  status: Status
  statusUpdatedAt?: string
  bio: string | null
  tools: string[] | null
  capabilities: AgentCapability[] | null
  systemPrompt?: string | null
  model?: string | null
  email?: string | null
  departedAt?: string | null
}

export interface ApiCoworkerActivity {
  id: string
  runId: string
  agentId: string
  agentName: string
  runStatus: ApiAgentRunStatus
  kind: string
  level: ApiAgentEventLevel
  title: string
  createdAt: string
}

export interface ApiLearnedMemory {
  agentId: string
  agentName: string
  path: string
  body: string
  meta: { kind?: 'fact' | 'preference' | 'instruction' | 'relationship'; about?: string; [key: string]: unknown }
  updatedAt: string
}

export interface ApiAutonomyRule {
  id: string
  agentId: string
  scope: string
  operation: string
  mode: 'allow' | 'ask' | 'deny'
  source: 'explicit_user' | 'learned'
  createdAt: string
  updatedAt: string
}

/** Universal-search response. The backend ranks results inside each bucket;
 *  the frontend renders them in this declared order (participants → rooms →
 *  groups → messages), matching the product priority. */
export interface ApiSearchResults {
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
    kind: 'direct' | 'whisper'
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
    conversationKind: 'group' | 'direct' | 'whisper'
    authorId: string
    authorName: string | null
    snippet: string
    createdAt: string
  }>
}

export interface AgentInput {
  id?: string
  name?: string
  role?: string
  systemPrompt?: string
  bio?: string
  initial?: string
  avatarBg?: string
  /** pass null to clear the AI portrait and fall back to the color block */
  avatarUrl?: string | null
  tools?: string[]
  capabilities?: AgentCapability[]
}

export interface ApiAttachment {
  url: string
  name: string
  kind: 'img' | 'pdf' | 'file' | 'fig'
  mime?: string
  size?: number
  /** Object-storage key, present when the file lives in R2. */
  key?: string
}

export interface UploadCapabilities {
  mode: 'local' | 'r2'
  presignSupported: boolean
  maxBytes: number
  allowedMimes: string[]
}

export interface PresignResponse {
  uploadUrl: string
  publicUrl: string
  key: string
  name: string
  mime: string
  size: number
  kind: 'img' | 'file'
}

/** A peek-view entry — either a 1-on-1 direct chat or a multi-agent
 *  group, where every member is an agent. "Whisper" is the frontend tab
 *  name; on the server these are just regular conversations the user
 *  isn't a member of (so they don't show up in /conversations, but the
 *  peek tab lets the user eavesdrop). */
export interface ApiWhisper {
  id: string
  kind: 'direct' | 'group'
  title: string
  members: string[]
  /** Convenience accessors for the 1-on-1 case — null for groups. */
  agentA: string | null
  agentB: string | null
  about: string | null
  createdAt: string
  updatedAt: string
  msgCount: number
}

export interface ApiWhisperMessage {
  id: string
  conversationId: string
  authorId: string
  kind: string
  body: string
  sequence: number
  tool?: { name: string; arg: string; status: string; detail: string; icon?: string } | null
  createdAt: string
}

export interface ApiAutonomy {
  userId: string
  agentId: string
  threshold: number
  pulled: number
  led: number
  dissolved: number
}

export type ApiAgentRunStatus = 'running' | 'waiting_for_human' | 'completed' | 'failed' | 'skipped' | 'stalled'
export type ApiAgentEventLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ApiAgentRun {
  id: string
  agentId: string
  agentName: string
  agentRole: string | null
  agentAvatarUrl: string | null
  companyId: string
  status: ApiAgentRunStatus
  stage: string | null
  summary: string | null
  error: string | null
  trigger: Record<string, unknown>
  inputMessageIds: string[]
  inboxCount: number
  toolCallCount: number
  tokenCount: number
  fingerprint: string | null
  startedAt: string
  updatedAt: string
  finishedAt: string | null
  durationMs: number
}

// ── Triage cost-effectiveness ledger ──
export type ApiTriageSource = 'cloud' | 'agent-os' | 'product'

export interface ApiTriageAgentRow {
  agentId: string
  agentName: string
  triageCount: number
  skipCount: number
  wakeCount: number
  triageCostUsd: number
  triageOverheadUsd: number
  turnCount: number
  avgTurnCostUsd: number
  turnCacheHitRate: number
  estimatedNetSavingsUsd: number
}

export interface ApiTriageLedgerRow {
  id: string
  agentId: string
  agentName: string
  source: ApiTriageSource
  model: string | null
  actionable: boolean
  reason: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  costUsd: number
  costEstimated: boolean
  measured: boolean
  estSavingUsd: number | null
  createdAt: string
}

export interface ApiTriageUnitPrice {
  role: 'triage' | 'turn'
  model: string
  inPer1M: number
  cachedInPer1M: number
  outPer1M: number
  estimated: boolean
}

export interface ApiTriagePriceRow {
  model: string
  inPer1M: number
  cachedInPer1M: number
  cacheWritePer1M: number
  outPer1M: number
  estimated: boolean
}

export interface ApiTriageEconomics {
  sinceHours: number
  triageCount: number
  triageSkipCount: number
  triageWakeCount: number
  triageMeasuredCount: number
  triageCostUsd: number
  triageOverheadUsd: number
  triageInputTokens: number
  triageCachedInputTokens: number
  triageOutputTokens: number
  turnCount: number
  turnCostUsd: number
  avgTurnCostUsd: number
  turnCacheHitRate: number
  estimatedAvoidedUsd: number
  estimatedNetSavingsUsd: number
  costEstimated: boolean
  unitPrices: ApiTriageUnitPrice[]
  priceTable: ApiTriagePriceRow[]
  perAgent: ApiTriageAgentRow[]
  recent: ApiTriageLedgerRow[]
}

export interface ApiAgentEvent {
  id: string
  runId: string
  agentId: string
  kind: string
  level: ApiAgentEventLevel
  title: string
  data: Record<string, unknown>
  createdAt: string
}

export interface ApiConveneSession {
  id: string
  conversation_id: string
  title: string
  flair: string | null
  started_by: string
  started_at: string
  ended_at: string | null
  state: 'live' | 'ended'
}

export interface ApiConveneTranscript {
  id: string
  sessionId: string
  authorId: string
  kind: 'text' | 'thought' | 'tool' | 'decision'
  body: string
  sequence: number
  decision: { headline: string; body: string } | null
  createdAt: string
}

export interface ApiDevtoolsCapabilities {
  enabled: boolean
  canEnable: boolean
  localDev: boolean
  productionDevMode: boolean
  role: string
}

export interface ApiAgentWorkspaceFile {
  path: string
  size: number
  lineCount: number
  updatedAt: string
}

export interface ApiAgentWorkspaceFileContent extends ApiAgentWorkspaceFile {
  body: string
}

export interface MeResponse {
  user: { id: string; email: string; name: string; emailVerified: boolean; providers: string[] }
  companies: Array<{ id: string; name: string; slug: string; role: string; tier?: string }>
  activeCompanyId: string | null
  serverCapabilities: ServerCapabilities
}

export interface ServerCapabilities {
  /** Whether the server can send outbound invitation / welcome emails.
   *  Driven by EMAIL_DOMAIN being set on the server. The invite modal
   *  hides the "Email this invite" checkbox when false. */
  invitationEmail: boolean
}

export type ApiInvitationStatus = 'active' | 'revoked' | 'expired' | 'consumed'

export interface ApiInvitation {
  /** Stable identifier (= server-side token_hash). Used by the revoke
   *  endpoint. The raw token itself is ONLY returned on create — never
   *  re-exposed. */
  id: string
  email: string | null
  role: 'member' | 'admin'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  lastAcceptedAt: string | null
  lastAcceptedBy: string | null
  invitedBy: string
  inviterName: string | null
  status: ApiInvitationStatus
}

/** Returned exactly ONCE from the create endpoint. Embeds the freshly-minted
 *  raw token + the public accept URL — the server keeps only the hash, so
 *  the UI must surface this immediately for the user to copy / send. */
export interface ApiInvitationWithToken {
  id: string
  token: string
  url: string
  email: string | null
  role: 'member' | 'admin'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  status: 'active'
  /** Present when the inviter asked the server to send the invite email
   *  on their behalf (`sendEmail: true` in the create payload). Null when
   *  they did not. The UI uses this to render "email sent" /
   *  "email failed: <reason>" feedback alongside the copy-link card. */
  emailDelivery: ApiInvitationEmailDelivery | null
}

export interface ApiInvitationEmailDelivery {
  attempted: boolean
  ok: boolean
  error: string | null
  /** Set when the server deliberately didn't try — today only
   *  'no_email_config' (EMAIL_DOMAIN unset). Distinct from `error` so
   *  the UI can show a different message. */
  skipped: 'no_email_config' | null
}

export type ApiInvitationPreviewStatus =
  | 'valid' | 'revoked' | 'expired' | 'consumed'
  | 'wrong_email' | 'already_member' | 'not_found'

export interface ApiInvitationPreview {
  status: ApiInvitationPreviewStatus
  invitation?: {
    role: string
    email: string | null
    note: string | null
    expiresAt: string
    createdAt: string
    inviterName: string | null
    company: { id: string; name: string; slug: string }
    multiUse: boolean
  }
}

export interface ApiInvitationAccept {
  ok: true
  alreadyMember: boolean
  company: { id: string; name: string; slug: string; role: string }
}

export interface ApiCompanyProfile {
  id: string
  name: string
  slug: string
  description: string
  role: 'owner' | 'admin' | 'member'
  createdAt: string
}

export interface ApiCompanyMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  courses: Array<{ courseId: string; name: string; role: 'teacher' | 'learner' }>
}

export interface ApiCourse {
  id: string
  companyId: string
  projectId: string
  name: string
  description: string
  color: string
  status: 'active' | 'archived'
  createdBy: string
  studyRoomId: string | null
  companyRole?: 'owner' | 'admin' | 'member'
  courseRole: 'teacher' | 'learner' | null
  memberCount: number
  canManage: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ApiCourseMember {
  id: string
  name: string
  email: string
  role: 'teacher' | 'learner'
  joinedAt: string
}

export interface ApiCourseInvitation {
  id: string
  email: string | null
  role: 'teacher' | 'learner'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  revokedAt?: string | null
  lastAcceptedAt?: string | null
  lastAcceptedBy?: string | null
  acceptances?: Array<{ userId: string; name: string | null; role: 'teacher' | 'learner'; acceptedAt: string }>
  status: 'active' | 'revoked' | 'expired' | 'consumed'
}

export interface ApiCourseInvitationWithToken extends ApiCourseInvitation {
  token: string
  url: string
}

export interface ApiCourseInvitationPreview {
  kind: 'course'
  status: ApiInvitationPreviewStatus | 'archived'
  invitation?: {
    role: 'teacher' | 'learner'
    email: string | null
    note: string | null
    expiresAt: string
    inviterName: string | null
    company: { id: string; name: string; slug: string }
    course: { id: string; name: string; projectId: string; studyRoomId: string | null }
  }
}

export interface ApiCourseInvitationAccept {
  ok: true
  alreadyMember: boolean
  joinedCompany: boolean
  company: { id: string; name: string; slug: string; role: string }
  course: { id: string; name: string; projectId: string; studyRoomId: string | null; role: 'teacher' | 'learner' }
}

export type ShippingFeatureStatus =
  | 'draft' | 'contract' | 'building' | 'verifying' | 'ready'
  | 'releasing' | 'watching' | 'learned' | 'paused' | 'archived'
export type ShippingVerificationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'waived'

export interface ShippingFeatureSummary {
  id: string
  title: string
  status: ShippingFeatureStatus
  priority: 'critical' | 'high' | 'medium' | 'low'
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  releaseTarget: string | null
  builderIds: string[]
  projectId: string | null
  updatedAt: string
  requiredSquares: number
  passedSquares: number
  failedSquares: number
}

export interface ShippingInvariant {
  id: string
  title: string
  description: string
  kind: 'behavior' | 'architecture' | 'data' | 'security' | 'performance' | 'ux' | 'operability'
  required: boolean
  position: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ShippingVerification {
  id: string
  invariantId: string | null
  title: string
  description: string
  method: 'user_path' | 'property' | 'trace' | 'data_reconciliation' | 'design_qa' | 'security' | 'performance' | 'release_note'
  required: boolean
  status: ShippingVerificationStatus
  ownerId: string | null
  verifiedById: string | null
  builderIds: string[]
  evidence: Array<Record<string, unknown>>
  notes: string
  position: number
  dueAt: string | null
  completedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ShippingRelease {
  id: string
  environment: 'development' | 'staging' | 'canary' | 'production'
  status: 'planned' | 'approved' | 'running' | 'succeeded' | 'failed' | 'rolled_back'
  version: string | null
  commitSha: string | null
  startedBy: string | null
  approvedBy: string | null
  releaseNotes: string
  rollbackPlan: string
  knownGaps: Array<Record<string, unknown>>
  baseline: Array<Record<string, unknown>>
  smokeEvidence: Array<Record<string, unknown>>
  readbackDueAt: string | null
  readbackStatus: 'pending' | 'passed' | 'failed' | 'overdue'
  readbackEvidence: Array<Record<string, unknown>>
  startedAt: string | null
  completedAt: string | null
  rolledBackAt: string | null
  rollbackReason: string | null
  createdAt: string
  updatedAt: string
}

export interface ShippingFriction {
  id: string
  featureId: string | null
  title: string
  description: string
  source: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  frequency: 'once' | 'occasional' | 'frequent' | 'constant'
  status: 'open' | 'triaged' | 'planned' | 'resolved' | 'dismissed'
  occurrenceCount: number
  lastSeenAt: string
  evidence?: Array<Record<string, unknown>>
}

export interface ShippingRegression {
  id: string
  invariantId: string | null
  sourceVerificationId: string | null
  title: string
  kind: 'automated' | 'benchmark' | 'manual_replay' | 'monitor'
  command: string | null
  expected: string
  status: 'active' | 'passing' | 'failing' | 'disabled'
  lastResult: string
  lastEvidence: Array<Record<string, unknown>>
  lastRunAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ShippingFeatureDetail extends Omit<ShippingFeatureSummary, 'requiredSquares' | 'passedSquares' | 'failedSquares'> {
  problem: string
  desiredOutcome: string
  contractSummary: string
  conversationId: string | null
  documentId: string | null
  boardCardId: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  archivedAt: string | null
  invariants: ShippingInvariant[]
  verifications: ShippingVerification[]
  releases: ShippingRelease[]
  frictions: ShippingFriction[]
  regressions: ShippingRegression[]
  events: Array<{ id: string; actorId: string | null; kind: string; data: Record<string, unknown>; createdAt: string }>
}

export interface ShippingOverview {
  features: ShippingFeatureSummary[]
  friction: ShippingFriction[]
  dueReadbacks: Array<{ id: string; featureId: string; featureTitle: string; readbackDueAt: string; readbackStatus: 'pending' | 'overdue' }>
}



export interface ApiDocument {
  id: string
  title: string
  createdBy: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

/** Body shape for create/update calendar event. The server validates each
 *  field independently so partial updates work. */
export interface CalendarEventInput {
  title: string
  kind?: CalendarEventKind
  description?: string | null
  assigneeId?: string | null
  targetConversationId?: string | null
  agentPrompt?: string | null
  startAt: string
  endAt?: string | null
  allDay?: boolean
  recurrence?: RecurrenceRule | null
  status?: CalendarEventStatus
  reminderMinutesBefore?: number | null
  reminderChannel?: CalendarReminderChannel | null
  /** Privacy flag. When true, only the creator + assignee see the row
   *  (and the workspace owner, if the row involves an agent). Default
   *  false = same shared-workspace behavior as before. */
  isPrivate?: boolean
}

/* ============== WebSocket bridge ============== */

export type WsEvent =
  | { type: 'hello'; instanceId: string; ts: number }
  | { type: 'message.new'; conversationId: string; message: ApiMessage }
  | { type: 'message.delta'; conversationId: string; messageId: string; authorId: string; delta: string; sequence: number; done: boolean }
  | { type: 'typing'; conversationId: string; agentId: string; done: boolean }
  | { type: 'agent.activity'; conversationIds: string[]; activity: ApiCoworkerActivity }
  | { type: 'participants.status'; participantId: string; status: Status; statusUpdatedAt?: string }
  | { type: 'participants.avatar'; participantId: string; avatarUrl: string }
  | { type: 'participants.added'; conversationId?: string; participant: {
      id: string; kind: 'human' | 'agent'; name: string; role: string | null;
      initial: string; avatarBg: string; avatarUrl: string | null;
      status: Status; statusUpdatedAt: string | null;
    } }
  | { type: 'message.reactions'; conversationId: string; messageId: string; reactions: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }> }
  | { type: 'group.pulled'; conversationId: string; pulledById: string }
  | { type: 'conversation.updated'; conversationId: string; patch: { topic?: string | null; title?: string; leaderId?: string | null } }
  | { type: 'convene'; sessionId: string; conversationId: string; kind: 'started' | 'transcript' | 'ended' | 'tile'; data?: unknown }
  | { type: 'board.changed'; kind:
        | 'board.created' | 'board.updated' | 'board.deleted'
        | 'column.created' | 'column.updated' | 'column.deleted'
        | 'card.created' | 'card.updated' | 'card.moved' | 'card.deleted'
        | 'comment.created' | 'comment.deleted'
      boardId: string; cardId?: string; columnId?: string; commentId?: string
      mentions?: string[]; actorId?: string }
  | { type: 'doc.sync'; documentId: string; stateB64: string; originId: string }
  | { type: 'doc.update'; documentId: string; updateB64: string; originId: string }
  | { type: 'doc.awareness'; documentId: string; updateB64: string; originId: string }
  | { type: 'doc.error'; documentId?: string; error: string }
  | { type: 'doc.changed'; kind: 'document.created' | 'document.updated' | 'document.deleted'; documentId: string; actorId?: string }
  | { type: 'doc.mention'; documentId: string; documentTitle: string; mentionerId: string; mentionerName: string; mentionedIds: string[] }
  | {
      type: 'canvas.changed'
      kind:
        | 'frame.created' | 'frame.updated' | 'frame.deleted'
        | 'presence.updated' | 'presence.removed'
        | 'comment.created' | 'activity.created'
        | 'workspace.started' | 'workspace.updated' | 'assignment.updated' | 'cursor.moved'
      canvasId: string
      timestamp: string
      conversationId?: string
      revision?: number
      frameId?: string
      participantId?: string
      frame?: CanvasFrame
      presence?: CanvasPresence
      assignment?: import('@/types').CanvasAgentAssignment
      workspace?: Partial<CanvasSnapshot> & { id: string }
      comment?: CanvasComment
      activity?: CanvasActivity
    }
  | {
      type: 'calendar.reminder'
      eventId: string
      title: string
      occurrenceAt: string
      leadMinutes: number
      /** Server limits this to humans only; renderer further filters by
       *  meId === one-of(recipientUserIds) before showing the toast. */
      recipientUserIds: string[]
      kind: CalendarEventKind
      assigneeId: string | null
    }
  | {
      /** A calendar row was created / updated / deleted, or the dispatcher
       *  advanced its last_fired_at. Payload is thin — clients refetch the
       *  affected row (or drop it on delete) rather than diffing inline.
       *  Mirrors the `doc.changed` shape. */
      type: 'calendar.changed'
      kind: 'event.created' | 'event.updated' | 'event.deleted' | 'event.dispatched'
      eventId: string
      actorId: string | null
    }
  | {
      type: 'poll.updated'
      conversationId: string
      messageId: string
      poll: import('../types.js').PollPayload
      tallies: import('../types.js').PollTally[]
      actorId: string | null
    }
