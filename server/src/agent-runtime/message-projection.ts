import type { MessageStatus, ThreadAssistantMessagePart, ToolCallMessagePart } from '@assistant-ui/react'
import { responseSegments, type RunEvent, type RunView } from '@lyyzka/lingxios/ui'
import { toolCardResult } from '../../../src/lib/agentToolCards.js'
import { researchSources } from '../../../src/lib/researchSources.js'

export type HarnessToolPart = ToolCallMessagePart & { eventSeq?: number }
export interface MarkdownConfidenceClaim {
  id: string
  text: string
  confidence: 'grounded' | 'inferred' | 'uncertain'
  basis: string
  markers: readonly string[]
  start: number
  end: number
  evidence?: readonly { marker: string; chunkId: string; title: string; excerpt: string; truncated?: boolean }[]
}

/** Display projection only: lifecycle, preview and results remain in the native RunView. */
export function harnessToolParts(runId: string, events: readonly RunEvent[], current: readonly HarnessToolPart[] = []): HarnessToolPart[] {
  const calls = new Map(current.map(part => [part.toolCallId,part]))
  for (const event of [...events].sort((a,b) => a.seq-b.seq)) {
    if (event.runId !== runId || event.visibility !== 'user') continue
    const id = event.data.toolCallId
    if (typeof id !== 'string' || !id.startsWith('host:')) continue
    if (event.kind === 'tool.started' && typeof event.data.name === 'string' && !calls.has(id)) {
      calls.set(id,{ type: 'tool-call',toolCallId: id,toolName: event.data.name,args: {},argsText: '{}',eventSeq: event.seq })
    }
    const previous = calls.get(id)
    if (event.kind === 'tool.completed' && previous && event.seq > (previous.eventSeq ?? 0) && event.data.result && typeof event.data.result === 'object') {
      const result = event.data.result, value = Reflect.get(result,'value'), cardValue = toolCardResult(previous.toolName, value)
      // Retain status and bounded search cards, never complete source text or prompts.
      calls.set(id,{ ...previous,eventSeq: event.seq,result: { status: Reflect.get(result,'status'),
        ...(cardValue === undefined ? {} : { value: cardValue }),
        ...(previous.toolName === 'research.search' ? { sources: researchSources(value) } : {}),
        ...(previous.toolName.startsWith('knowledge.') && value && typeof value === 'object' ? { sourceStatus: Reflect.get(value,'status') } : {}) },isError: event.data.isError === true,
        ...(typeof Reflect.get(result,'approvalId') === 'string' ? { approval: { id: String(Reflect.get(result,'approvalId')) } } : {}) })
    }
  }
  return [...calls.values()].slice(-256)
}
export function runMessageParts(view: RunView, tools: readonly HarnessToolPart[] = []): ThreadAssistantMessagePart[] {
  const cards = tools.map(({ eventSeq: _eventSeq, ...tool }) =>
    tool.result === undefined && (view.lifecycle === 'cancelled' || view.lifecycle === 'failed')
      ? { ...tool, result: { status: view.lifecycle }, isError: view.lifecycle === 'failed' } : tool)
  if (view.lifecycle === 'queued') return cards
  // Native drafts expose content deltas only; provider reasoning fields are excluded upstream.
  if (view.lifecycle === 'leased' && view.draft) return [{ type: 'text', text: view.draft }, ...cards]
  if (!view.message) return cards
  const segments = responseSegments(view.message.envelope)
  const evidence = view.message.envelope.citationEvidence
  const parts: ThreadAssistantMessagePart[] = []
  const claims: MarkdownConfidenceClaim[] = []
  for (const segment of segments) {
    if (segment.type === 'presentation') {
      const component = segment.component
      if (component.type === 'presentation-artifact') parts.push({ type: 'data', name: component.type, data: component.fields })
      else parts.push({ type: 'generative-ui', id: component.hash, spec: { root: { component: component.type, props: component.fields } } })
    }
    else {
      const text = segment.type === 'citation'
        ? view.message.envelope.body.slice(segment.annotation.start, segment.annotation.end) : segment.text
      if (segment.type === 'citation') {
        const { annotation } = segment
        if (!annotation.sources.length || annotation.sources.some(source => !source.sourceId || !source.sourceVersion)) {
          throw new Error('Citation requires recorded source provenance')
        }
        claims.push({ id: `${view.runId}:${view.resultId}:${annotation.start}`, text: segment.text,
          confidence: 'grounded', markers: annotation.markers, start: annotation.start, end: annotation.end,
          basis: evidence === undefined
            ? annotation.sources.map(source => `${source.sourceId} · 版本 ${source.sourceVersion}${source.truncated ? ' · 来源节选' : ''}`).join('；')
            : '',
          ...(evidence === undefined ? {} : { evidence: evidence.filter(item => annotation.markers.includes(item.marker)) }) })
      }
      const previous = parts.at(-1)
      if (previous?.type === 'text') parts[parts.length - 1] = { ...previous, text: previous.text + text }
      else if (text) parts.push({ type: 'text', text })
    }
  }
  if (claims.length) parts.push({ type: 'data', name: 'citation-claims', data: { claims } })
  const sources = new Map<string, ThreadAssistantMessagePart>()
  for (const citation of view.message.envelope.citations) for (const source of citation.sources) {
    sources.set(source.sourceId, { type: 'source', sourceType: 'document', id: source.sourceId,
      title: evidence?.find(item => citation.markers.includes(item.marker))?.title ?? source.sourceId, mediaType: 'text/plain',
      providerMetadata: { lingxiloop: { sourceVersion: source.sourceVersion, chunkIds: source.chunkIds } } })
  }
  return [...parts, ...sources.values(), ...cards]

}

