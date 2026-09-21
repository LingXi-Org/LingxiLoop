import type { ThreadMessage } from '@assistant-ui/react'
import { consumeRunStreamEvent, createRunView, type RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { Participant } from '@/types'
import type { AgentRunResponse, AgentRunTarget } from './harness-api'
import { harnessParts, harnessStatus, harnessToolParts, isRunMessage } from './harness'
import { getLingxiMessageMetadata as metadata, type LingxiMessageMetadata } from './model'
import { mergeCanonicalMessages, messageKey, type ConversationChatState } from './store'
import { projectRunMemory } from './memory'

export function needsRunStream(status: string | null, delivery?: string | null): boolean {
  return status === 'queued' || status === 'leased' || status === 'waiting' || delivery === 'pending'
}

/** HTTP snapshots and SSE updates share one message; committed IM order is authoritative. */
export function applyRunUpdate(
  state: ConversationChatState,
  target: AgentRunTarget,
  item: RunStreamEvent,
  participant?: Participant,
  response?: AgentRunResponse,
): ConversationChatState {
  const current = state.messages.find(message => metadata(message).runId === target.runId
    && metadata(message).senderId === target.agentId && isRunMessage(metadata(message)))
  const before = current && metadata(current)
  const view = consumeRunStreamEvent(before?.harness ?? createRunView(target.runId), item)
  const id = current?.id ?? `preview-${target.runId}`
  const startedAt = item.type === 'state' ? Date.parse(item.state.run.createdAt) : NaN
  const createdAt = before?.sequence != null || before?.positionAfter !== undefined ? current!.createdAt
    : Number.isFinite(startedAt) ? new Date(startedAt) : current?.createdAt ?? new Date()
  const positionAt = Number.isFinite(startedAt) ? new Date(startedAt) : createdAt
  const predecessor = state.messages.filter(message => message !== current && message.createdAt <= positionAt).at(-1)
  const lastSent = state.messages.filter(message => {
    const value = metadata(message)
    return value.runId === target.runId && value.senderId === target.agentId && value.messageKind === 'text'
      && !value.harness && value.sequence !== null && value.threadRootId === (target.threadId ?? null)
  }).at(-1)
  const custom: LingxiMessageMetadata = {
    schema: 'lingxiloop.thread-message.v1', conversationId: target.conversationId, clientMessageId: id,
    sequence: null,
    senderId: target.agentId, senderName: participant?.name ?? target.agentId, senderKind: 'agent',
    senderAvatarUrl: participant?.avatarUrl ?? null, isMine: false, delivery: 'sent', messageKind: 'text',
    presentation: 'conversation', quotedMessageId: target.threadId ?? null, quote: null, reactions: [], replyCount: 0,
    threadRootId: target.threadId ?? null, groupStart: true, groupEnd: true, continuedFromPrevious: false,
    continuedToNext: false, clusterChromeAt: null, ...before,
    positionAfter: before?.sequence != null ? undefined : lastSent ? messageKey(lastSent)
      : before?.positionAfter !== undefined ? before.positionAfter : predecessor ? messageKey(predecessor) : null,
    runId: target.runId, harness: view,
    memory: response?.memory
      ? response.memory.revision >= (before?.memory?.revision ?? 0) ? response.memory : before?.memory
      : projectRunMemory(target.runId, response?.events ?? (item.type === 'event' ? [item.event] : []), before?.memory),
    harnessTools: harnessToolParts(target.runId, response?.events ?? (item.type === 'event' ? [item.event] : []), before?.harnessTools),
    harnessReplaySeq: response?.nextSeq ?? view.lastSeq,
    ...(response ? { harnessControl: response.canControl, harnessError: response.run.error ?? undefined } : {}),
    ...(item.type === 'event' && item.event.kind === 'run.failed' && typeof item.event.data.error === 'string'
      ? { harnessError: item.event.data.error } : {}),
  }
  // Only previews need a time-based anchor; delivered messages retain their IM sequence.
  if (before && before.positionAfter === undefined && !Number.isFinite(startedAt) && !lastSent) delete custom.positionAfter
  const message: ThreadMessage = { id, role: 'assistant', createdAt,
    content: current?.role === 'assistant' && (view.lifecycle === 'cancelled' || view.lifecycle === 'failed' && before?.harness?.message)
      && view.resultId === before?.harness?.resultId ? current.content : harnessParts(view), status: harnessStatus(view), metadata: {
      unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], ...current?.metadata, custom,
    } }
  const activeRuns = { ...state.activeRuns }
  for (const [key, run] of Object.entries(activeRuns)) if (run.id === target.runId) delete activeRuns[key]
  if (view.lifecycle === 'queued' || view.lifecycle === 'leased') activeRuns[id] = {
    id: target.runId, agentId: target.agentId, messageId: id, lastSequence: view.lastSeq,
    state: view.lifecycle === 'queued' ? 'queued' : 'running',
  }
  const messages = current ? state.messages.map(existing => existing === current ? message : existing) : [...state.messages, message]
  return { ...state, activeRuns, messages: current && before?.positionAfter === custom.positionAfter
    ? messages : mergeCanonicalMessages([], messages) }
}
