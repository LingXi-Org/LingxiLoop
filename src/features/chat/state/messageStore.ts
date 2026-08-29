import { create } from 'zustand'
import type { Message } from '@/types'
import { createMessageHistoryActions } from './messageHistory'
import type { MessagesState } from './messageState'
import { selectMessagesFor } from './messageTimeline'

export const useMessages = create<MessagesState>((set, get) => ({
  byConvo: {},
  streaming: {},
  typing: {},
  loaded: new Set(),
  loading: new Set(),
  hasMoreOlder: {},
  loadingOlder: new Set(),
  firstItemIndex: {},
  errors: {},
  readReceipts: {},
  ...createMessageHistoryActions(set, get),
}))

export const messagesFor = (state: MessagesState, conversationId: string | null): Message[] => (
  selectMessagesFor(state, conversationId)
)

