import { serializeMessage, type NativeMessage } from '@/lib/nativeMessage'
import type { ThreadMessage } from '@assistant-ui/react'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import type { RunMemory } from '@/lib/agentRunSnapshot'
export type { HarnessToolPart } from '@/lib/agentRunSnapshot'

export type LingxiDeliveryStatus = 'sending' | 'sent' | 'failed'
export type LingxiMessagePresentation = 'conversation' | 'special-card'

export function resolveMessagePresentation(content: readonly { type: string }[]): LingxiMessagePresentation {
  return content.some(part => ['file','image','tool-call','data','generative-ui'].includes(part.type)) ? 'special-card' : 'conversation'
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
  schema: 'lingxiloop.thread-message.v2'
  conversationId: string
  clientMessageId: string
  imMessageId?: string
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
  harness?: RunDisplayState
  harnessControl?: boolean
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

export type SerializableThreadMessageSnapshot = NativeMessage

export function getLingxiMessageMetadata(message: ThreadMessage): LingxiMessageMetadata {
  const metadata = message.metadata.custom as Partial<LingxiMessageMetadata>
  if (
    metadata.schema !== 'lingxiloop.thread-message.v2'
    || (metadata.presentation !== 'conversation' && metadata.presentation !== 'special-card')
    || (metadata.clusterChromeAt !== null && typeof metadata.clusterChromeAt !== 'string')
  ) {
    throw new Error(`Message ${message.id} is not a LingxiLoop ThreadMessage`)
  }
  return metadata as LingxiMessageMetadata
}

export function serializeThreadMessage(message: ThreadMessage): SerializableThreadMessageSnapshot {
  return serializeMessage(message)
}

export function messageText(message: ThreadMessage): string {
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}
