import type { ThreadMessage } from '@assistant-ui/react'
import type { Participant } from '@/types'
import type { AgentRunTarget } from './harness-api'
import type { AgentRunSnapshot, RunDisplayState } from '@/lib/agentRunSnapshot'
import { deserializeMessage } from '@/lib/nativeMessage'
import { getLingxiMessageMetadata as metadata, resolveMessagePresentation, type LingxiMessageMetadata } from './model'
import { mergeCanonicalMessages, messageKey, type ConversationChatState } from './store'
import { isOlderRun } from './harness'

export function needsRunStream(status: string | null, delivery?: string | null): boolean {
  return status === 'queued' || status === 'leased' || status === 'waiting' || delivery === 'pending'
}

export function applyRunSnapshot(state: ConversationChatState, target: AgentRunTarget, snapshot: AgentRunSnapshot, participant?: Participant): ConversationChatState {
  const native = deserializeMessage(snapshot.message)
  const view = native.metadata.custom.harness as RunDisplayState
  if (native.role !== 'assistant' || view?.runId !== target.runId || native.id !== `run-${target.runId}`) throw new Error('运行身份不一致')
  const current = state.messages.find(message => message.id === native.id), before = current && metadata(current)
  if (before?.harness && isOlderRun(before.harness,view)) return state
  const sameResult = Boolean(view.resultId && before?.harness?.resultId === view.resultId
    && before.harness.requestVersion === view.requestVersion && before.harness.fence === view.fence
    && before.harness.messageFence === view.messageFence)
  // Delivery may replace an uncommittable UI with text; SSE must not undo that canonical payload.
  const content = sameResult && before?.sequence != null && current?.role === 'assistant' ? current.content : native.content
  const predecessor = state.messages.filter(message => message !== current && message.createdAt <= native.createdAt).at(-1)
  const lastSent = state.messages.filter(message => {
    const value = metadata(message)
    return value.runId === target.runId && value.senderId === target.agentId && !value.harness && value.sequence !== null
      && value.threadRootId === (target.threadId ?? null)
  }).at(-1)
  const custom: LingxiMessageMetadata = {
    schema: 'lingxiloop.thread-message.v2', conversationId: target.conversationId, clientMessageId: native.id,
    sequence: null, senderId: target.agentId, senderName: participant?.name ?? target.agentId, senderKind: 'agent',
    senderAvatarUrl: participant?.avatarUrl ?? null, isMine: false, delivery: 'sent', messageKind: 'text',
    quotedMessageId: target.threadId ?? null, quote: null, reactions: [], replyCount: 0,
    threadRootId: target.threadId ?? null, groupStart: true, groupEnd: true, continuedFromPrevious: false,
    continuedToNext: false, clusterChromeAt: null, ...before, ...native.metadata.custom,
    presentation: resolveMessagePresentation(content),
    positionAfter: before?.sequence != null ? undefined : lastSent ? messageKey(lastSent)
      : before?.positionAfter !== undefined ? before.positionAfter : predecessor ? messageKey(predecessor) : null,
    harnessError: typeof native.metadata.custom.harnessError === 'string' ? native.metadata.custom.harnessError : undefined,
    runId: target.runId, harness: before?.harness?.delivery === 'delivered' && sameResult
      ? { ...view, delivery: 'delivered' } : view,
  }
  const message: ThreadMessage = { ...native, content, metadata: { ...native.metadata, custom } }
  const messages = mergeCanonicalMessages(state.messages,[message]), activeRuns = { ...state.activeRuns }
  for (const [key,run] of Object.entries(activeRuns)) if (run.id === target.runId) delete activeRuns[key]
  if (view.lifecycle === 'queued' || view.lifecycle === 'leased') activeRuns[native.id] = {
    id: target.runId, agentId: target.agentId, messageId: native.id, lastSequence: view.lastSeq,
    state: view.lifecycle === 'queued' ? 'queued' : 'running',
  }
  return { ...state, activeRuns, messages }
}
