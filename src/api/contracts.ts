import type {
  Message,
  Status,
} from '@/types'
import type {
  CanvasActivity,
  CanvasAgentAssignment,
  CanvasComment,
  CanvasFrame,
  CanvasPresence,
  CanvasSnapshot,
} from '@/features/canvas/contracts'
import type { DocumentChangedEvent } from '@/features/documents/contracts'


export interface ApiMessage extends Message {
  sequence: number
  createdAt: string
  reactions?: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }>
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
  | DocumentChangedEvent
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
      assignment?: CanvasAgentAssignment
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
