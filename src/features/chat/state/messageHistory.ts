import { conversationsApi } from '@/features/conversations/api'
import { lingxiIm } from '@/lib/im/wukong'
import { useApp } from '@/stores/app'
import type { Message } from '@/types'
import {
  fromImBatch,
  mergeFetchedMessages,
  mergeReadReceipts,
} from './messageProjection'
import { oldestDurableSequence, selectOlderMessages } from './messagePagination'
import {
  type GetMessagesState,
  MESSAGES_PAGE_SIZE,
  type MessagesState,
  type SetMessagesState,
  VIRTUOSO_FIRST_INDEX_BASE,
} from './messageState'

type HistoryActions = Pick<MessagesState,
  'loadConversation' | 'loadOlder' | 'reloadConversation' | 'retryLoad' | 'loadReadReceipts'>

function durableRange(messages: Message[]): { from: number; to: number } | null {
  const sequences = messages
    .map((message) => message.sequence)
    .filter((value): value is number => Number.isSafeInteger(value) && Number(value) > 0)
  return sequences.length > 0 ? { from: Math.min(...sequences), to: Math.max(...sequences) } : null
}

export function createMessageHistoryActions(
  set: SetMessagesState,
  get: GetMessagesState,
): HistoryActions {
  return {
    async loadConversation(id) {
      const state = get()
      if (state.loaded.has(id) || state.loading.has(id)) return
      set((current) => {
        const { [id]: _drop, ...errors } = current.errors
        return { loading: new Set(current.loading).add(id), errors }
      })
      try {
        const normalized = fromImBatch(await lingxiIm.history(id, MESSAGES_PAGE_SIZE))
        set((current) => ({
          byConvo: { ...current.byConvo, [id]: mergeFetchedMessages(current.byConvo[id], normalized) },
          loaded: new Set(current.loaded).add(id),
          loading: new Set([...current.loading].filter((value) => value !== id)),
          hasMoreOlder: { ...current.hasMoreOlder, [id]: normalized.length >= MESSAGES_PAGE_SIZE },
          firstItemIndex: {
            ...current.firstItemIndex,
            [id]: current.firstItemIndex[id] ?? VIRTUOSO_FIRST_INDEX_BASE,
          },
        }))
        const range = durableRange(normalized)
        if (range) void get().loadReadReceipts(id, range.from, range.to)
      } catch (error) {
        console.warn('[messages] loadConversation failed', error)
        const message = error instanceof Error ? error.message : 'Something went wrong.'
        if (/\b404\b/.test(message) || /not found/i.test(message)) {
          set((current) => ({ loading: new Set([...current.loading].filter((value) => value !== id)) }))
          if (useApp.getState().selectedConversationId === id) useApp.getState().selectConversation(null)
          return
        }
        set((current) => ({
          loading: new Set([...current.loading].filter((value) => value !== id)),
          errors: { ...current.errors, [id]: message },
        }))
      }
    },

    async reloadConversation(id) {
      try {
        const normalized = fromImBatch(await lingxiIm.history(id, MESSAGES_PAGE_SIZE))
        const hasMore = normalized.length >= MESSAGES_PAGE_SIZE
        set((current) => ({
          byConvo: { ...current.byConvo, [id]: mergeFetchedMessages(current.byConvo[id], normalized) },
          loaded: new Set(current.loaded).add(id),
          hasMoreOlder: { ...current.hasMoreOlder, [id]: current.hasMoreOlder[id] ?? hasMore },
        }))
        const range = durableRange(normalized)
        if (range) void get().loadReadReceipts(id, range.from, range.to)
      } catch (error) {
        console.warn('[messages] reload failed', error)
      }
    },

    async loadOlder(id) {
      const state = get()
      if (!state.loaded.has(id) || state.hasMoreOlder[id] === false || state.loadingOlder.has(id)) return
      const existing = state.byConvo[id] ?? []
      const oldest = oldestDurableSequence(existing)
      if (oldest === null || oldest <= 1) {
        set((current) => ({ hasMoreOlder: { ...current.hasMoreOlder, [id]: false } }))
        return
      }

      set((current) => ({ loadingOlder: new Set(current.loadingOlder).add(id) }))
      try {
        const normalized = fromImBatch(await lingxiIm.history(id, MESSAGES_PAGE_SIZE, oldest))
        const prepended = selectOlderMessages(existing, normalized, oldest)
        set((current) => ({
          byConvo: { ...current.byConvo, [id]: mergeFetchedMessages(current.byConvo[id], prepended) },
          loadingOlder: new Set([...current.loadingOlder].filter((value) => value !== id)),
          hasMoreOlder: {
            ...current.hasMoreOlder,
            [id]: normalized.length >= MESSAGES_PAGE_SIZE && prepended.length > 0,
          },
          firstItemIndex: {
            ...current.firstItemIndex,
            [id]: (current.firstItemIndex[id] ?? VIRTUOSO_FIRST_INDEX_BASE) - prepended.length,
          },
        }))
        const range = durableRange(prepended)
        if (range) void get().loadReadReceipts(id, range.from, range.to)
      } catch (error) {
        console.warn('[messages] loadOlder failed', error)
        set((current) => ({
          loadingOlder: new Set([...current.loadingOlder].filter((value) => value !== id)),
        }))
      }
    },

    async retryLoad(id) {
      set((current) => {
        const { [id]: _drop, ...errors } = current.errors
        return {
          loaded: new Set([...current.loaded].filter((value) => value !== id)),
          errors,
        }
      })
      await get().loadConversation(id)
    },

    async loadReadReceipts(id, fromSeq, toSeq) {
      try {
        const response = await conversationsApi.readReceipts(id, fromSeq, toSeq)
        set((current) => ({
          readReceipts: {
            ...current.readReceipts,
            [id]: mergeReadReceipts(current.readReceipts[id], response.receipts),
          },
        }))
      } catch (error) {
        console.warn('[im.read-receipt] range sync failed', error)
      }
    },
  }
}
