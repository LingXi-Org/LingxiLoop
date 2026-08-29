import type { ImReadReceiptAdvance, Message } from '@/types'

export const MESSAGES_PAGE_SIZE = 80
export const VIRTUOSO_FIRST_INDEX_BASE = 1_000_000

export interface StreamingMessage {
  body: string
  conversationId: string
  authorId: string
  sequence: number
  mode?: 'placeholder' | 'markdown'
  runId?: string
}

export interface MessagesState {
  byConvo: Record<string, Message[]>
  streaming: Record<string, StreamingMessage>
  typing: Record<string, string[]>
  loaded: Set<string>
  loading: Set<string>
  hasMoreOlder: Record<string, boolean>
  loadingOlder: Set<string>
  firstItemIndex: Record<string, number>
  errors: Record<string, string>
  readReceipts: Record<string, ImReadReceiptAdvance[]>

  loadConversation(id: string): Promise<void>
  loadOlder(id: string): Promise<void>
  reloadConversation(id: string): Promise<void>
  retryLoad(id: string): Promise<void>
  loadReadReceipts(id: string, fromSeq: number, toSeq: number): Promise<void>
}

export type MessagesStateUpdate = Partial<MessagesState> | ((state: MessagesState) => Partial<MessagesState>)
export type SetMessagesState = (update: MessagesStateUpdate) => void
export type GetMessagesState = () => MessagesState

