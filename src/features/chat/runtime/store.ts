import type { ThreadMessage } from '@assistant-ui/react'
import { create } from 'zustand'
import { getLingxiMessageMetadata, mergeProgressMessage, preserveMessageTime, type LingxiMessageMetadata } from './model'
import { projectMessageGroups } from './converter'
import { harnessParts, harnessStatus, isRunMessage, mergeHarness } from './harness'

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

function runKey(value: LingxiMessageMetadata): string {
  return JSON.stringify(['run',value.conversationId,value.senderId,value.runId,value.threadRootId])
}

export function messageKey(message: ThreadMessage): string {
  const value = metadata(message)
  return value.progress ? JSON.stringify(['progress',value.conversationId,value.progress.key])
    : isRunMessage(value) ? runKey(value) : value.clientMessageId || message.id
}

export function mergeCanonicalMessages(
  current: readonly ThreadMessage[],
  incoming: readonly ThreadMessage[],
): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>()
  for (const message of [...current, ...incoming]) {
    const key = messageKey(message), previous = byId.get(key)
    const before = previous && metadata(previous), after = metadata(message)
    if (previous && before?.progress && after.progress) {
      byId.set(key,mergeProgressMessage(previous,message))
    } else if (previous && before?.harness && after.harness && message.role === 'assistant') {
      const harness = mergeHarness(before.harness,after.harness)
      const canonical = harness.resultId === before.harness.resultId && before.sequence !== null ? previous : message
      byId.set(key,{ ...canonical, status: harnessStatus(harness),
        content: (harness.lifecycle === 'cancelled' || harness.lifecycle === 'failed')
          && harness.resultId === before.harness.resultId ? previous.content
          : harness.message ? harnessParts(harness) : message.content,
        metadata: { ...canonical.metadata, custom: { ...before,...metadata(canonical), harness,
          harnessTools: after.harnessTools ?? before.harnessTools,
          memory: after.memory ?? before.memory,
          harnessControl: after.harnessControl ?? before.harnessControl,
          harnessError: after.harnessError ?? before.harnessError,
          unresolvedActions: after.unresolvedActions ?? before.unresolvedActions } } } as ThreadMessage)
    } else if (!before?.harness || after.harness) byId.set(key,message)
    const merged = byId.get(key)
    if (merged) byId.set(key, preserveMessageTime(preserveMessageTime(merged, previous), message))
  }
  for (const message of current) {
    const key = messageKey(message), next = byId.get(key)
    if (next && metadata(next).sequence === null && metadata(message).positionAfter !== undefined) {
      const time = metadata(message).timestampMissing ? next : message
      byId.set(key, { ...patchMetadata(next, { positionAfter: metadata(message).positionAfter,
        timestampMissing: metadata(time).timestampMissing }), createdAt: time.createdAt })
    } else if (next && metadata(next).sequence !== null && metadata(next).positionAfter !== undefined) {
      byId.set(key, patchMetadata(next, { positionAfter: undefined }))
    }
  }
  const lastSentByRun = new Map<string, ThreadMessage>()
  for (const message of byId.values()) {
    const value = metadata(message)
    if (value.senderKind !== 'agent' || value.messageKind !== 'text' || !value.runId || value.harness || value.sequence === null) continue
    const previous = lastSentByRun.get(runKey(value))
    if (!previous || value.sequence > metadata(previous).sequence!) lastSentByRun.set(runKey(value),message)
  }
  for (const [key,message] of byId) {
    const value = metadata(message), lastSent = lastSentByRun.get(runKey(value))
    if (!isRunMessage(value) || !lastSent) continue
    // Sent bubbles use IM order; only the pending final reply needs an anchor after the latest bubble.
    byId.set(key,patchMetadata(message,{ positionAfter: value.sequence === null ? messageKey(lastSent) : undefined }))
  }
  const positioned = [...byId.values()].filter(message => metadata(message).positionAfter !== undefined)
  const sorted = [...byId.values()].filter(message => metadata(message).positionAfter === undefined).sort((left, right) => {
    const leftSequence = metadata(left).sequence
    const rightSequence = metadata(right).sequence
    if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence
    if (leftSequence !== null && rightSequence === null) return -1
    if (leftSequence === null && rightSequence !== null) return 1
    return left.createdAt.getTime() - right.createdAt.getTime()
  })
  const tails = new Map<string | null, string>()
  for (const message of positioned) {
    const anchor = metadata(message).positionAfter!
    const after = tails.get(anchor) ?? anchor
    const index = after === null ? -1 : sorted.findIndex(item => messageKey(item) === after)
    const fallback = sorted.findIndex(item => item.createdAt > message.createdAt)
    sorted.splice(index >= 0 ? index + 1 : fallback < 0 ? sorted.length : fallback, 0, message)
    tails.set(anchor, messageKey(message))
  }
  return projectMessageGroups(sorted)
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
    content: message.content.map((part) => part.type === 'tool-call' && part.toolName === 'poll-form'
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
