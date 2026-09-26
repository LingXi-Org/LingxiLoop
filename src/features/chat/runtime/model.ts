import type { ThreadMessage, ToolCallMessagePart } from '@assistant-ui/react'
import type { RunView } from '@lyyzka/lingxios/ui'
import type { RunMemory } from './memory'

export type LingxiDeliveryStatus = 'sending' | 'sent' | 'failed'
export type LingxiMessagePresentation = 'conversation' | 'special-card'
export type HarnessToolPart = ToolCallMessagePart & { eventSeq?: number }

const SPECIAL_CARD_TOOLS = new Set([
  'approval-card',
  'poll-form',
  'agent-handoff',
  'agent-plan',
  'canvas-artifact',
  'canvas-progress',
  'elicitation-form',
  'showStats',
  'learning.propose_evaluation',
  'calendar.create',
  'calendar.list',
  'calendar.get',
  'draft-email',
  'presentation-artifact',
])

export function resolveMessagePresentation(content: readonly {
  type: string
  toolName?: string
  toolCallId?: string
}[]): LingxiMessagePresentation {
  return content.some((part) => (
    part.type === 'file'
    || part.type === 'image'
    || (part.type === 'tool-call' && (
      part.toolCallId?.startsWith('host:')
      || SPECIAL_CARD_TOOLS.has(part.toolName ?? '')
    ))
  )) ? 'special-card' : 'conversation'
}

export interface LingxiReactionMetadata {
  emoji: string
  count: number
  mine: boolean
  userIds: string[]
}

export interface LingxiQuoteMetadata {
  messageId: string
  authorId: string
  authorName: string | null
  text: string
  sequence: number | null
}

/** A receipt without a server time must not erase a known timestamp. */
export function preserveMessageTime(message: ThreadMessage, previous?: ThreadMessage): ThreadMessage {
  if (!previous || !getLingxiMessageMetadata(message).timestampMissing) return message
  return { ...message, createdAt: previous.createdAt,
    metadata: { ...message.metadata, custom: { ...message.metadata.custom,
      timestampMissing: getLingxiMessageMetadata(previous).timestampMissing } } } as ThreadMessage
}

/** Business snapshots keep their first IM anchor while newer versions replace their content. */
export function mergeProgressMessage(before: ThreadMessage, after: ThreadMessage): ThreadMessage {
  const previous = getLingxiMessageMetadata(before), next = getLingxiMessageMetadata(after)
  const newer = next.progress!.version > previous.progress!.version
    || next.progress!.version === previous.progress!.version && next.progress!.sequence > previous.progress!.sequence
  const value = newer ? after : before
  const anchor = (next.sequence ?? Infinity) < (previous.sequence ?? Infinity) ? after : before
  const anchorMetadata = getLingxiMessageMetadata(anchor)
  const time = preserveMessageTime(anchor, anchor === before ? after : before)
  return { ...value, id: anchor.id, createdAt: time.createdAt,
    metadata: { ...value.metadata, custom: { ...getLingxiMessageMetadata(value), sequence: anchorMetadata.sequence,
      timestampMissing: getLingxiMessageMetadata(time).timestampMissing,
      clientMessageId: anchorMetadata.clientMessageId } } } as ThreadMessage
}

export interface LingxiMessageMetadata extends Record<string, unknown> {
  schema: 'lingxiloop.thread-message.v1'
  conversationId: string
  clientMessageId: string
  sequence: number | null
  timestampMissing?: boolean
  progress?: { key: string; version: number; sequence: number }
  /** Keep a live reply at its original turn when its IM receipt arrives later. */
  positionAfter?: string | null
  senderId: string
  senderName: string
  senderKind: 'human' | 'agent' | 'system'
  senderAvatarUrl: string | null
  isMine: boolean
  delivery: LingxiDeliveryStatus
  messageKind: string
  presentation: LingxiMessagePresentation
  runId: string | null
  harness?: RunView
  harnessTools?: HarnessToolPart[]
  harnessControl?: boolean
  harnessReplaySeq?: number
  memory?: RunMemory
  harnessError?: string
  unresolvedActions?: Array<{ actionKey: string; action: string }>
  quotedMessageId: string | null
  quote: LingxiQuoteMetadata | null
  reactions: LingxiReactionMetadata[]
  replyCount: number
  threadRootId: string | null
  groupStart: boolean
  groupEnd: boolean
  continuedFromPrevious: boolean
  continuedToNext: boolean
  clusterChromeAt: string | null
}

export interface ConversationThreadSnapshot {
  conversationId: string
  threadRootId: string | null
  messages: readonly ThreadMessage[]
  isLoading: boolean
  isLoadingOlder: boolean
  hasMoreOlder: boolean
  isRunning: boolean
  activeAgentIds: readonly string[]
  typingAgentIds: readonly string[]
  error: string | null
}

export interface SerializableThreadMessageSnapshot {
  id: string
  role: ThreadMessage['role']
  createdAt: string
  content: ThreadMessage['content']
  status?: ThreadMessage['status']
  metadata: LingxiMessageMetadata
}

export function getLingxiMessageMetadata(message: ThreadMessage): LingxiMessageMetadata {
  const metadata = message.metadata.custom as Partial<LingxiMessageMetadata>
  if (
    metadata.schema !== 'lingxiloop.thread-message.v1'
    || (metadata.presentation !== 'conversation' && metadata.presentation !== 'special-card')
    || (metadata.clusterChromeAt !== null && typeof metadata.clusterChromeAt !== 'string')
  ) {
    throw new Error(`Message ${message.id} is not a LingxiLoop ThreadMessage`)
  }
  return metadata as LingxiMessageMetadata
}

export function serializeThreadMessage(message: ThreadMessage): SerializableThreadMessageSnapshot {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt.toISOString(),
    content: message.content,
    ...(message.status ? { status: message.status } : {}),
    metadata: getLingxiMessageMetadata(message),
  }
}

export function messageText(message: ThreadMessage): string {
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}
