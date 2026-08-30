import type { ThreadMessage } from '@assistant-ui/react'
import { create } from 'zustand'
import type { ImReadReceiptAdvance } from '@/types'
import { getLingxiMessageMetadata, type LingxiMessageMetadata } from './model'
import { projectMessageGroups } from './converter'

export const CHAT_HISTORY_PAGE_SIZE = 80

export interface ActiveAgentRun {
  id: string
  agentId: string
  messageId: string
  lastSequence: number | null
  state: 'queued' | 'running' | 'complete' | 'error' | 'cancelled'
}

export interface ConversationChatState {
  messages: ThreadMessage[]
  typingAgentIds: string[]
  activeRuns: Record<string, ActiveAgentRun>
  receipts: ImReadReceiptAdvance[]
  loaded: boolean
  isLoading: boolean
  isLoadingOlder: boolean
  hasMoreOlder: boolean
  error: string | null
}

interface ChatStoreState {
  conversations: Record<string, ConversationChatState>
}

export const EMPTY_CONVERSATION_CHAT_STATE: ConversationChatState = {
  messages: [],
  typingAgentIds: [],
  activeRuns: {},
  receipts: [],
  loaded: false,
  isLoading: false,
  isLoadingOlder: false,
  hasMoreOlder: true,
  error: null,
}

function conversation(state: ChatStoreState, conversationId: string): ConversationChatState {
  return state.conversations[conversationId] ?? EMPTY_CONVERSATION_CHAT_STATE
}

function metadata(message: ThreadMessage): LingxiMessageMetadata {
  return getLingxiMessageMetadata(message)
}

function messageKey(message: ThreadMessage): string {
  return metadata(message).clientMessageId || message.id
}

export function mergeCanonicalMessages(
  current: readonly ThreadMessage[],
  incoming: readonly ThreadMessage[],
): ThreadMessage[] {
  const incomingIds = new Set(incoming.map((message) => message.id))
  const incomingClientIds = new Set(incoming.map(messageKey))
  const byId = new Map<string, ThreadMessage>()
  for (const message of current) {
    if (incomingIds.has(message.id) || incomingClientIds.has(messageKey(message))) continue
    byId.set(message.id, message)
  }
  for (const message of incoming) byId.set(message.id, message)
  return projectMessageGroups([...byId.values()].sort((left, right) => {
    const leftSequence = metadata(left).sequence
    const rightSequence = metadata(right).sequence
    if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence
    if (leftSequence !== null && rightSequence === null) return -1
    if (leftSequence === null && rightSequence !== null) return 1
    return left.createdAt.getTime() - right.createdAt.getTime()
  }))
}

function patchMetadata(
  message: ThreadMessage,
  patch: Partial<LingxiMessageMetadata>,
): ThreadMessage {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      custom: { ...metadata(message), ...patch },
    },
  } as ThreadMessage
}

export const useChatThreadStore = create<ChatStoreState>(() => ({ conversations: {} }))

export function resetChatThreadStore(): void {
  useChatThreadStore.setState({ conversations: {} })
}

export function updateConversation(
  conversationId: string,
  update: (current: ConversationChatState) => ConversationChatState,
): void {
  useChatThreadStore.setState((state) => ({
    conversations: {
      ...state.conversations,
      [conversationId]: update(conversation(state, conversationId)),
    },
  }))
}

export function setConversationMessages(
  conversationId: string,
  incoming: readonly ThreadMessage[],
  mode: 'merge' | 'replace' = 'merge',
): void {
  updateConversation(conversationId, (current) => ({
    ...current,
    messages: mode === 'replace'
      ? projectMessageGroups([...incoming])
      : mergeCanonicalMessages(current.messages, incoming),
  }))
}

export function removeConversationMessage(conversationId: string, messageId: string): void {
  updateConversation(conversationId, (current) => ({
    ...current,
    messages: projectMessageGroups(current.messages.filter((message) => message.id !== messageId)),
  }))
}

