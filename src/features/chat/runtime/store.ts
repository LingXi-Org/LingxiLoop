import type { ThreadMessage } from '@assistant-ui/react'
import { create } from 'zustand'
import { getLingxiMessageMetadata, mergeProgressMessage, preserveMessageTime, resolveMessagePresentation, type LingxiMessageMetadata } from './model'
import { projectMessageGroups } from './converter'
import { isRunMessage, isOlderRun } from './harness'
import { nativeText } from '@/lib/nativeMessage'
import { activityAnnotation } from '@/lib/runActivity'

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
  isRecovering?: boolean
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
      const old = before.harness, next = after.harness
      if (isOlderRun(old,next)) continue
      const sameResult = Boolean(next.resultId && old.resultId === next.resultId && old.requestVersion === next.requestVersion
        && old.fence === next.fence && old.messageFence === next.messageFence)
      const receipt = after.sequence !== null || !sameResult ? after : before
      // Failed runs keep visible prose; cancellation, supersession and new attempts still retract it.
      // shortcut: drafts survive only in this session; add durable recovery when they must survive a page reload.
      const content = next.lifecycle === 'failed' && !next.resultId
        && old.requestVersion === next.requestVersion && old.fence === next.fence && old.messageFence === next.messageFence
        && !nativeText(message)
        ? [...previous.content.filter(part => part.type === 'text' && activityAnnotation(part)?.kind !== 'commentary'), ...message.content] : message.content
      byId.set(key,{ ...message, content, metadata: { ...message.metadata, custom: { ...after,
        presentation: resolveMessagePresentation(content),
        sequence: receipt.sequence, clientMessageId: receipt.clientMessageId, imMessageId: receipt.imMessageId,
        sourceMessageId: after.sourceMessageId ?? (sameResult ? before.sourceMessageId : undefined),
        harnessControl: after.harnessControl ?? before.harnessControl } } } as ThreadMessage)
    } else byId.set(key,message)
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
    if (!isRunMessage(value)) continue
    // Sent messages use IM order; only the pending final reply needs an anchor after the latest send.
    const anchor = lastSent ? messageKey(lastSent) : typeof value.sourceRef === 'string' ? value.sourceRef : undefined
    if (anchor !== undefined) byId.set(key,patchMetadata(message,{
      positionAfter: value.sequence === null ? anchor : undefined,
    }))
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
      (message.id === messageId || metadata(message).imMessageId === messageId) ? update(message) : message
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
    content: message.content.map(part => part.type === 'data' && part.name === 'poll'
      && revision >= Number(part.data.revision ?? 0) ? { ...part, data: { poll, pollTallies: tallies, revision } } : part),
  }) as ThreadMessage)
}

export function markDelivery(
  conversationId: string,
  messageId: string,
  delivery: LingxiMessageMetadata['delivery'],
): void {
  updateConversationMessage(conversationId, messageId, (message) => patchMetadata(message, { delivery }))
}
