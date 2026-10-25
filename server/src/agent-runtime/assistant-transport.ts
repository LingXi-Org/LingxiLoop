import { readRunPresentationVersion } from './identity.js'
import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk, type AssistantTransportStateOperation } from 'assistant-stream'
import type { ReadonlyJSONValue } from 'assistant-stream/utils'
import { consumeAssistantMessage, consumeRunStreamEvent, consumePublicTextAttempts, createRunView, type AssistantMessage, type RunStreamEvent, type PublicTextAttempt } from '@lyyzka/lingxios/ui'
import type { createLingxiOS, RunIdentity, RunState, RuntimeOperationContext, RunTraceSnapshot } from '@lyyzka/lingxios'
import type { AgentRunSnapshot, RunDisplayState } from '../../../src/lib/agentRunSnapshot.js'
import { createNativeMessage } from '../im/message-types.js'
import { archivedPublicText, runMessageParts, runMessageStatus, harnessToolParts, type HarnessToolPart } from './message-projection.js'
import { nativeRunEvents, publicRunEvent } from './public-events.js'
import { userFacingError } from '../../../src/lib/userFacingError.js'
import { readOptionalTraceActivity } from './tool-activity.js'
import { buildRunTrace,buildNativeRunTrace,nativeTraceMatchesState,type PublicLlmTrace } from './run-trace.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeMessageSchema } from '../../../src/lib/nativeMessage.js'
import type { Queryable } from '../db/queryable.js'
import { readQuestionnaireWait } from './questionnaire-projection.js'
import { projectActivityTasks } from './activity-tasks.js'
import { readDeliveredReference } from './delivery-reference.js'
import { terminalFeedbackScope, terminalFeedbackText, terminalResult } from './terminal-feedback.js'
import type { TerminalScope } from '../../../src/lib/terminalFeedback.js'

/** LingxiOS owns event ordering/fences; only public native messages cross HTTP. */
export class RunStreamProjection {
  get hasState(): boolean { return this.createdAt !== null }
  private view: ReturnType<typeof createRunView>
  private createdAt: string | null = null
  private tools: HarnessToolPart[] = []
  private llm: PublicLlmTrace[] = []
  private presentationAvailable = false
  private presentationReadRevision = 0
  private nativeTrace: RunTraceSnapshot | null | undefined
  private nativeTraceAvailable = false
  private nativeTraceReadRevision = 0
  private error: string | null = null
  private sourceRef: string | null = null
  private deliveredReference?: { resultId: string; requestVersion: number; fence: number; sourceMessageId: string }
  private durableDraft = ''
  private questionnaireWait: { questionId: string; requestVersion: number } | null = null
  private terminalFeedback: { id: string; requestVersion: number; reason: string; status: 'failed' | 'cancelled'; delivery: string; scopeVersion: 1; scope: TerminalScope; text?: string } | null = null
  private terminalState: RunState | null = null
  needsResync = false

  constructor(runId: string, private readonly canControl: boolean,
    private readonly identity?: { agentId: string; principalId?: string; threadId?: string },
    private readonly presentationVersion?: 1) {
    this.view = createRunView(runId)
  }

  apply(item: RunStreamEvent): AgentRunSnapshot {
    this.advance(item)
    return this.snapshot
  }

  restorePublicAttempts(attempts: readonly PublicTextAttempt[]): void {
    this.view = consumePublicTextAttempts(this.view,attempts)
  }

