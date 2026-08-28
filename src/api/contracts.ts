import type {
  AgentCapability,
  CanvasActivity,
  CanvasComment,
  CanvasFrame,
  CanvasPresence,
  CanvasSnapshot,
  Message,
  Status,
  WorkspaceSummary,
} from '@/types'


export interface ApiMessage extends Message {
  sequence: number
  createdAt: string
  reactions?: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }>
}

/** Workspace record returned by project APIs. */
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
  mode: 'r2'
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

export interface MeResponse {
  user: { id: string; email: string; name: string; emailVerified: boolean; providers: string[] }
  companies: Array<{ id: string; name: string; slug: string; role: string }>
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
  /** Present when the server sent the invitation email. Null when email
   *  delivery was not requested. Delivery failures reject the request. */
  emailDelivery: ApiInvitationEmailDelivery | null
}

export interface ApiInvitationEmailDelivery {
  ok: true
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

export type LearningRole = 'teacher' | 'learner'

export interface LearningCourse {
  id: string
  companyId: string
  projectId: string
  title: string
  description: string
  status: 'active' | 'archived'
  courseRole: LearningRole
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

export interface LearningMissionStep {
  id: string
  type: 'learn' | 'practice' | 'check' | 'reflect'
  description: string
  successCriteria: string
  objectiveId?: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  position: number
  outcome?: string
  completionReportId?: string
  completionAttemptId?: string
}

export interface LearningMission {
  id: string
  courseId: string
  learnerId: string
  conversationId: string
  triggerClientMsgNo: string
  goal: string
  successCriteria: string
  missionKind: 'study' | 'research' | 'project'
  coordinatorAgentId: string
  coordinatorName?: string
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled'
  steps: LearningMissionStep[]
  createdAt: string
  updatedAt: string
}

export interface LearningEvidence {
  id: string
  activity_id: string | null
  mission_step_id: string | null
  assistance: 'none' | 'hint' | 'guided'
  status: string
  evidence: unknown
  created_at: string
  evaluation_id: string | null
  demonstrated_level: number | null
  confidence: number | null
  rubric_results: unknown
  feedback: string | null
  evaluation_status: string | null
  learner_id?: string
}

export interface LearningReview {
  id: string
  attempt_id: string
  learner_id: string
  activity_id: string | null
  activity_title: string | null
  demonstrated_level: number
  confidence: number
  feedback: string
  source_report_id: string | null
  verifier_report_id: string | null
  builder_agent_id: string | null
  verifier_agent_id: string | null
  verifier_verdict: 'supported' | 'rejected' | 'inconclusive' | null
  status?: string
  [key: string]: unknown
}

export interface LearningProgress {
  user_id: string
  display_name: string
  email: string
  average_level: number
  verified_objectives: number
  due_objectives: number
  attempts: number
}

export interface LearningDashboard {
  courses: LearningCourse[]
  due: Array<{ course_id: string; objective_id: string; title: string; level: number; status: string; next_review_at: string }>
  mastery: Array<{ course_id: string; objective_id: string; title: string; level: number; status: string; next_review_at: string | null; review_interval_days: number }>
  pendingReviews: number
}

export interface LearningNotificationPreferences {
  company_id?: string
  user_id?: string
  course_id: string | null
  in_app_enabled: boolean
  email_enabled: boolean
  timezone: string
  preferred_time: string
  quiet_start: string | null
  quiet_end: string | null
}

export interface LearningDelivery {
  id: string
  kind: string
  channel: 'in_app' | 'email'
  status: 'pending' | 'processing' | 'sent' | 'failed'
  digest_date: string | null
  sent_at?: string | null
  last_error?: string | null
  created_at?: string
}

export interface TeacherDigestSchedule {
  frequency: 'daily' | 'weekly' | 'off'
  timezone: string
  localTime?: string
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  status: 'active' | 'paused'
  nextRunAt?: string
}

export interface TeacherAgentSummary {
  agentId: string
  displayName: string
  projectId: string
  courseId: string
  roomId: string
  roomStatus: 'active' | 'closed'
  digest: TeacherDigestSchedule
  pendingApprovals: number
}

export interface ApiDocument {
  id: string
  title: string
  createdBy: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

/* ============== WebSocket bridge ============== */

export type WsEvent =
  | { type: 'hello'; instanceId: string; ts: number }
  | { type: 'message.new'; conversationId: string; message: ApiMessage }
  | { type: 'message.delta'; conversationId: string; messageId: string; authorId: string; delta: string; sequence: number; done: boolean }
  | { type: 'im.read-receipt'; companyId: string; channelId: string; readerId: string; previousReadSeq: number; readThroughSeq: number; readAt: string }
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
      kind: 'personal' | 'agent_task'
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
