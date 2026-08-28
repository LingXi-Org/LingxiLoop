import type { WsEvent } from '@/api/contracts'
import {
  ACTIVE_STREAM_EXPIRY_MS,
  isStreamSupersededByCommitted,
  shouldApplyStreamEvent,
  streamExpiryForOpen,
} from '@/lib/chatMessages'
import type { ImEnvelope, ImStreamEvent } from '@/lib/im/wukong'
import { forgetOutbox } from './outbox'
import { fromIm, mergeFetchedMessages, mergeReadReceipts } from './messageProjection'
import { useMessages } from './messageStore'
import { deriveMineForReactions, mergeReactionOrder } from './reactions'

const TYPING_STALE_MS = 45_000
const STREAM_EVENT_SEQUENCE_LIMIT = 2_000
const typingExpiryTimers = new Map<string, number>()
const streamingExpiryTimers = new Map<string, number>()
const streamEventSequences = new Map<string, number>()

function typingKey(conversationId: string, agentId: string): string {
  return `${conversationId}:${agentId}`
}

function withoutTypingAgent(
  typing: Record<string, string[]>,
  conversationId: string,
  agentId: string,
): Record<string, string[]> {
  const current = typing[conversationId]
  if (!current?.includes(agentId)) return typing
  const next = current.filter((id) => id !== agentId)
  if (next.length > 0) return { ...typing, [conversationId]: next }
  const { [conversationId]: _drop, ...rest } = typing
  return rest
}

function withTypingAgent(
  typing: Record<string, string[]>,
  conversationId: string,
  agentId: string,
): Record<string, string[]> {
  const current = typing[conversationId] ?? []
  return { ...typing, [conversationId]: [...current.filter((id) => id !== agentId), agentId] }
}

function clearTypingExpiry(conversationId: string, agentId: string): void {
  const key = typingKey(conversationId, agentId)
  const timer = typingExpiryTimers.get(key)
  if (timer !== undefined) window.clearTimeout(timer)
  typingExpiryTimers.delete(key)
}

function scheduleTypingExpiry(conversationId: string, agentId: string): void {
  clearTypingExpiry(conversationId, agentId)
  const timer = window.setTimeout(() => {
    typingExpiryTimers.delete(typingKey(conversationId, agentId))
    useMessages.setState((state) => ({
      typing: withoutTypingAgent(state.typing, conversationId, agentId),
    }))
  }, TYPING_STALE_MS)
  typingExpiryTimers.set(typingKey(conversationId, agentId), timer)
}

function acceptStreamEvent(messageId: string, sequence: number | undefined): boolean {
  if (!shouldApplyStreamEvent(streamEventSequences.get(messageId), sequence)) return false
  if (sequence !== undefined) {
    streamEventSequences.delete(messageId)
    streamEventSequences.set(messageId, sequence)
    if (streamEventSequences.size > STREAM_EVENT_SEQUENCE_LIMIT) {
      const oldest = streamEventSequences.keys().next().value
      if (oldest !== undefined) streamEventSequences.delete(oldest)
    }
  }
  return true
}

function clearStreamingExpiry(messageId: string): void {
  const timer = streamingExpiryTimers.get(messageId)
  if (timer !== undefined) window.clearTimeout(timer)
  streamingExpiryTimers.delete(messageId)
}

function scheduleStreamingExpiry(
  messageId: string,
  conversationId: string,
  timeoutMs = ACTIVE_STREAM_EXPIRY_MS,
): void {
  clearStreamingExpiry(messageId)
  const timer = window.setTimeout(() => {
    streamingExpiryTimers.delete(messageId)
    useMessages.setState((state) => {
      const { [messageId]: _drop, ...streaming } = state.streaming
      return { streaming }
    })
    void useMessages.getState().reloadConversation(conversationId)
  }, timeoutMs)
  streamingExpiryTimers.set(messageId, timer)
}

export function clearTransientMessageState(): void {
  for (const timer of typingExpiryTimers.values()) window.clearTimeout(timer)
  for (const timer of streamingExpiryTimers.values()) window.clearTimeout(timer)
  typingExpiryTimers.clear()
  streamingExpiryTimers.clear()
}