  /** Consume in order; callers must materialize and validate before emitting. */
  advance(item: RunStreamEvent): void {
    const id = item.type === 'state' ? item.state.run.id : item.type === 'event' ? item.event.runId
      : item.type === 'preview' ? item.preview.runId : item.runId
    if (id !== this.view.runId) throw new Error('运行身份不一致')
    const before = this.view
    this.view = consumeRunStreamEvent(before, item)
    if (this.view.requestVersion !== before.requestVersion || this.view.fence !== before.fence || this.view.lifecycle !== before.lifecycle) {
      this.terminalFeedback = null
      if (this.nativeTrace !== undefined) this.nativeTrace = null
      this.nativeTraceAvailable = false
    }
    if (this.nativeTrace && this.view.lastSeq > this.nativeTrace.seq) this.nativeTraceAvailable = false
    if (item.type === 'trace') {
      this.nativeTraceReadRevision++
      this.nativeTrace = item.trace && nativeTraceMatchesState(item.trace,this.view) ? item.trace : null
      this.nativeTraceAvailable = this.nativeTrace !== null && this.nativeTrace.seq >= this.view.lastSeq
    }
    if (this.view.lifecycle !== 'leased' || this.view.fence !== before.fence
      || this.view.requestVersion !== before.requestVersion || this.view.messageFence === this.view.fence) this.durableDraft = ''
    if (item.type === 'event' && this.view !== before && item.event.visibility === 'user'
      && item.event.kind === 'model.delta' && item.event.data.partType === 'text'
      && this.view.lifecycle === 'leased' && this.view.preview === null && this.view.draft) this.durableDraft = this.view.draft
    this.needsResync = item.type === 'preview' && item.preview.kind === 'delta'
      && this.view !== before && this.view.preview === null
    if (item.type === 'state' && this.view !== before) {
      this.terminalState = item.state
      this.createdAt = item.state.run.createdAt
      this.error = item.state.run.error ? userFacingError(item.state.run.error, '这次任务未能完成，请稍后重试。') : null
    }
    if (item.type === 'event' && item.event.visibility === 'user') {
      const action = this.tools.find(tool => tool.toolCallId === item.event.data.toolCallId)?.toolName
      const event = publicRunEvent(item.event, action, this.presentationVersion)
      this.tools = harnessToolParts(this.view.runId, [event], this.tools)
      if (this.view !== before && event.kind === 'run.failed' && typeof event.data.error === 'string') this.error = event.data.error
      if (event.kind === 'run.started' && typeof event.data.sourceRef === 'string') this.sourceRef = event.data.sourceRef
    }
  }

  async syncNativeTrace(api: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readRunTrace'>, identity: RunIdentity, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return
    const version = ++this.nativeTraceReadRevision, view = this.view
    let trace: RunTraceSnapshot | null = null
    try { trace = await api.readRunTrace(identity,{ signal,deadlineAt: new Date(Date.now()+500).toISOString() }) } catch { /* Optional metadata: unavailable, never cached totals. */ }
    if (signal?.aborted || version !== this.nativeTraceReadRevision || view.fence !== this.view.fence || view.requestVersion !== this.view.requestVersion || view.lifecycle !== this.view.lifecycle) return
    this.nativeTrace = trace && nativeTraceMatchesState(trace,this.view) ? trace : null
    this.nativeTraceAvailable = this.nativeTrace !== null && this.nativeTrace.seq >= this.view.lastSeq
  }

  async syncApprovals(api: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readApproval'>, identity: RunIdentity, operation?: RuntimeOperationContext): Promise<void> {
    for (let index = 0; index < this.tools.length; index++) {
      const tool = this.tools[index]
      if (!tool.approval) continue
      const approval = await api.readApproval({ tenantId: identity.tenantId, principalId: identity.principalId, approvalId: tool.approval.id },operation)
      if (!approval || approval.runId !== this.view.runId || approval.agentId !== identity.agentId) throw new Error('approval identity is unavailable')
      this.tools[index] = { ...tool, approval: { id: approval.approvalId,
        ...(approval.decision !== null ? { approved: approval.decision }
          : this.view.lifecycle === 'cancelled' ? { resolution: 'cancelled' as const }
          : approval.requestVersion !== this.view.requestVersion || this.view.lifecycle === 'failed'
            || this.view.lifecycle === 'succeeded' && this.view.goalOutcome?.status !== 'awaiting_approval' ? { resolution: 'expired' as const } : {}),
      } }
    }
  }

