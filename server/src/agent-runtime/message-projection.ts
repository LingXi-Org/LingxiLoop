import type { MessageStatus, ThreadAssistantMessagePart, ToolCallMessagePart } from '@assistant-ui/react'
import { createHash } from 'node:crypto'
import { responseSegments, type PublicTextPart, type RunEvent, type RunView } from '@lyyzka/lingxios/ui'
import { toolCardResult } from '../../../src/lib/agentToolCards.js'
import { researchSources } from '../../../src/lib/researchSources.js'
import { memoryActivitySchema } from '../../../src/lib/memoryActivity.js'
import { assertVisualizeCitationSpans, projectVisualizeText } from './visualize-projection.js'
import { publicActivitySchema, toolDisplay, canonicalToolName, resolveToolDisplay, type ActivityAnnotation, type ToolDisplay } from '../../../src/lib/runActivity.js'

export type HarnessToolPart = ToolCallMessagePart & { eventSeq?: number; startedSeq?: number; display?: ToolDisplay;
  purpose?: 'process' | 'result'; taskId?: string; activityIdentity?: { requestVersion: number; fence: number; attemptId: string } }
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
      const { requestVersion,fence,attemptId } = event.data
      const activityIdentity = typeof requestVersion === 'number' && Number.isSafeInteger(requestVersion) && requestVersion > 0
        && typeof fence === 'number' && Number.isSafeInteger(fence) && fence > 0 && typeof attemptId === 'string' && attemptId.length > 0 && attemptId.length <= 2000
        ? { requestVersion,fence,attemptId } : undefined
      calls.set(id,{ type: 'tool-call',toolCallId: id,toolName: canonicalToolName(event.data.name),args: {},argsText: '{}',eventSeq: event.seq,startedSeq: event.seq,
        ...(event.data.presentation && typeof event.data.presentation === 'object' && Reflect.get(event.data.presentation,'purpose') === 'process' ? { purpose: 'process' as const } : {}),
        ...(activityIdentity ? { activityIdentity } : {}) })
    }
    const previous = calls.get(id)
    if (event.kind === 'tool.completed' && previous && event.seq > (previous.eventSeq ?? 0) && event.data.result && typeof event.data.result === 'object') {
      const result = event.data.result, value = Reflect.get(result,'value')
      const purpose = Reflect.get(result,'presentation')
      // Retain status and bounded search cards, never complete source text or prompts.
      calls.set(id,{ ...previous,eventSeq: event.seq,result: { status: Reflect.get(result,'status'),
        ...(toolCardResult(previous.toolName, value) ? { value: toolCardResult(previous.toolName, value) } : {}),
        ...(previous.toolName === 'research.search' ? { sources: researchSources(value) } : {}),
        ...(previous.toolName.startsWith('knowledge.') && value && typeof value === 'object' ? { sourceStatus: Reflect.get(value,'status') } : {}),
        ...(previous.toolName.startsWith('memory.') && Reflect.get(result, 'status') === 'completed' && memoryActivitySchema.safeParse(value).success ? { memory: memoryActivitySchema.parse(value) } : {}),
        ...(previous.toolName === 'chat.report_progress' && publicActivitySchema.safeParse(value).success ? { activity: publicActivitySchema.parse(value) } : {}),
      },isError: event.data.isError === true,
        purpose: purpose && typeof purpose === 'object' && ['process','result'].includes(String(Reflect.get(purpose,'purpose')))
          ? Reflect.get(purpose,'purpose') as 'process'|'result' : undefined,
        ...(typeof Reflect.get(result,'approvalId') === 'string' ? { approval: { id: String(Reflect.get(result,'approvalId')) } } : {}) })
    }
  }
  return [...calls.values()].sort((a, b) => (a.startedSeq ?? a.eventSeq ?? 0) - (b.startedSeq ?? b.eventSeq ?? 0))
}
type AnnotatedPart<T = ThreadAssistantMessagePart> = T & { providerMetadata: { lingxiloop: { activity: ActivityAnnotation } } }
function annotated<T extends ThreadAssistantMessagePart>(part: T, annotation: Omit<ActivityAnnotation, 'version'>): AnnotatedPart<T> {
  const activity: ActivityAnnotation = { version: 1, ...annotation }
  return { ...part, providerMetadata: { ...('providerMetadata' in part ? part.providerMetadata : {}),
    lingxiloop: { activity } } }
}
/** Only an explicit accepted source is replaced by the final answer. Other
 * attempts remain available as process, never deduplicated by their text. */
