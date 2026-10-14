import type { CoworkerActivity } from '@/features/agents/contracts'
import type {
  CanvasActivity,
  CanvasAgentAssignment,
  CanvasComment,
  CanvasFrame,
  CanvasPresence,
  CanvasSnapshot,
} from '@/features/canvas/contracts'
import type { DocumentChangedEvent } from '@/features/documents/contracts'
import type { Status } from '@/types'


export interface ApiMessage {
  id: string
  conversationId: string
  authorId: string
  kind: string
  body: string
  sequence: number
  createdAt: string
  mentionedIds?: string[]
  reactions?: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }>
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

/* ============== WebSocket bridge ============== */

export type WsEvent =
  | { type: 'hello'; instanceId: string; ts: number }
  | { type: 'message.new'; conversationId: string; message: ApiMessage }
  | { type: 'im.read-receipt'; companyId: string; channelId: string; readerId: string; previousReadSeq: number; readThroughSeq: number; readAt: string }
  | { type: 'typing'; conversationId: string; agentId: string; done: boolean }
  | { type: 'agent.activity'; conversationIds: string[]; activity: CoworkerActivity }
  | { type: 'agent.run.available'; companyId: string; conversationId: string; agentId: string; runId: string; threadId?: string }
  | { type: 'participants.status'; participantId: string; status: Status; statusUpdatedAt?: string }
  | { type: 'participants.added'; conversationId?: string; participant: {
      id: string; kind: 'human' | 'agent'; name: string; role: string | null;
      initial: string; avatarBg: string; avatarUrl: string | null;
      status: Status; statusUpdatedAt: string | null;
    } }
  | { type: 'message.reactions'; conversationId: string; messageId: string; reactions: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }> }
  | { type: 'group.pulled'; conversationId: string; pulledById: string }
  | { type: 'conversation.updated'; conversationId: string; patch: { topic?: string | null; title?: string; leaderId?: string | null } }
  | { type: 'convene'; sessionId: string; conversationId: string; kind: 'started' | 'transcript' | 'ended' | 'tile'; data?: unknown }
  | { type: 'doc.sync'; documentId: string; stateB64: string; originId: string }
  | { type: 'doc.update'; documentId: string; updateB64: string; originId: string }
  | { type: 'doc.awareness'; documentId: string; updateB64: string; originId: string }
  | { type: 'doc.error'; documentId?: string; error: string }
  | DocumentChangedEvent
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
      type: 'poll.updated'
      conversationId: string
      messageId: string
      revision: number
      poll: import('../types.js').PollPayload
      tallies: import('../types.js').PollTally[]
      actorId: string | null
    }