  async syncPresentation(identity: RunIdentity, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return
    const view = this.view,readRevision = ++this.presentationReadRevision
    const revisions = new Map(this.tools.map(tool => [tool.toolCallId, tool.eventSeq]))
    const presentation = await readOptionalTraceActivity(identity,signal)
    // Native text/receipt events do not invalidate display metadata. Request,
    // fence, lifecycle and tool revisions do; a relevant event coalesces another
    // refresh without allowing an old read to mutate new authoritative content.
    if (readRevision !== this.presentationReadRevision || this.view.requestVersion !== view.requestVersion || this.view.fence !== view.fence
      || this.view.lifecycle !== view.lifecycle || signal?.aborted) return
    // Retain confirmed spans on a current failed read, but never present that
    // cached subset as complete current usage. Only the latest matching read
    // may downgrade or restore coverage, including concurrent failures.
    this.presentationAvailable = presentation !== null
    if (!presentation) return
    const records = new Map(presentation.tools.map(record => [record.toolCallId,record]))
    this.llm = presentation.llm
    this.tools = this.tools.map(tool => {
      const recorded = records.get(tool.toolCallId)
      return recorded && revisions.get(tool.toolCallId) === tool.eventSeq ? { ...tool, timing: { ...recorded.timing,...tool.timing }, display: recorded.display } : tool
    })
  }

  async syncQuestionnaire(identity: RunIdentity, database?: Queryable): Promise<void> {
    this.questionnaireWait = this.view.goalOutcome?.status === 'awaiting_input'
      ? await readQuestionnaireWait(identity, this.view.requestVersion, database) : null
  }

  async syncTerminal(api: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readTerminal'>, identity: RunIdentity, operation?: RuntimeOperationContext, database?: Queryable): Promise<void> {
    const view = this.view
    const terminal = await api.readTerminal(identity,operation)
    if (this.view.requestVersion !== view.requestVersion || this.view.fence !== view.fence || this.view.lifecycle !== view.lifecycle
      || this.view.resultId !== view.resultId || this.view.messageFence !== view.messageFence || this.view.delivery !== view.delivery) return
    const state = this.terminalState
    const currentState = state && state.run.id === view.runId && state.run.requestVersion === view.requestVersion
      && state.run.fence === view.fence && state.run.status === view.lifecycle && state.run.resultId === view.resultId
      && state.delivery === view.delivery ? state : null
    const committed = terminal && currentState ? terminalResult(terminal.feedback, currentState) : undefined
    const acceptedReference = committed && currentState?.delivery !== 'delivered'
      ? await readDeliveredReference(identity, committed, database) : undefined
    if (this.view.requestVersion !== view.requestVersion || this.view.fence !== view.fence || this.view.lifecycle !== view.lifecycle
      || this.view.resultId !== view.resultId || this.view.messageFence !== view.messageFence || this.view.delivery !== view.delivery) return
    const scope = terminal && currentState ? terminalFeedbackScope(terminal.feedback,currentState,acceptedReference) : 'unknown'
    this.terminalFeedback = terminal && terminal.feedback.rootWorkId === view.runId && terminal.feedback.requestVersion === view.requestVersion
      ? { id: terminal.feedback.id,requestVersion: terminal.feedback.requestVersion,reason: terminal.feedback.reason,
          status: terminal.feedback.status,delivery: terminal.delivery,scopeVersion: 1,scope,
          ...(state ? { text: terminalFeedbackText(terminal.feedback,state,null,[],scope) } : {}) } : null
  }