export function resetMessageReconciliation(): void {
  clearTransientMessageState()
  streamEventSequences.clear()
}

export function reconcileCommittedMessage(envelope: ImEnvelope): void {
  const message = fromIm(envelope)
  forgetOutbox(envelope.clientMsgNo)
  clearTypingExpiry(message.conversationId, message.authorId)
  useMessages.setState((state) => {
    const streaming = Object.fromEntries(Object.entries(state.streaming).filter(([id, entry]) => {
      const matches = isStreamSupersededByCommitted(id, entry, message)
      if (matches) clearStreamingExpiry(id)
      return !matches
    }))
    return {
      streaming,
      typing: withoutTypingAgent(state.typing, message.conversationId, message.authorId),
      byConvo: {
        ...state.byConvo,
        [message.conversationId]: mergeFetchedMessages(state.byConvo[message.conversationId], [message]),
      },
    }
  })
}

export function applyImStreamEvent(event: ImStreamEvent): void {
  const id = event.clientMsgNo
  if (!acceptStreamEvent(id, event.streamSeq)) return
  if (event.type === 'stream.open') {
    useMessages.setState((state) => ({
      streaming: {
        ...state.streaming,
        [id]: {
          body: event.text ?? '',
          conversationId: event.channelId,
          authorId: event.fromUid,
          sequence: Number.MAX_SAFE_INTEGER - 10,
          mode: 'placeholder',
          runId: id.startsWith('preview-') ? id.slice('preview-'.length) : undefined,
        },
      },
    }))
    scheduleStreamingExpiry(id, event.channelId, streamExpiryForOpen(event.queued === true))
    return
  }
  if (event.type === 'stream.delta') {
    useMessages.setState((state) => {
      const current = state.streaming[id] ?? {
        body: '',
        conversationId: event.channelId,
        authorId: event.fromUid,
        sequence: Number.MAX_SAFE_INTEGER - 10,
      }
      return {
        streaming: {
          ...state.streaming,
          [id]: { ...current, body: current.body + (event.delta ?? ''), mode: 'markdown' },
        },
      }
    })
    scheduleStreamingExpiry(id, event.channelId)
    return
  }
  clearStreamingExpiry(id)
  useMessages.setState((state) => {
    const { [id]: _drop, ...streaming } = state.streaming
    return { streaming }
  })
}

export function applyWorkspaceMessageEvent(event: WsEvent): void {
  if (event.type === 'im.read-receipt') {
    useMessages.setState((state) => ({
      readReceipts: {
        ...state.readReceipts,
        [event.channelId]: mergeReadReceipts(state.readReceipts[event.channelId], [event]),
      },
    }))
    return
  }
  if (event.type === 'typing') {
    if (event.done) clearTypingExpiry(event.conversationId, event.agentId)
    else scheduleTypingExpiry(event.conversationId, event.agentId)
    useMessages.setState((state) => ({
      typing: event.done
        ? withoutTypingAgent(state.typing, event.conversationId, event.agentId)
        : withTypingAgent(state.typing, event.conversationId, event.agentId),
    }))
    return
  }
  if (event.type === 'message.reactions') {
    useMessages.setState((state) => {
      const messages = state.byConvo[event.conversationId]
      if (!messages) return {}
      const incoming = deriveMineForReactions(event.reactions)
      return {
        byConvo: {
          ...state.byConvo,
          [event.conversationId]: messages.map((message) => message.id === event.messageId
            ? { ...message, reactions: mergeReactionOrder(message.reactions, incoming) }
            : message),
        },
      }
    })
    return
  }
  if (event.type === 'poll.updated') {
    useMessages.setState((state) => {
      const messages = state.byConvo[event.conversationId]
      if (!messages) return {}
      return {
        byConvo: {
          ...state.byConvo,
          [event.conversationId]: messages.map((message) => message.id === event.messageId
            && event.revision >= (message.pollRevision ?? 0)
            ? {
                ...message,
                poll: event.poll,
                pollTallies: event.tallies,
                pollRevision: event.revision,
              }
            : message),
        },
      }
    })
  }
}