export function archivedPublicText(part: PublicTextPart): boolean {
  return !!part.acceptedResultId
}
const stableId = (prefix: string, identity: unknown[]) => `${prefix}:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`
const publicTextId = (part: PublicTextPart) => stableId('public-text', [part.runId,part.requestVersion,part.fence,part.attemptId,part.partIndex,part.partId])
/** Acceptance can arrive before the committed message read. Keep the explicit
 * current source visible until its replacement is actually present. */
function pendingAcceptedSource(part: PublicTextPart, view: RunView): boolean {
  return !!part.acceptedResultId && part.purpose !== 'commentary' && part.reason !== 'superseded'
    && part.requestVersion === view.requestVersion && part.fence === view.fence
    && (!view.message || view.message.publicTextPartId !== part.partId || view.resultId !== part.acceptedResultId)
}
function publicTextPurpose(part: PublicTextPart, view: RunView, tools: readonly HarnessToolPart[]): 'answer' | 'commentary' {
  if (pendingAcceptedSource(part,view)) return 'answer'
  if (part.acceptedResultId || part.requestVersion !== view.requestVersion || part.fence !== view.fence
    || part.reason === 'superseded' || view.message && view.messageFence >= part.fence && view.message.envelope.requestVersion >= part.requestVersion) return 'commentary'
  const replaced = (view.publicTextParts ?? []).some(next => next.firstSeq > part.firstSeq && next.attemptId !== part.attemptId)
    || tools.some(tool => (tool.startedSeq ?? 0) > part.firstSeq && tool.activityIdentity && tool.activityIdentity.attemptId !== part.attemptId)
  if (replaced) return 'commentary'
  // Native v2 declares public purpose before its first text character. This is
  // producer metadata, not a classification of arbitrary prose.
  if (part.version === 2 && part.purpose) return part.purpose
  const hasTool = tools.some(tool => tool.activityIdentity?.requestVersion === part.requestVersion
    && tool.activityIdentity.fence === part.fence && tool.activityIdentity.attemptId === part.attemptId)
  if (part.reason === 'tool' || hasTool) return 'commentary'
  // 3.6.0 has no per-delta purpose: keep the current unresolved candidate live
  // until public tool/result evidence establishes its role, including failures.
  return 'answer'
}
function activityParts(view: RunView, tools: readonly HarnessToolPart[], includeAcceptedPublicText: boolean, history: boolean): ThreadAssistantMessagePart[] {
  const parts = new Map<string, { seq: number; part: ThreadAssistantMessagePart }>()
  const attempts = [
    ...tools.flatMap(tool => tool.activityIdentity ? [{ ...tool.activityIdentity,seq: tool.startedSeq ?? 0 }] : []),
    ...(view.publicTextParts ?? []).map(part => ({ requestVersion: part.requestVersion,fence: part.fence,attemptId: part.attemptId,seq: part.firstSeq })),
  ].filter(attempt => attempt.requestVersion === view.requestVersion && attempt.fence === view.fence)
  const latestAttempt = attempts.sort((a,b) => a.seq-b.seq).at(-1)?.attemptId
  const put = (id: string,seq: number,part: AnnotatedPart,revision = seq,requestVersion = view.requestVersion) => {
    const order = parts.get(id)?.seq ?? seq
    // Every caller below has just produced this annotation; do not repeatedly
    // parse trusted projection objects while rebuilding a long event history.
    const annotation = part.providerMetadata.lingxiloop.activity
    parts.set(id,{ seq: order,part: annotated(part,{ ...annotation,order,revision: Math.max(revision,view.lastSeq),
      ...(requestVersion > 0 ? { requestVersion } : {}) }) })
  }
  for (const part of view.publicTextParts ?? []) {
    const pendingAccepted = pendingAcceptedSource(part,view)
    if (!includeAcceptedPublicText && archivedPublicText(part) && !pendingAccepted) continue
    const id = archivedPublicText(part) && (history || !pendingAccepted) ? `archive:${publicTextId(part)}` : publicTextId(part)
    const status = part.status === 'running' ? { type: 'running' as const } : part.status === 'complete' ? { type: 'complete' as const }
      : { type: 'incomplete' as const,reason: part.reason === 'cancelled' ? 'cancelled' as const : part.reason === 'failed' ? 'error' as const : 'other' as const }
    // Public text is an unverified archive, including candidates superseded by
    // repair. Only the delivered answer may activate a renderer reference.
    const kind = history ? 'commentary' : publicTextPurpose(part,view,tools)
    for (const text of projectVisualizeText(part.text, true)) {
      put(id,part.firstSeq,annotated({ ...text,status },{ id,kind,label: kind === 'answer' ? '答复' : part.acceptedResultId ? '答复片段' : '公开说明',
        purpose: kind === 'answer' ? 'result' : 'process' }),part.lastSeq,part.requestVersion)
    }
  }
  for (const { eventSeq, startedSeq, activityIdentity, taskId, purpose, display: recordedDisplay, ...tool } of tools) {
    const seq = startedSeq ?? eventSeq ?? 0
    const result = tool.result && typeof tool.result === 'object' ? tool.result : undefined
    const explanation = publicActivitySchema.safeParse(result && Reflect.get(result, 'activity'))
    if (tool.toolName === 'chat.report_progress' && explanation.success) {
      const entry = explanation.data, id = stableId('public-report',[view.runId,activityIdentity?.requestVersion ?? null,
        activityIdentity?.fence ?? null,activityIdentity?.attemptId ?? null,entry.id])
      if (entry.kind === 'plan' && entry.plan) {
        put(id,seq, annotated({ type: 'generative-ui', id, spec: { root: { component: 'agent-plan', props: { title: entry.label, ...entry.plan } } } },
          { id, kind: 'commentary', label: entry.label, purpose: 'process', ...(taskId ? { taskId } : {}) }),eventSeq,activityIdentity?.requestVersion)
        continue
      }
      const status = entry.state === 'complete' ? { type: 'complete' as const }
        : !activityIdentity || activityIdentity.requestVersion !== view.requestVersion || activityIdentity.fence !== view.fence
          || activityIdentity.attemptId !== latestAttempt
          ? { type: 'incomplete' as const,reason: 'other' as const }
        : view.lifecycle === 'cancelled' || view.lifecycle === 'failed' ? { type: 'incomplete' as const, reason: view.lifecycle === 'cancelled' ? 'cancelled' as const : 'error' as const }
        : view.lifecycle === 'succeeded' ? { type: 'incomplete' as const, reason: 'other' as const } : { type: 'running' as const }
      const text = projectVisualizeText(entry.text, true).flatMap(part => part.type === 'text' ? [part.text] : []).join('')
      if (!text) continue
      put(id,seq, annotated({ type: entry.kind === 'reasoning' ? 'reasoning' : 'text', text, status,
        ...(entry.kind === 'reasoning' ? { unstable_summary: entry.label } : {}) }, { id, kind: 'commentary', label: entry.label, purpose: 'process', ...(taskId ? { taskId } : {}) }),eventSeq,activityIdentity?.requestVersion)
      continue
    }
    // A completed progress report is represented by its explicit explanation,
    // while a pending/failed report remains an honest ordinary tool activity.
    const stopped = tool.result === undefined && (view.lifecycle === 'cancelled' || view.lifecycle === 'failed')
    const projected = stopped ? { ...tool, result: { status: view.lifecycle }, isError: view.lifecycle === 'failed' } : tool
    const status = projected.result && typeof projected.result === 'object' ? Reflect.get(projected.result, 'status') : undefined
    const display = resolveToolDisplay(tool.toolName, status, recordedDisplay)
    if (status !== 'completed') display.summary = toolDisplay(tool.toolName, status).summary
    const current = !activityIdentity || activityIdentity.requestVersion === view.requestVersion && activityIdentity.fence === view.fence
    const unresolvedApproval = !!tool.approval && tool.approval.approved === undefined && !tool.approval.resolution
    const resolvedApproval = !!tool.approval && !unresolvedApproval
    const attention = current && (unresolvedApproval || !!tool.interrupt && view.goalOutcome?.status === 'awaiting_input'
      || status === 'unknown' || !resolvedApproval && view.goalOutcome?.status !== 'satisfied' && (projected.isError || ['failed', 'cancelled'].includes(String(status))))
    const delivered = status === 'completed' && (purpose === 'result' || !!toolCardResult(tool.toolName,result && Reflect.get(result,'value')))
    put(tool.toolCallId,seq, annotated({ ...projected, args: { fields: display.input ?? [] }, argsText: '',
      ...(projected.result !== undefined ? { result: { ...(projected.result as object), display } } : {}),
    }, { id: tool.toolCallId, kind: attention ? 'attention' : delivered ? 'result' : 'tool', label: display.title,
      ...(delivered ? { purpose: 'result' } : purpose ? { purpose: 'process' } : {}),
      ...(taskId ? { taskId } : {}) }),eventSeq,activityIdentity?.requestVersion)
  }
  return [...parts.values()].sort((a,b) => a.seq-b.seq).map(value => value.part)
}
function answerParts(view: RunView, parts: readonly ThreadAssistantMessagePart[]): ThreadAssistantMessagePart[] {
  const accepted = view.message && view.message.envelope.requestVersion === view.requestVersion && view.messageFence === view.fence
    && (view.publicTextParts ?? []).find(part => part.partId === view.message!.publicTextPartId
    && part.acceptedResultId === view.resultId && part.requestVersion === view.message!.envelope.requestVersion && part.fence <= view.messageFence)
  let firstText = true
  return parts.map((part, index) => {
    // Registered data results (including citation claims and artifact cards)
    // already belong to the body. Their strict wire shape has no metadata slot.
    if (part.type === 'data') return part
    if (part.type !== 'text') return annotated(part,{ id: `result:${view.requestVersion}:${index}`,kind: 'result',label: '结果' })
    const id = firstText && accepted ? publicTextId(accepted) : `answer:${view.requestVersion}:${index}`
    firstText = false
    return annotated(part, { id,kind: 'answer',label: '答复' })
  })
}
export function runMessageParts(view: RunView, tools: readonly HarnessToolPart[] = [], options: { includeAcceptedPublicText?: boolean; activityHistory?: boolean } = {}): ThreadAssistantMessagePart[] {
  const cards = activityParts(view, tools, options.includeAcceptedPublicText !== false, options.activityHistory === true)
  if (view.lifecycle === 'queued') return cards
  // Native drafts expose content deltas only; provider reasoning fields are excluded upstream.
  if (view.lifecycle === 'leased' && view.draft) {
    // Native emits model.delta after ending the current public candidate. That
    // is an additional preview, not another answer. Acceptance still requires
    // the explicit committed source ID; no text comparison is involved.
    const publicCandidate = (view.publicTextParts ?? []).some(part => part.requestVersion === view.requestVersion
      && part.fence === view.fence && part.reason === 'completed' && part.purpose !== 'commentary' && !part.acceptedResultId)
    return publicCandidate ? cards : [...answerParts(view, projectVisualizeText(view.draft, true)), ...cards]
  }
  if (!view.message || view.message.envelope.requestVersion !== view.requestVersion || view.messageFence !== view.fence) return cards
  assertVisualizeCitationSpans(view.message.envelope.body, view.message.envelope.citations)
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
    const identity = JSON.stringify([source.sourceId,source.sourceVersion])
    const previous = sources.get(identity)
    const previousChunks = previous && 'providerMetadata' in previous ? previous.providerMetadata?.lingxiloop?.chunkIds : undefined
    sources.set(identity, { type: 'source', sourceType: 'document', id: stableId('source',[source.sourceId,source.sourceVersion]),
      title: evidence?.find(item => citation.markers.includes(item.marker))?.title ?? source.sourceId, mediaType: 'text/plain',
      providerMetadata: { lingxiloop: { sourceId: source.sourceId,sourceVersion: source.sourceVersion,
        chunkIds: [...new Set([...(Array.isArray(previousChunks) ? previousChunks.filter((chunk): chunk is string => typeof chunk === 'string') : []),...source.chunkIds])] } } })
  }
  return [...answerParts(view, parts.flatMap(part => part.type === 'text' ? projectVisualizeText(part.text, view.delivery !== 'delivered') : [part])), ...cards, ...sources.values()]

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