  async syncDeliveredReference(identity: RunIdentity, database?: Queryable): Promise<void> {
    const view = this.view
    if (view.lifecycle !== 'succeeded' || view.delivery !== 'delivered' || !view.resultId || view.messageFence !== view.fence
      || view.message?.envelope.requestVersion !== view.requestVersion) return
    const previous = this.deliveredReference
    if (previous?.resultId === view.resultId && previous.requestVersion === view.requestVersion && previous.fence === view.messageFence) return
    const sourceMessageId = await readDeliveredReference(identity, {
      resultId: view.resultId, requestVersion: view.requestVersion, fence: view.messageFence,
    }, database)
    if (sourceMessageId && this.view.lifecycle === 'succeeded' && this.view.delivery === 'delivered' && this.view.resultId === view.resultId
      && this.view.requestVersion === view.requestVersion && this.view.fence === view.fence && this.view.messageFence === view.messageFence) {
      this.deliveredReference = { sourceMessageId, resultId: view.resultId, requestVersion: view.requestVersion, fence: view.messageFence }
    }
  }

  committed(message: AssistantMessage, commit: { resultId: string; fence: number }): AgentRunSnapshot {
    if (this.view.requestVersion > message.envelope.requestVersion || this.view.messageFence > commit.fence) throw new Error('stale committed delivery')
    this.view = { ...consumeAssistantMessage(this.view,message,commit), delivery: 'delivered' }
    // The accepted IM echo proves this committed main result. Aggregate
    // collaboration failure is projected separately when reading the run.
    return this.projectSnapshot(false)
  }