export function runMessageStatus(view: RunView): MessageStatus {
  if (view.lifecycle === 'queued' || view.lifecycle === 'leased') return { type: 'running' }
  if (view.lifecycle === 'cancelled') return { type: 'incomplete', reason: 'cancelled' }
  if (view.lifecycle === 'failed') return { type: 'incomplete', reason: 'error' }
  switch (view.goalOutcome?.status) {
    case 'awaiting_input': case 'awaiting_approval': case 'delegated': return { type: 'requires-action', reason: 'tool-calls' }
    case 'partial': case 'blocked': return { type: 'incomplete', reason: 'other' }
    case 'satisfied': return { type: 'complete', reason: 'stop' }
    default: return view.lifecycle === 'succeeded' ? { type: 'incomplete', reason: 'error' } : { type: 'running' }
  }
}

export interface RunMemory {
  chips: Array<{ id: string; text: string }>
  calls: Record<string, { action: string; seq: number; unavailable?: boolean }>
  revision: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Persist only display text and replay cursors, never the native memory body or sources. */
export function projectRunMemory(runId: string, events: readonly RunEvent[], current?: RunMemory): RunMemory | undefined {
  let next = current
  for (const event of events) {
    if (event.runId !== runId || event.visibility !== 'user') continue
    const id = event.data.toolCallId
    if (typeof id !== 'string' || !id.startsWith('host:')) continue
    const previous = next?.calls[id]
    if (previous && event.seq <= previous.seq) continue
    if (event.kind === 'tool.started' && ['memory.apply', 'memory.restore', 'memory.forget'].includes(String(event.data.name))) {
      next = { chips: next?.chips ?? [], revision: next?.revision ?? 0,
        calls: { ...next?.calls, [id]: { action: String(event.data.name), seq: event.seq } } }
      // ponytail: retain 256 recent calls; use a paged projection if a single run needs more concurrent writes.
      next.calls = Object.fromEntries(Object.entries(next.calls).slice(-256))
      continue
    }
    if (event.kind !== 'tool.completed' || !previous || !next) continue
    const result = record(event.data.result)
    const succeeded = event.stage === 'completed' && event.data.isError !== true && result?.status === 'completed'
    const call = { action: previous.action, seq: event.seq, unavailable: false }
    next = { ...next, calls: { ...next.calls, [id]: call } }
    if (!succeeded) continue
    next.revision = Math.max(next.revision, event.seq)
    // A confirmed forget invalidates earlier chips; it never creates a user-facing removal action.
    if (previous.action === 'memory.forget') { next.chips = []; continue }
    const value = record(result.value)
    if (!value || value.truncated === true || !Array.isArray(value.documents) || !Array.isArray(value.deleted)) {
      call.unavailable = true
      continue
    }
    const chips = new Map(next.chips.map(chip => [chip.id, chip]))
    for (const deleted of value.deleted) {
      if (typeof deleted === 'string') chips.delete(deleted)
      else call.unavailable = true
    }
    for (const raw of value.documents) {
      const document = record(raw)
      if (!document || typeof document.id !== 'string' || !document.id || typeof document.description !== 'string'
        || !document.description.trim() || document.description.length > 500) { call.unavailable = true; continue }
      if (document.status === 'active') chips.set(document.id, { id: document.id, text: document.description })
      else if (['candidate', 'retired', 'expired'].includes(String(document.status))) chips.delete(document.id)
      else call.unavailable = true
    }
    if (chips.size > 256) call.unavailable = true
    next.chips = [...chips.values()].slice(-256)
  }
  return next
}
