import type { ThreadMessage } from '@assistant-ui/react'

export type LingxiDeliveryStatus = 'sending' | 'sent' | 'failed'

export interface LingxiReactionMetadata {
  emoji: string
  count: number
  mine: boolean
  userIds: string[]
}

export interface LingxiReceiptMetadata {
  readerId: string
  readThroughSequence: number
  readAt: string
}

export interface LingxiQuoteMetadata {
  messageId: string
  authorId: string
  authorName: string | null
  text: string
  sequence: number | null
}

export interface LingxiMessageMetadata extends Record<string, unknown> {
  schema: 'lingxiloop.thread-message.v1'
  conversationId: string
  clientMessageId: string
  sequence: number | null
  senderId: string
  senderName: string
  senderKind: 'human' | 'agent' | 'system'
  senderAvatarUrl: string | null
  isMine: boolean
  delivery: LingxiDeliveryStatus
  messageKind: string
  runId: string | null
  quotedMessageId: string | null
  quote: LingxiQuoteMetadata | null
  reactions: LingxiReactionMetadata[]
  receipts: LingxiReceiptMetadata[]
  replyCount: number
  threadRootId: string | null
  groupStart: boolean
  groupEnd: boolean
  continuedFromPrevious: boolean
  continuedToNext: boolean
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
  if (metadata.schema !== 'lingxiloop.thread-message.v1') {
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
    .filter((part): part is Extract<(typeof message.content)[number], { type: 'text' | 'reasoning' }> => (
      part.type === 'text' || part.type === 'reasoning'
    ))
    .map((part) => part.text)
    .join('\n')
}
