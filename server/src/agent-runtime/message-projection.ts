import type { MessageStatus, ThreadAssistantMessagePart, ToolCallMessagePart } from '@assistant-ui/react'
import { responseSegments, type RunEvent, type RunView } from '@lyyzka/lingxios/ui'
import { toolCardResult } from '../../../src/lib/agentToolCards.js'
import { researchSources } from '../../../src/lib/researchSources.js'
import { assertLessonCitationSpans, projectLessonText } from './interactive-ui-projection.js'
import { publicActivitySchema, toolDisplay, type ActivityAnnotation, type ToolDisplay } from '../../../src/lib/runActivity.js'

export type HarnessToolPart = ToolCallMessagePart & { eventSeq?: number; startedSeq?: number; display?: ToolDisplay }
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
  const calls = new Map(current.filter(part => !/^memory(?:\.|__)/.test(part.toolName)).map(part => [part.toolCallId,part]))
  for (const event of [...events].sort((a,b) => a.seq-b.seq)) {
    if (event.runId !== runId || event.visibility !== 'user') continue
    const id = event.data.toolCallId
    if (typeof id !== 'string' || !id.startsWith('host:')) continue
    if (event.kind === 'tool.started' && typeof event.data.name === 'string' && !calls.has(id)) {
      if (/^memory(?:\.|__)/.test(event.data.name)) continue
      calls.set(id,{ type: 'tool-call',toolCallId: id,toolName: event.data.name,args: {},argsText: '{}',eventSeq: event.seq,startedSeq: event.seq })
    }
    const previous = calls.get(id)
    if (event.kind === 'tool.completed' && previous && event.seq > (previous.eventSeq ?? 0) && event.data.result && typeof event.data.result === 'object') {
      const result = event.data.result, value = Reflect.get(result,'value')
      // Retain status and bounded search cards, never complete source text or prompts.
      calls.set(id,{ ...previous,eventSeq: event.seq,result: { status: Reflect.get(result,'status'),
        ...(toolCardResult(previous.toolName, value) ? { value: toolCardResult(previous.toolName, value) } : {}),
        ...(previous.toolName === 'research.search' ? { sources: researchSources(value) } : {}),
        ...(previous.toolName.startsWith('knowledge.') && value && typeof value === 'object' ? { sourceStatus: Reflect.get(value,'status') } : {}),
        ...(previous.toolName === 'chat.report_progress' && publicActivitySchema.safeParse(value).success ? { activity: publicActivitySchema.parse(value) } : {}),
      },isError: event.data.isError === true,
        ...(typeof Reflect.get(result,'approvalId') === 'string' ? { approval: { id: String(Reflect.get(result,'approvalId')) } } : {}) })
    }
  }
  return [...calls.values()].sort((a, b) => (a.startedSeq ?? a.eventSeq ?? 0) - (b.startedSeq ?? b.eventSeq ?? 0))
}
function annotated<T extends ThreadAssistantMessagePart>(part: T, annotation: Omit<ActivityAnnotation, 'version'>): T {
  return { ...part, providerMetadata: { ...('providerMetadata' in part ? part.providerMetadata : {}),
    lingxiloop: { activity: { version: 1, ...annotation } } } }
}
function activityParts(view: RunView, tools: readonly HarnessToolPart[]): ThreadAssistantMessagePart[] {
  const parts = new Map<string, ThreadAssistantMessagePart>()
  for (const { eventSeq: _eventSeq, startedSeq: _startedSeq, display: recordedDisplay, ...tool } of tools) {
    const result = tool.result && typeof tool.result === 'object' ? tool.result : undefined
    const explanation = publicActivitySchema.safeParse(result && Reflect.get(result, 'activity'))
    if (tool.toolName === 'chat.report_progress' && explanation.success) {
      const entry = explanation.data, id = `public:${entry.id}`
      if (entry.kind === 'plan' && entry.plan) {
        parts.set(id, annotated({ type: 'generative-ui', id, spec: { root: { component: 'agent-plan', props: { title: entry.label, ...entry.plan } } } },
          { id, kind: 'commentary', label: entry.label }))
        continue
      }
      const status = entry.state === 'complete' ? { type: 'complete' as const }
        : view.lifecycle === 'cancelled' || view.lifecycle === 'failed' ? { type: 'incomplete' as const, reason: view.lifecycle === 'cancelled' ? 'cancelled' as const : 'error' as const }
        : view.lifecycle === 'succeeded' ? { type: 'incomplete' as const, reason: 'other' as const } : { type: 'running' as const }
      parts.set(id, annotated({ type: entry.kind === 'reasoning' ? 'reasoning' : 'text', text: entry.text, status,
        ...(entry.kind === 'reasoning' ? { unstable_summary: entry.label } : {}) }, { id, kind: 'commentary', label: entry.label }))
      continue
    }
    // A completed progress report is represented by its explicit explanation,
    // while a pending/failed report remains an honest ordinary tool activity.
    const stopped = tool.result === undefined && (view.lifecycle === 'cancelled' || view.lifecycle === 'failed')
    const projected = stopped ? { ...tool, result: { status: view.lifecycle }, isError: view.lifecycle === 'failed' } : tool
    const status = projected.result && typeof projected.result === 'object' ? Reflect.get(projected.result, 'status') : undefined
    const display = { ...toolDisplay(tool.toolName, status), ...recordedDisplay }
    if (status !== 'completed') display.summary = toolDisplay(tool.toolName, status).summary
    const attention = !!tool.approval || !!tool.interrupt || projected.isError || ['failed', 'cancelled', 'unknown'].includes(String(status))
    parts.set(tool.toolCallId, annotated({ ...projected, args: { fields: display.input ?? [] }, argsText: '',
      ...(projected.result !== undefined ? { result: { ...(projected.result as object), display } } : {}),
    }, { id: tool.toolCallId, kind: attention ? 'attention' : 'tool', label: display.title }))
  }
  return [...parts.values()]
}
function answerParts(view: RunView, parts: readonly ThreadAssistantMessagePart[]): ThreadAssistantMessagePart[] {
  return parts.map((part, index) => part.type === 'text'
    ? annotated(part, { id: `answer:${view.requestVersion}:${index}`, kind: 'answer', label: '答复' }) : part)
}
export function runMessageParts(view: RunView, tools: readonly HarnessToolPart[] = []): ThreadAssistantMessagePart[] {
  const cards = activityParts(view, tools)
  if (view.lifecycle === 'queued') return cards
  // Native drafts expose content deltas only; provider reasoning fields are excluded upstream.
  if (view.lifecycle === 'leased' && view.draft) return [...answerParts(view, projectLessonText(view.draft, view.runId, true)), ...cards]
  if (!view.message) return cards
  assertLessonCitationSpans(view.message.envelope.body, view.message.envelope.citations)
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
  return [...answerParts(view, parts.flatMap(part => part.type === 'text' ? projectLessonText(part.text, view.runId, view.delivery !== 'delivered') : [part])), ...cards, ...sources.values()]

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