export function updateConversationMessage(
  conversationId: string,
  messageId: string,
  update: (message: ThreadMessage) => ThreadMessage,
): void {
  updateConversation(conversationId, (current) => ({
    ...current,
    messages: projectMessageGroups(current.messages.map((message) => (
      message.id === messageId ? update(message) : message
    ))),
  }))
}

export function setTypingAgent(conversationId: string, agentId: string, typing: boolean): void {
  updateConversation(conversationId, (current) => ({
    ...current,
    typingAgentIds: typing
      ? [...current.typingAgentIds.filter((id) => id !== agentId), agentId]
      : current.typingAgentIds.filter((id) => id !== agentId),
  }))
}

export function mergeConversationReceipts(
  conversationId: string,
  receipts: readonly ImReadReceiptAdvance[],
): void {
  updateConversation(conversationId, (current) => {
    const byKey = new Map<string, ImReadReceiptAdvance>()
    for (const receipt of [...current.receipts, ...receipts]) {
      byKey.set(`${receipt.readerId}:${receipt.readThroughSeq}`, receipt)
    }
    const merged = [...byKey.values()].sort((left, right) => left.readAt.localeCompare(right.readAt))
    return {
      ...current,
      receipts: merged,
      messages: current.messages.map((message) => {
        const sequence = metadata(message).sequence
        if (sequence === null) return message
        return patchMetadata(message, {
          receipts: merged
            .filter((receipt) => receipt.readThroughSeq >= sequence)
            .map((receipt) => ({
              readerId: receipt.readerId,
              readThroughSequence: receipt.readThroughSeq,
              readAt: receipt.readAt,
            })),
        })
      }),
    }
  })
}

export function replaceMessageReactions(
  conversationId: string,
  messageId: string,
  rows: Array<{ emoji: string; count: number; mine?: boolean; users?: string[] }>,
): void {
  updateConversationMessage(conversationId, messageId, (message) => patchMetadata(message, {
    reactions: rows
      .filter((reaction) => reaction.count > 0)
      .map((reaction) => ({
        emoji: reaction.emoji,
        count: reaction.count,
        mine: reaction.mine === true,
        userIds: reaction.users ?? [],
      })),
  }))
}

export function replacePollData(
  conversationId: string,
  messageId: string,
  revision: number,
  poll: unknown,
  tallies: unknown,
): void {
  updateConversationMessage(conversationId, messageId, (message) => ({
    ...message,
    content: message.content.map((part) => part.type === 'tool-call' && part.toolName === 'option-list'
      ? updatePollPart(part, poll, tallies, revision)
      : part),
  }) as ThreadMessage)
}

function updatePollPart(
  part: Extract<ThreadMessage['content'][number], { type: 'tool-call' }>,
  pollValue: unknown,
  talliesValue: unknown,
  revision: number,
) {
  const poll = typeof pollValue === 'object' && pollValue !== null ? pollValue as Record<string, unknown> : {}
  const tallies = Array.isArray(talliesValue) ? talliesValue : []
  const counts = new Map(tallies.map((value) => {
    const tally = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
    return [String(tally.optionId ?? ''), typeof tally.count === 'number' ? tally.count : 0] as const
  }))
  const previous = part.args as Record<string, unknown>
  const options = Array.isArray(poll.options) ? poll.options.map((value, index) => {
    const option = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
    const id = String(option.id ?? index)
    return { id, label: String(option.text ?? option.label ?? `选项 ${index + 1}`), description: `${counts.get(id) ?? 0} 票` }
  }) : previous.options
  const args = {
    ...previous,
    title: typeof poll.question === 'string' ? poll.question : previous.title,
    selectionMode: poll.mode === 'multi' ? 'multi' : 'single',
    options,
    tallies,
    closedAt: typeof poll.closedAt === 'string' ? poll.closedAt : null,
    revision,
  }
  return { ...part, args, argsText: JSON.stringify(args) }
}

export function markDelivery(
  conversationId: string,
  messageId: string,
  delivery: LingxiMessageMetadata['delivery'],
): void {
  updateConversationMessage(conversationId, messageId, (message) => patchMetadata(message, { delivery }))
}
