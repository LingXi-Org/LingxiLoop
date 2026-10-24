import type { ThreadMessage } from '@assistant-ui/react'
import type { Participant } from '@/types'
import type { ReplyBranchSelection } from '@/stores/conversationUi'
import type { LingxiMessageMetadata } from './model'
import { projectReplyBranches } from './reply-branches'

/** Share one derivation across Provider/page subscribers without retaining unloaded histories. */
export function createThreadProjector(filter: (messages: readonly ThreadMessage[], threadRootId: string | null) => ThreadMessage[]) {
  type Entry = { participants: Record<string, Participant>; selections: Record<string, ReplyBranchSelection>; messages: ThreadMessage[]; threads: Map<string | null, ThreadMessage[]> }
  const histories = new WeakMap<readonly ThreadMessage[], Entry>()
  const enriched = new WeakMap<ThreadMessage, { participant: Participant; message: ThreadMessage }>()
  return (history: readonly ThreadMessage[], participants: Record<string, Participant>, selections: Record<string, ReplyBranchSelection>, threadRootId: string | null) => {
    let entry = histories.get(history)
    if (!entry || entry.participants !== participants || entry.selections !== selections) {
      const messages = history.map(message => {
        const metadata = message.metadata.custom as LingxiMessageMetadata
        if (message.role === 'system' || metadata.senderKind === 'system') return message
        const participant = participants[metadata.senderId]
        if (!participant || (participant.name === metadata.senderName && participant.kind === metadata.senderKind
          && (participant.avatarUrl ?? null) === metadata.senderAvatarUrl)) return message
        const cached = enriched.get(message)
        if (cached?.participant === participant) return cached.message
        const value = { ...message, metadata: { ...message.metadata, custom: { ...metadata,
          senderName: participant.name, senderKind: participant.kind, senderAvatarUrl: participant.avatarUrl ?? null,
        } } } as ThreadMessage
        enriched.set(message, { participant, message: value })
        return value
      })
      entry = { participants, selections, messages: projectReplyBranches(messages, selections), threads: new Map() }
      histories.set(history, entry)
    }
    let result = entry.threads.get(threadRootId)
    if (!result) {
      result = filter(entry.messages, threadRootId)
      // A caller may traverse many thread IDs while the loaded history stays fixed.
      if (entry.threads.size >= 32) entry.threads.delete(entry.threads.keys().next().value!)
      entry.threads.set(threadRootId, result)
    }
    return result
  }
}