  activityPage(offset: number, attentionOnly = false) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid activity offset')
    const parts = runMessageParts(this.view, this.activityContext().tools,{ activityHistory: true }).filter(part => {
      const kind = activityAnnotation(part)?.kind
      return attentionOnly ? kind === 'attention' : kind === 'tool' || kind === 'commentary' || kind === 'attention'
    })
    const base = this.snapshot.message
    const { activityHistory: _history, ...custom } = base.metadata.custom
    let content = parts.slice(offset, offset + 40)
    // Keep the existing structural bound even when individual rich cards differ
    // substantially in size. The next cursor includes every deferred part.
    while (content.length > 1 && !nativeMessageSchema.safeParse({ ...base, content, metadata: { ...base.metadata, custom } }).success) content = content.slice(0, -1)
    const message = nativeMessageSchema.parse({ ...base, content, metadata: { ...base.metadata, custom } })
    const next = offset + content.length
    return { message, total: parts.length, nextOffset: next < parts.length ? next : null }
  }

  get snapshot(): AgentRunSnapshot {
    return this.projectSnapshot(true)
  }

  private projectSnapshot(includeTerminal: boolean): AgentRunSnapshot {
    if (!this.createdAt) throw new Error('run state must precede message updates')
    const { message, draft: _draft, preview: _preview, publicTextParts: _publicTextParts, publicTextAttempts: _publicTextAttempts,
      publicTextCommit: _publicTextCommit, ...control } = this.view
    // Outcome gaps are internal verification diagnostics, not product copy.
    const { gaps: _gaps, ...outcome } = control.goalOutcome ?? {}
    const harness: RunDisplayState = { ...control,
      goalOutcome: control.goalOutcome ? outcome as NonNullable<RunDisplayState['goalOutcome']> : null,
      artifacts: message?.envelope.artifacts ?? [] }
    const agentId = this.identity?.agentId ?? message?.agentId
    // Ephemeral cleanup must not retract validated model.delta text before its committed state arrives.
    // A committed answer explicitly names its streamed source part. Keep that
    // immutable prefix in activityPage, but do not repeat it above the answer.
    const activityContext = this.activityContext()
    const parts = runMessageParts(this.durableDraft ? { ...this.view, draft: this.durableDraft } : this.view, activityContext.tools,{ includeAcceptedPublicText: false })
    const acceptedPublicParts = (this.view.publicTextParts ?? []).filter(archivedPublicText).length
    const activity = parts.filter(part => ['tool', 'commentary', 'attention'].includes(activityAnnotation(part)?.kind ?? ''))
    const attention = activity.filter(part => activityAnnotation(part)?.kind === 'attention')
    const activitySet = new Set(activity)
    const recent = activity.filter(part => activityAnnotation(part)?.kind !== 'attention').slice(-40)
    const latestCommentary = activity.filter(part => activityAnnotation(part)?.kind === 'commentary').at(-1)
    if (latestCommentary && !recent.includes(latestCommentary)) { recent.shift(); recent.push(latestCommentary) }
    const selected = new Set([...recent, ...attention.slice(-40)])
    const terminal = includeTerminal && this.terminalFeedback?.requestVersion === this.view.requestVersion
      && ['succeeded','failed','cancelled'].includes(this.view.lifecycle ?? '') ? this.terminalFeedback : null
    const input = { id: `run-${this.view.runId}`, role: 'assistant' as const, createdAt: this.createdAt,
      content: parts, status: terminal ? { type: 'incomplete' as const, reason: terminal.status === 'cancelled' ? 'cancelled' as const : 'error' as const } : runMessageStatus(this.view),
      custom: { runId: this.view.runId, harness, harnessControl: this.canControl, activityPresentation: { version: 1 },
        ...(activityContext.tasks ? { activityTasks: activityContext.tasks } : {}),
        runTrace: this.traceSnapshot(),
        ...(acceptedPublicParts ? { activityHistory: { total: activity.length+acceptedPublicParts,attention: attention.length } } : {}),
        ...(this.questionnaireWait?.requestVersion === this.view.requestVersion && this.view.goalOutcome?.status === 'awaiting_input'
          ? { questionnaireWait: this.questionnaireWait } : {}),
        ...(agentId ? { refs: { runId: this.view.runId, agentId } } : {}),
        ...(this.identity?.principalId ? { controlPrincipalId: this.identity.principalId } : {}),
        ...(this.identity?.threadId ? { replyToClientMsgNo: this.identity.threadId } : {}),
        ...(this.error ? { harnessError: this.error } : {}),
        ...(terminal ? { terminalFeedback: terminal } : {}),
        ...(this.sourceRef ? { sourceRef: this.sourceRef } : {}),
        ...(this.view.lifecycle === 'succeeded' && this.view.delivery === 'delivered' && this.deliveredReference?.resultId === this.view.resultId
          && this.deliveredReference.requestVersion === this.view.requestVersion && this.deliveredReference.fence === this.view.messageFence
          && this.view.messageFence === this.view.fence ? { sourceMessageId: this.deliveredReference.sourceMessageId } : {}),
        suppressAgentWake: true } }
    // Try the complete message first for ordinary histories; the wire protocol
    // stays unchanged. Overflow becomes an authorized, bounded activity page.
    if (activity.length <= 80) {
      try { return { message: createNativeMessage(input) } } catch { /* preserve answer and page activity below */ }
    }
    const compact = { ...input, custom: { ...input.custom, activityHistory: { total: activity.length+acceptedPublicParts, attention: attention.length } } }
    while (selected.size) {
      compact.content = parts.filter(part => !activitySet.has(part) || selected.has(part))
      try { return { message: createNativeMessage(compact) } }
      catch { selected.delete(selected.values().next().value!) }
    }
    // Invalid answer content is never silently removed or changed.
    compact.content = parts.filter(part => !activitySet.has(part))
    return { message: createNativeMessage(compact) }
  }

  private activityContext() {
    if (!this.nativeTrace || !this.nativeTraceAvailable || !nativeTraceMatchesState(this.nativeTrace, this.view)) return { tools: this.tools }
    const visible = new Set<string>()
    const visit = (span: import('../../../src/lib/runTrace.js').TraceSpan) => { visible.add(span.id); span.children.forEach(visit) }
    visit(this.traceSnapshot().root)
    return projectActivityTasks(this.nativeTrace, this.tools, visible)
  }

  private traceSnapshot() {
    if (this.nativeTrace === undefined) return buildRunTrace({ runId: this.view.runId,createdAt: this.createdAt!,lifecycle: this.view.lifecycle,tools: this.tools,llm: this.llm,presentationAvailable: this.presentationAvailable })
    if (!this.nativeTrace) return buildRunTrace({ runId: this.view.runId,createdAt: this.createdAt!,lifecycle: this.view.lifecycle,tools: this.tools,llm: this.llm,presentationAvailable: this.presentationAvailable })
    const trace = buildNativeRunTrace(this.nativeTrace,this.tools,this.llm)
    if (!this.nativeTraceAvailable) {
      if (!trace.limitations.includes('presentation-unavailable')) trace.limitations.push('presentation-unavailable')
      const clear = (span: typeof trace.root) => { if (span.kind === 'agent') span.tokensIn = span.tokensOut = span.cost = null; span.children.forEach(clear) }
      clear(trace.root)
    }
    return trace
  }
}

