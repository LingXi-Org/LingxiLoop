import type { ThreadMessage } from '@assistant-ui/react'
import type { AgentRunSnapshot, RunDisplayState } from '@/lib/agentRunSnapshot'
import { decodeNativeMessage, deserializeMessage, nativeText } from '@/lib/nativeMessage'
import type { AgentRunTarget } from './harness-api'
import { appendedContent, sameValue } from './text-update'

// Only locally decoded snapshot identities are cached. HTTP/history values and
// lookalike objects always cross the external parser; wire metadata cannot mark trust.
const displays = new WeakMap<AgentRunSnapshot, ThreadMessage>()
export function decodeRunSnapshot(value: AgentRunSnapshot, target: AgentRunTarget): AgentRunSnapshot {
  const { message, display } = decodeNativeMessage(value?.message)
  const view = message.metadata.custom.harness as RunDisplayState
  if (message.role !== 'assistant' || message.id !== `run-${target.runId}` || message.metadata.custom.runId !== target.runId || view?.runId !== target.runId
    || ![view.requestVersion, view.fence, view.messageFence, view.lastSeq].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('运行流消息身份或内容不正确')
  const snapshot = Object.freeze({ message })
  displays.set(snapshot, display)
  return snapshot
}
export function snapshotDisplay(snapshot: AgentRunSnapshot): ThreadMessage {
  return displays.get(snapshot) ?? deserializeMessage(snapshot.message)
}

function textAppend(previous: AgentRunSnapshot, next: AgentRunSnapshot): boolean {
  const before = previous.message, after = next.message
  const oldView = before.metadata.custom.harness as RunDisplayState, newView = after.metadata.custom.harness as RunDisplayState
  return before.role === 'assistant' && after.role === 'assistant' && before.status.type === 'running' && after.status.type === 'running'
    && before.id === after.id && before.createdAt === after.createdAt && oldView.lifecycle === 'leased'
    && newView.lastSeq >= oldView.lastSeq && !oldView.resultId && !newView.resultId
    && sameValue(before.metadata, { ...after.metadata, custom: { ...after.metadata.custom, harness: { ...newView, lastSeq: oldView.lastSeq } } })
    && appendedContent(snapshotDisplay(previous).content, snapshotDisplay(next).content) !== undefined
    // The first useful body is never held behind the publication clock.
    && Boolean(nativeText(before))
}

type Schedule = (publish: () => void) => () => void
const schedule: Schedule = publish => {
  if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    const id = requestAnimationFrame(publish)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(publish, typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 250 : 16)
  return () => clearTimeout(id)
}

/** Accumulation/validation stays per event. Only validated text publications coalesce. */
export function createSnapshotPublisher(receive: (snapshot: AgentRunSnapshot) => void, signal: AbortSignal,
  onError: (error: unknown) => void, clock: Schedule = schedule) {
  let previous: AgentRunSnapshot | undefined, pending: AgentRunSnapshot | undefined, cancel: (() => void) | undefined
  let disposed = false, generation = 0
  const clear = () => { generation++; cancel?.(); cancel = undefined }
  const flush = () => {
    clear()
    const value = pending; pending = undefined
    if (value && !disposed && !signal.aborted) receive(value)
  }
  const publish = () => { try { flush() } catch (error) { onError(error) } }
  const scheduleNext = () => {
    const scheduled = ++generation
    cancel = clock(() => { if (scheduled === generation) publish() })
  }
  const visible = () => {
    if (document.visibilityState === 'visible') publish()
    else if (pending) { clear(); scheduleNext() }
  }
  const dispose = () => {
    disposed = true; clear(); pending = previous = undefined
    signal.removeEventListener('abort', dispose)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible)
  }
  signal.addEventListener('abort', dispose, { once: true })
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible)
  return {
    push(snapshot: AgentRunSnapshot) {
      if (disposed || signal.aborted) return
      const batch = previous && textAppend(previous, snapshot)
      previous = snapshot
      if (!batch) { flush(); if (!signal.aborted) receive(snapshot); return }
      pending = snapshot
      if (!cancel) scheduleNext()
    }, flush, dispose,
  }
}
