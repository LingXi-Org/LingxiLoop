import { messagesApi } from '../api'
import { notifyAction } from '@/lib/actionToast'
import type { ReactionEntry } from '@/types'
import { useMessages } from './messageStore'
import { deriveMineForReactions, mergeReactionOrder, optimisticToggleReactions } from './reactions'

function patchMessageReactions(
  messageId: string,
  updater: (reactions: ReactionEntry[] | undefined) => ReactionEntry[] | undefined,
): Map<string, ReactionEntry[] | undefined> {
  const previous = new Map<string, ReactionEntry[] | undefined>()
  useMessages.setState((state) => {
    let changed = false
    const byConvo = { ...state.byConvo }
    for (const [conversationId, messages] of Object.entries(state.byConvo)) {
      let listChanged = false
      const next = messages.map((message) => {
        if (message.id !== messageId) return message
        previous.set(conversationId, message.reactions)
        listChanged = true
        return { ...message, reactions: updater(message.reactions) }
      })
      if (listChanged) {
        byConvo[conversationId] = next
        changed = true
      }
    }
    return changed ? { byConvo } : {}
  })
  return previous
}

function restoreMessageReactions(
  messageId: string,
  previous: Map<string, ReactionEntry[] | undefined>,
): void {
  if (previous.size === 0) return
  useMessages.setState((state) => {
    const byConvo = { ...state.byConvo }
    let changed = false
    for (const [conversationId, reactions] of previous) {
      const messages = state.byConvo[conversationId]
      if (!messages) continue
      byConvo[conversationId] = messages.map((message) => message.id === messageId
        ? { ...message, reactions }
        : message)
      changed = true
    }
    return changed ? { byConvo } : {}
  })
}

export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const target = Object.entries(useMessages.getState().byConvo)
    .flatMap(([conversationId, messages]) => messages.map((message) => ({ conversationId, message })))
    .find(({ message }) => message.id === messageId)
  if (!target || !Number.isSafeInteger(target.message.sequence) || target.message.sequence <= 0) return
  const previous = patchMessageReactions(messageId, (reactions) => (
    optimisticToggleReactions(reactions, emoji)
  ))
  try {
    const response = await messagesApi.toggleReaction(target.conversationId, messageId, target.message.sequence, emoji)
    const incoming = deriveMineForReactions(response.reactions)
    patchMessageReactions(messageId, (reactions) => mergeReactionOrder(reactions, incoming))
  } catch (error) {
    restoreMessageReactions(messageId, previous)
    notifyAction({
      title: '表态更新失败',
      description: error instanceof Error ? error.message : String(error),
      type: 'error',
    })
  }
}