/** Native descendant traces are viewer-only: opt in at an authorized read, never durable IM delivery. */
export async function readRunProjection(api: Awaited<ReturnType<typeof createLingxiOS>>, identity: RunIdentity, canControl: boolean, presentationSignal?: AbortSignal, database?: Queryable, operation?: RuntimeOperationContext, includeTrace = false) {
  const state = await api.readRunState(identity,operation)
  if (!state) throw new Error('run not found')
  const projection = new RunStreamProjection(identity.runId,canControl,identity,await readRunPresentationVersion(identity,database))
  projection.apply({ type: 'state',state })
  const signal = AbortSignal.timeout(30_000)
  let cursor = 0
  while (true) {
    signal.throwIfAborted()
    const page = await api.readEvents(identity,cursor,operation)
    projection.restorePublicAttempts(page.publicTextAttempts ?? [])
    for (const event of page.events) projection.apply({ type: 'event',event })
    if (page.events.length < 100) break
    if (page.nextSeq <= cursor) throw new Error('runtime event cursor did not advance')
    cursor = page.nextSeq
  }
  const current = await api.readRunState(identity,operation)
  if (!current) throw new Error('run not found')
  projection.apply({ type: 'state',state: current })
  await projection.syncApprovals(api,identity,operation)
  await projection.syncTerminal(api,identity,operation,database)
  await projection.syncQuestionnaire(identity,database)
  await projection.syncDeliveredReference(identity,database)
  await Promise.all([projection.syncPresentation(identity, presentationSignal),
    ...(includeTrace ? [projection.syncNativeTrace(api,identity,presentationSignal ?? operation?.signal)] : [])])
  if (includeTrace) {
    // Optional enrichment may fail for either availability or revoked access.
    // Required root authorization still gates the response after that work.
    const authorized = await api.readRunState(identity,operation)
    if (!authorized) throw new Error('run not found')
    projection.apply({ type: 'state',state: authorized })
  }
  return projection
}

function changes(previous: ReadonlyJSONValue | undefined, next: ReadonlyJSONValue): AssistantTransportStateOperation[] {
  const operations: AssistantTransportStateOperation[] = []
  function diff(before: ReadonlyJSONValue | undefined, after: ReadonlyJSONValue, path: string[]) {
    if (before === after) return
    if (typeof before === 'string' && typeof after === 'string' && ['text','argsText'].includes(path.at(-1) ?? '') && after.startsWith(before)) {
      operations.push({ type: 'append-text',path,value: after.slice(before.length) })
    } else if (before && after && typeof before === 'object' && typeof after === 'object'
      && Array.isArray(before) === Array.isArray(after)) {
      const beforeKeys = Object.keys(before), afterKeys = Object.keys(after)
      if (beforeKeys.length === afterKeys.length && beforeKeys.every((key, index) => key === afterKeys[index])) {
        for (const key of afterKeys) diff(Reflect.get(before,key),Reflect.get(after,key),[...path,key])
      } else operations.push({ type: 'set',path,value: after })
    } else operations.push({ type: 'set',path,value: after })
  }
  diff(previous,next,[])
  return operations
}

