import { conversationsApi } from '@/features/conversations/api'
import { useApp } from '@/stores/app'
import { mergeReadReceipts } from './messageProjection'
import { useMessages } from './messageStore'

const activeReadTimers = new Map<string, number>()
const pendingVisibleReadSeq = new Map<string, number>()

export function markMessagesVisibleThrough(conversationId: string, readThroughSeq: number): void {
  if (!Number.isSafeInteger(readThroughSeq) || readThroughSeq <= 0) return
  if (typeof document !== 'undefined' && (document.visibilityState !== 'visible' || !document.hasFocus())) return
  pendingVisibleReadSeq.set(
    conversationId,
    Math.max(pendingVisibleReadSeq.get(conversationId) ?? 0, readThroughSeq),
  )
  const current = activeReadTimers.get(conversationId)
  if (current !== undefined) window.clearTimeout(current)
  activeReadTimers.set(conversationId, window.setTimeout(() => {
    activeReadTimers.delete(conversationId)
    if (useApp.getState().selectedConversationId !== conversationId) return
    const sequence = pendingVisibleReadSeq.get(conversationId)
    pendingVisibleReadSeq.delete(conversationId)
    if (!sequence) return
    void conversationsApi.markRead(conversationId, sequence)
      .then((response) => {
        if (response.receipt) {
          useMessages.setState((state) => ({
            readReceipts: {
              ...state.readReceipts,
              [conversationId]: mergeReadReceipts(
                state.readReceipts[conversationId],
                [response.receipt!],
              ),
            },
          }))
        }
        return import('@/features/conversations/store')
      })
      .then(({ useConversations }) => useConversations.getState().reload())
      .catch((error) => console.warn('[im.read-receipt] visible advance failed', error))
  }, 1_000))
}

export function resetReadReceiptTimers(): void {
  for (const timer of activeReadTimers.values()) window.clearTimeout(timer)
  activeReadTimers.clear()
  pendingVisibleReadSeq.clear()
}