export function assistantRunResponse(body: ReadableStream<Uint8Array>, projection: RunStreamProjection, approvals?: { api: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readApproval' | 'readTerminal'> & Partial<Pick<Awaited<ReturnType<typeof createLingxiOS>>,'readRunTrace'>>; identity: RunIdentity; signal?: AbortSignal }): Response {
  const cancellation = new AbortController()
  const signal = approvals?.signal ? AbortSignal.any([cancellation.signal, approvals.signal]) : cancellation.signal
  async function* chunks(): AsyncGenerator<AssistantStreamChunk> {
    // Keep one JSON-normalized snapshot per response. It cannot be mutated by
    // the projection or shared with another subscriber, and is already ready
    // for the next comparison without cloning or serializing whole subtrees.
    let previous: ReadonlyJSONValue | undefined
    const events = nativeRunEvents(body, signal)
    const read = () => events.next().then(value => ({ type: 'native' as const, value }),
      (error: unknown) => ({ type: 'error' as const, error }))
    let incoming: ReturnType<typeof read> | undefined = read()
    let presentation: Promise<{ type: 'presentation' }> | undefined
    let refreshRequested = false
    const refresh = () => {
      if (!approvals || presentation || !refreshRequested || signal.aborted) return
      refreshRequested = false
      presentation = Promise.all([projection.syncPresentation(approvals.identity, signal),
        ...(approvals.api.readRunTrace ? [projection.syncNativeTrace({ readRunTrace: approvals.api.readRunTrace },approvals.identity,signal)] : []),
      ]).then(() => ({ type: 'presentation' as const }))
    }
    try {
      if (projection.hasState) {
        previous = JSON.parse(JSON.stringify(projection.snapshot)) as ReadonlyJSONValue
        yield { type: 'update-state', path: [], operations: changes(undefined, previous) }
      }
      while (incoming || presentation) {
        // Race independent event sources, never a timeout against uncancelled SQL.
        const ready = await Promise.race([...incoming ? [incoming] : [], ...presentation ? [presentation] : []])
        if (signal.aborted) break
        if (ready.type === 'error') throw ready.error
        if (ready.type === 'native') {
          if (ready.value.done) { incoming = undefined; continue }
          const item = ready.value.value
          if (!item) {
            yield { type: 'update-state', path: [], operations: [] }
            incoming = read()
            continue
          }
          projection.advance(item)
          if (approvals && item.type === 'state') await projection.syncDeliveredReference(approvals.identity)
          if (approvals && (item.type === 'state' || item.type === 'event' && item.event.kind === 'tool.completed')) await projection.syncApprovals(approvals.api,approvals.identity)
          if (approvals && (item.type === 'state' || item.type === 'event' && ['run.failed','run.cancelled'].includes(item.event.kind))) await projection.syncTerminal(approvals.api,approvals.identity)
          if (approvals && (item.type === 'state' || item.type === 'event' && item.event.kind === 'goal.waiting')) await projection.syncQuestionnaire(approvals.identity)
          if (item.type === 'state' || item.type === 'event' && ['tool.started', 'tool.completed','model.request.finished','run.failed','run.cancelled'].includes(item.event.kind)) refreshRequested = true
          // Only required reads precede the authoritative frame. Display work
          // continues independently and at most one refresh is in flight.
          refresh()
          incoming = read()
        } else {
          presentation = undefined
          refresh()
        }
        const next = JSON.parse(JSON.stringify(projection.snapshot)) as ReadonlyJSONValue
        const operations = changes(previous, next)
        if (operations.length) yield { type: 'update-state', path: [], operations }
        previous = next
        if (projection.needsResync) throw new Error('runtime preview gap; reconnect for a complete snapshot')
      }
    } finally {
      cancellation.abort()
      await presentation
      await events.return(undefined)
    }
  }
  const iterator = chunks()
  const stream = new ReadableStream<AssistantStreamChunk>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (error) { controller.error(error); await iterator.return(undefined) }
    },
    async cancel() { cancellation.abort(); await iterator.return(undefined) },
  })
  const response = AssistantStream.toResponse(stream, new AssistantTransportEncoder())
  response.headers.set('Cache-Control', 'private, no-cache, no-transform')
  response.headers.set('X-Accel-Buffering', 'no')
  return response
}
