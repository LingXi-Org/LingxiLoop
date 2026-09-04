/**
 * AgentRuntime — the product-agnostic agent loop.
 *
 * One `runWork` call executes one lease attempt of one work item:
 *
 *   claim (done by caller) → load context → restore session → model/kernel
 *   hops → validated final text → commit message → complete.
 *
 * Everything durable flows through the {@link HostPort}; everything
 * product-specific flows through the {@link RuntimePolicy}. Non-`turn` work
 * kinds are dispatched to registered {@link WorkProcessor}s.
 *
 * Attempt identity: the run id is the work id. A retried attempt reuses every
 * externally visible identity and writes its events into the fence-scoped
 * sequence range, so earlier attempts' events are never shadowed or deduped
 * against it.
 */
import {
  ApprovalPendingError, KernelCancelledError, KernelExecutionError, KernelTimeoutError,
  LeaseLostError, ModelDriverError, RunCancelledError, errorMessage,
} from '../errors.js'
import type { HostPort } from '../host/port.js'
import type { KernelExecutor } from '../kernel/manager.js'
import { nullLogger, type Logger } from '../logging.js'
import type { ModelDriver } from '../model/driver.js'
import { RUN_SEQUENCE_SPAN } from '../protocol/constants.js'
import {
  sessionKeyOf,
  type AssistantMessage, type ModelItem, type PromptContext, type RunEvent,
  type SessionRecord, type SteerInput, type TurnContext, type WorkItem,
} from '../protocol/types.js'
import { compactIfNeeded, DEFAULT_COMPACTION, type CompactionOptions } from './compaction.js'
import { CorrectionBudget } from './corrections.js'
import { DefaultRuntimePolicy, type RuntimePolicy } from './policy.js'
import { boundedToolOutput, parseIPythonArguments } from './tool.js'

export interface WorkProcessorContext {
  host: HostPort
  model: ModelDriver
  signal: AbortSignal
  emit(event: Omit<RunEvent, 'runId' | 'seq'>): Promise<void>
}

/** Handler for non-`turn` work kinds (syntheses, digests, maintenance…). */
export interface WorkProcessor {
  process(work: WorkItem, context: WorkProcessorContext): Promise<void>
}

export interface AgentRuntimeOptions {
  policy?: RuntimePolicy
  maxHops?: number
  heartbeatMs?: number
  compaction?: Partial<CompactionOptions>
  logger?: Logger
  promptContractVersion?: string
}

interface AttemptSignals {
  lifecycle: AbortController
  leaseLost: () => Error | null
  preemptRequested: () => boolean
  drainSteer: () => SteerInput[]
  stop: () => void
}

export class AgentRuntime {
  private readonly policy: RuntimePolicy
  private readonly maxHops: number
  private readonly heartbeatMs: number
  private readonly compaction: CompactionOptions
  private readonly logger: Logger
  private readonly promptContractVersion: string
  private readonly processors = new Map<string, WorkProcessor>()
  private readonly eventSeqByRun = new Map<string, number>()

  constructor(
    private readonly host: HostPort,
    private readonly model: ModelDriver,
    private readonly kernels: KernelExecutor,
    options: AgentRuntimeOptions = {},
  ) {
    this.policy = options.policy ?? new DefaultRuntimePolicy()
    this.maxHops = options.maxHops ?? 12
    this.heartbeatMs = options.heartbeatMs ?? 5_000
    this.compaction = { ...DEFAULT_COMPACTION, ...options.compaction }
    this.logger = options.logger ?? nullLogger
    this.promptContractVersion = options.promptContractVersion ?? 'prompt-v1'
  }

  /** Register a processor for a non-`turn` work kind. */
  registerProcessor(kind: string, processor: WorkProcessor): void {
    this.processors.set(kind, processor)
  }

  private async event(work: WorkItem, runId: string, event: Omit<RunEvent, 'runId' | 'seq'>): Promise<number> {
    const seq = (this.eventSeqByRun.get(runId) ?? 0) + 1
    this.eventSeqByRun.set(runId, seq)
    await this.host.emitEvent(work, { runId, seq, ...event })
    return seq
  }

  private startSignals(work: WorkItem, external?: AbortSignal): AttemptSignals {
    const lifecycle = new AbortController()
    let leaseLost: Error | null = null
    let preemptRequested = false
    const steerQueue: SteerInput[] = []
    const seenSteer = new Set<string>()
    let heartbeatInFlight = false

    const abortFromCaller = () => lifecycle.abort(external?.reason ?? new RunCancelledError('caller'))
    if (external?.aborted) abortFromCaller()
    else external?.addEventListener('abort', abortFromCaller, { once: true })

    const heartbeat = setInterval(() => {
      if (heartbeatInFlight) return
      heartbeatInFlight = true
      this.host.heartbeat(work).then((result) => {
        if (!result.ok) {
          leaseLost = new LeaseLostError()
          lifecycle.abort(leaseLost)
        }
        if (result.cancelRequested) lifecycle.abort(new RunCancelledError('user'))
        if (result.preemptRequested) {
          preemptRequested = true
          lifecycle.abort(new RunCancelledError('preempted'))
        }
        for (const steer of result.steer ?? []) {
          if (!seenSteer.has(steer.id)) {
            seenSteer.add(steer.id)
            steerQueue.push(steer)
          }
        }
      }).catch((error: unknown) => {
        leaseLost = error instanceof Error ? error : new LeaseLostError(String(error))
        lifecycle.abort(leaseLost)
      }).finally(() => { heartbeatInFlight = false })
    }, this.heartbeatMs)
    heartbeat.unref?.()

    return {
      lifecycle,
      leaseLost: () => leaseLost,
      preemptRequested: () => preemptRequested,
      drainSteer: () => steerQueue.splice(0),
      stop: () => {
        clearInterval(heartbeat)
        external?.removeEventListener('abort', abortFromCaller)
      },
    }
  }

  async runWork(work: WorkItem, signal?: AbortSignal): Promise<void> {
    const runId = work.id
    this.eventSeqByRun.set(runId, Math.max(0, work.fence - 1) * RUN_SEQUENCE_SPAN)
    const signals = this.startSignals(work, signal)
    let activeSession: SessionRecord | null = null
    const log = this.logger.child({ runId, workId: work.id, agentId: work.agentId, fence: work.fence })

    try {
      await this.event(work, runId, {
        kind: 'run.started', stage: 'started', visibility: 'user',
        data: {
          kind: work.kind, lane: work.lane, attempts: work.attempts ?? 1, preemptions: work.preemptions ?? 0,
          ...(work.availableAt ? { queueWaitMs: Math.max(0, Date.now() - Date.parse(work.availableAt)) } : {}),
        },
      })

      const processor = work.kind !== 'turn' && work.kind !== 'resume' ? this.processors.get(work.kind) : undefined
      if (processor) {
        await processor.process(work, {
          host: this.host,
          model: this.model,
          signal: signals.lifecycle.signal,
          emit: async (event) => { await this.event(work, runId, event) },
        })
        await this.event(work, runId, { kind: 'run.completed', stage: 'completed', visibility: 'internal', data: {} })
        await this.host.completeWork(work, { status: 'completed' })
        return
      }
      if (work.kind !== 'turn' && work.kind !== 'resume') {
        throw new Error(`no processor registered for work kind '${work.kind}'`)
      }

      const sessionRef: { session: SessionRecord | null } = { session: null }
      try {
        await this.runTurn(work, runId, signals, log, sessionRef)
      } finally {
        activeSession = sessionRef.session
      }
    } catch (error) {
      await this.finishWithError(work, runId, signals, activeSession, error)
      return
    } finally {
      signals.stop()
      this.eventSeqByRun.delete(runId)
    }
  }

  // -------------------------------------------------------------------------
  // The turn loop
  // -------------------------------------------------------------------------

  private async runTurn(
    work: WorkItem, runId: string, signals: AttemptSignals, log: Logger,
    sessionRef: { session: SessionRecord | null },
  ): Promise<void> {
    const context = await this.host.loadContext(work)
    await this.event(work, runId, {
      kind: 'input.loaded', stage: 'completed', visibility: 'internal',
      data: { triggerRef: work.triggerRef },
    })
    for (const event of this.policy.contextEvents(context)) {
      await this.event(work, runId, {
        kind: event.kind, stage: 'completed', visibility: 'internal', data: event.data,
      })
    }

    const session = await this.restoreSession(work, context)
    sessionRef.session = session
    const capabilities = this.policy.kernelCapabilities(context)
    const budget = new CorrectionBudget()
    let nextStreamPartIndex = 0
    let streamedText = ''
    let finalText = ''
    let completedHostAction = false
    let protocolCorrection: ModelItem | null = null

    for (let hop = 0; hop < this.maxHops; hop++) {
      const leaseLost = signals.leaseLost()
      if (leaseLost) throw leaseLost
      if (signals.lifecycle.signal.aborted) throw new RunCancelledError('lifecycle')

      const steers = signals.drainSteer()
      if (steers.length > 0) {
        session.history.push({
          role: 'user',
          content: `Highest-priority human steering:\n${steers.map((item) => item.text).join('\n')}`,
        })
      }

      // Dynamic context is re-rendered per hop and never persisted, keeping
      // the durable history (and provider prompt caches) stable.
      const liveContext = hop === 0 ? context : await this.host.loadContext(work)
      const dynamicItems = this.policy.dynamicContextItems(liveContext)
      const instructions = session.promptContext?.systemInstructions ?? context.persona.instructions

      await this.event(work, runId, { kind: 'model.started', stage: 'started', visibility: 'internal', data: { hop: hop + 1 } })
      const modelStartedAt = Date.now()
      let turn
      try {
        const correction = protocolCorrection
        protocolCorrection = null
        turn = await this.model.run({
          instructions,
          items: [...session.history, ...dynamicItems, ...(correction ? [correction] : [])],
          signal: signals.lifecycle.signal,
        })
      } catch (error) {
        await this.event(work, runId, {
          kind: 'model.failed', stage: 'failed', visibility: 'internal',
          data: {
            hop: hop + 1, model: this.model.modelId ?? 'unknown',
            latencyMs: Date.now() - modelStartedAt, error: errorMessage(error),
          },
        })
        if (error instanceof ModelDriverError && budget.consume('tool_protocol')) {
          protocolCorrection = {
            role: 'user',
            content: 'Protocol correction: the previous response violated the tool protocol. Reply again with either exactly one valid ipython call or non-empty assistant text.',
          }
          continue
        }
        throw error
      }
      const modelCompletedData = {
        hop: hop + 1, model: turn.model ?? 'unknown', purpose: 'agent-turn',
        usage: turn.usage, latencyMs: Date.now() - modelStartedAt,
        ...(turn.diagnostics ? { diagnostics: turn.diagnostics } : {}),
      }

      const calls = turn.output.filter(
        (item): item is Extract<ModelItem, { type: 'function_call' }> => 'type' in item && item.type === 'function_call',
      )

      // Text and a tool call in one turn is a protocol violation.
      if (calls.length > 0 && turn.text.trim()) {
        await this.event(work, runId, {
          kind: 'model.completed', stage: 'completed', visibility: 'internal', data: modelCompletedData,
        })
        protocolCorrection = this.correctionOrThrow(budget, 'tool_protocol',
          'Protocol correction: assistant text and an ipython call are mutually exclusive. Either call ipython once, or reply with text only.')
        continue
      }
      if (calls.length > 1) {
        await this.event(work, runId, {
          kind: 'model.completed', stage: 'completed', visibility: 'internal', data: modelCompletedData,
        })
        session.history.push(...turn.output)
        for (const call of calls) {
          session.history.push({
            type: 'function_call_output', callId: call.callId,
            output: boundedToolOutput({ error: 'multiple ipython calls are not allowed; no code was executed', protocolError: true }),
          })
        }
        protocolCorrection = this.correctionOrThrow(budget, 'tool_protocol',
          'Protocol correction: emit at most one ipython call per model turn.')
        continue
      }

      if (calls.length === 0) {
        const violation = this.policy.validateAssistantText(turn.text, liveContext, { completedHostAction })
        if (violation) {
          await this.event(work, runId, {
            kind: 'model.completed', stage: 'completed', visibility: 'internal', data: modelCompletedData,
          })
          await this.event(work, runId, {
            kind: 'response.withheld', stage: 'failed', visibility: 'internal', data: { violation },
          })
          protocolCorrection = this.correctionOrThrowMessage(budget, 'response_protocol',
            `Your previous candidate was withheld because ${violation}. Re-evaluate the current request and respond within protocol.`,
            `model repeatedly violated the visible response protocol: ${violation}`)
          continue
        }
        const gate = this.policy.completionGate(liveContext, work)
        if (!gate.allowed) {
          await this.event(work, runId, {
            kind: 'model.completed', stage: 'completed', visibility: 'internal', data: modelCompletedData,
          })
          session.history.push({ role: 'user', content: gate.instruction ?? 'Completion gate: required work is not finished; continue.' })
          continue
        }
        session.history.push(...turn.output)
        finalText = turn.text.trim()
        if (finalText) {
          const partIndex = nextStreamPartIndex++
          await this.event(work, runId, {
            kind: 'model.delta', stage: 'delta', visibility: 'user',
            data: { delta: finalText, partType: 'text', partIndex, partStart: true },
          })
          await this.event(work, runId, {
            kind: 'model.completed', stage: 'completed', visibility: 'internal',
            data: { ...modelCompletedData, finishPartIndex: partIndex },
          })
          streamedText += finalText
        } else {
          await this.event(work, runId, {
            kind: 'model.completed', stage: 'completed', visibility: 'internal', data: modelCompletedData,
          })
        }
        break
      }

      // Exactly one tool call.
      await this.event(work, runId, {
        kind: 'model.completed', stage: 'completed', visibility: 'internal', data: modelCompletedData,
      })
      session.history.push(...turn.output)
      const call = calls[0]!
      const outcome = await this.executeCall(work, runId, session, call, hop, signals, budget, nextStreamPartIndex, capabilities)
      nextStreamPartIndex = outcome.nextStreamPartIndex
      completedHostAction ||= outcome.completedHostAction
      if (outcome.correction) {
        protocolCorrection = outcome.correction
      }
      if (outcome.terminal) return

      const compacted = await compactIfNeeded(
        session, session.promptContext?.systemInstructions ?? context.persona.instructions,
        this.model, this.compaction, signals.lifecycle.signal, {
          completed: async (result) => {
            await this.event(work, runId, {
              kind: 'model.completed', stage: 'completed', visibility: 'internal',
              data: { purpose: 'compaction', model: result.model, usage: result.usage, latencyMs: result.latencyMs },
            })
          },
          failed: async (error, latencyMs) => {
            await this.event(work, runId, {
              kind: 'model.failed', stage: 'failed', visibility: 'internal',
              data: { purpose: 'compaction', model: this.model.modelId ?? 'unknown', latencyMs, error: errorMessage(error) },
            })
          },
        },
      )
      if (compacted.compacted) {
        await this.event(work, runId, {
          kind: 'session.compacted', stage: 'completed', visibility: 'internal',
          data: { epoch: session.compactionEpoch, ...(compacted.usage ? { usage: compacted.usage } : {}) },
        })
      }
    }

    if (!finalText) throw new Error(`agent exhausted ${this.maxHops} model hops without a final assistant response`)
    const durableText = streamedText.trim()
    if (!durableText) throw new Error('agent produced no durable streamed text')

    const extension = this.policy.finalMessageExtension(durableText, context, { nextPartIndex: nextStreamPartIndex })
    for (const event of extension.events ?? []) {
      await this.event(work, runId, {
        kind: event.kind, stage: 'completed', visibility: 'internal', data: event.data,
      })
    }
    const message: AssistantMessage = {
      version: 2, runId, agentId: work.agentId, sessionId: work.sessionId,
      ...(work.threadId ? { threadId: work.threadId } : {}),
      body: durableText,
      ...(extension.data ? { data: extension.data } : {}),
    }
    await this.host.commitMessage(work, message)
    await this.host.saveSession(work, session)
    await this.event(work, runId, { kind: 'run.completed', stage: 'completed', visibility: 'user', data: {} })
    await this.host.completeWork(work, { status: 'completed', resultText: durableText })
    log.info('run completed')
  }

  private correctionOrThrow(budget: CorrectionBudget, category: 'tool_protocol' | 'kernel_error', content: string): ModelItem {
    return this.correctionOrThrowMessage(budget, category, content, `tool protocol correction exhausted: ${content}`)
  }

  private correctionOrThrowMessage(
    budget: CorrectionBudget,
    category: 'tool_protocol' | 'kernel_error' | 'response_protocol',
    content: string,
    failure: string,
  ): ModelItem {
    if (!budget.consume(category)) throw new Error(failure)
    return { role: 'user', content }
  }

  // -------------------------------------------------------------------------
  // Tool-call execution
  // -------------------------------------------------------------------------

  private async executeCall(
    work: WorkItem,
    runId: string,
    session: SessionRecord,
    call: Extract<ModelItem, { type: 'function_call' }>,
    hop: number,
    signals: AttemptSignals,
    budget: CorrectionBudget,
    streamPartIndex: number,
    capabilities: readonly { name: string; methods?: readonly string[] }[],
  ): Promise<{ nextStreamPartIndex: number; completedHostAction: boolean; terminal: boolean; correction?: ModelItem }> {
    let nextStreamPartIndex = streamPartIndex
    let completedHostAction = false

    let code: string
    try {
      code = parseIPythonArguments(call.arguments).code
    } catch (error) {
      const message = errorMessage(error)
      session.history.push({
        type: 'function_call_output', callId: call.callId,
        output: boundedToolOutput({ error: message, protocolError: true }),
      })
      await this.event(work, runId, {
        kind: 'ipython.failed', stage: 'failed', visibility: 'internal',
        data: { callId: call.callId, error: message, protocolError: true },
      })
      return {
        nextStreamPartIndex, completedHostAction, terminal: false,
        correction: this.correctionOrThrow(budget, 'tool_protocol',
          `Protocol correction: ${message}. Call ipython once with strict JSON containing exactly one non-empty code string.`),
      }
    }

    await this.event(work, runId, {
      kind: 'ipython.started', stage: 'started', visibility: 'internal',
      data: { callId: call.callId, codePreview: code.slice(0, 240) },
    })
    try {
      const cellId = `hop-${hop + 1}`
      const hostToolPartIndices = new Map<string, number>()
      const execution = await this.kernels.execute(work, runId, cellId, code, signals.lifecycle.signal, {
        capabilities,
        onHostAction: async ({ stage, action, result }) => {
          const toolCallId = `host:${action.idempotencyKey}`
          if (stage === 'started') {
            const partIndex = nextStreamPartIndex++
            hostToolPartIndices.set(action.idempotencyKey, partIndex)
            await this.event(work, runId, {
              kind: 'tool.started', stage: 'started', visibility: 'user',
              data: { toolCallId, partIndex, name: action.action, args: action.args },
            })
            return
          }
          const partIndex = hostToolPartIndices.get(action.idempotencyKey)
          if (partIndex === undefined || !result) throw new Error('host action completed without a matching start')
          if (result.ok) completedHostAction = true
          const toolResult = result.approval
            ? { status: 'awaiting-approval', approvalId: result.approval.id }
            : result.ok
              ? { status: 'completed', value: JSON.parse(boundedToolOutput(result.value ?? null)) as unknown }
              : { status: 'failed', error: result.error ?? 'host action failed' }
          await this.event(work, runId, {
            kind: 'tool.completed', stage: result.ok || result.approval ? 'completed' : 'failed', visibility: 'user',
            data: { toolCallId, partIndex, result: toolResult, isError: !result.ok && !result.approval },
          })
        },
      })
      session.history.push({
        type: 'function_call_output', callId: call.callId,
        output: boundedToolOutput({
          stdout: execution.stdout, stderr: execution.stderr, result: execution.result,
          truncated: execution.truncated, artifacts: execution.artifacts,
        }),
      })
      await this.event(work, runId, {
        kind: 'ipython.completed', stage: 'completed', visibility: 'internal',
        data: {
          callId: call.callId, durationMs: execution.durationMs,
          truncated: execution.truncated, artifactCount: execution.artifacts.length,
        },
      })
      const defer = execution.directives.find((directive) => directive.type === 'defer')
      if (defer) {
        await this.host.saveSession(work, session)
        await this.event(work, runId, {
          kind: 'run.completed', stage: 'completed', visibility: 'user',
          data: { deferred: true, ...(defer.reason ? { reason: defer.reason } : {}) },
        })
        await this.host.completeWork(work, { status: 'completed' })
        return { nextStreamPartIndex, completedHostAction, terminal: true }
      }
      return { nextStreamPartIndex, completedHostAction, terminal: false }
    } catch (error) {
      if (error instanceof ApprovalPendingError) {
        await this.event(work, runId, {
          kind: 'approval.pending', stage: 'completed', visibility: 'user',
          data: { approvalId: error.approvalId, cellId: error.cellId },
        })
        session.history.push({
          type: 'function_call_output', callId: call.callId,
          output: boundedToolOutput({ approvalPending: error.approvalId }),
        })
        await this.host.saveSession(work, session)
        await this.host.completeWork(work, { status: 'completed' })
        return { nextStreamPartIndex, completedHostAction, terminal: true }
      }
      if (error instanceof KernelTimeoutError) {
        session.history.push({
          type: 'function_call_output', callId: call.callId,
          output: boundedToolOutput({ error: error.message, kernelRestarted: true }),
        })
        await this.event(work, runId, {
          kind: 'ipython.timeout', stage: 'failed', visibility: 'internal',
          data: { callId: call.callId, timeoutMs: error.timeoutMs },
        })
        return { nextStreamPartIndex, completedHostAction, terminal: false }
      }
      if (error instanceof KernelExecutionError) {
        session.history.push({
          type: 'function_call_output', callId: call.callId,
          output: boundedToolOutput({ error: error.message }),
        })
        await this.event(work, runId, {
          kind: 'ipython.failed', stage: 'failed', visibility: 'internal',
          data: { callId: call.callId, error: error.message, recoverable: budget.has('kernel_error') },
        })
        return {
          nextStreamPartIndex, completedHostAction, terminal: false,
          correction: this.correctionOrThrowMessage(budget, 'kernel_error',
            'The previous Python raised an error. Correct it and retry once; do not repeat the same cell.',
            `kernel correction exhausted: ${error.message}`),
        }
      }
      throw error
    }
  }

  // -------------------------------------------------------------------------
  // Session restore / prompt-context freezing
  // -------------------------------------------------------------------------

  private async restoreSession(work: WorkItem, context: TurnContext): Promise<SessionRecord> {
    const key = sessionKeyOf(work)
    const stored = await this.host.loadSession(work, key)
    const session: SessionRecord = stored ?? {
      key,
      tenantId: work.tenantId,
      agentId: work.agentId,
      sessionId: work.sessionId,
      ...(work.threadId ? { threadId: work.threadId } : {}),
      history: [],
      appliedWorkIds: [],
      revision: 0,
      compactionEpoch: 0,
    }
    session.appliedWorkIds ??= []
    session.compactionEpoch ??= 0

    // A prompt-contract version change invalidates everything derived from it.
    if (session.promptContext && session.promptContext.sourceVersions['promptContract'] !== this.promptContractVersion) {
      session.history = []
      delete session.summary
      session.appliedWorkIds = []
      delete session.promptContext
    }
    const candidate = context.promptContextCandidate
    const sourceVersions = candidate
      ? { ...candidate.sourceVersions, promptContract: this.promptContractVersion }
      : undefined
    if (candidate && (
      !session.promptContext
      || JSON.stringify(Object.entries(session.promptContext.sourceVersions).sort()) !== JSON.stringify(Object.entries(sourceVersions!).sort())
    )) {
      session.promptContext = this.freezePromptContext(candidate, session.compactionEpoch, context)
    }

    if (!session.appliedWorkIds.includes(work.id)) {
      session.history.push(...this.policy.turnInputItems(context, session.history.length > 0))
      if (context.pendingApproval) {
        const approval = context.pendingApproval
        session.history.push({
          role: 'user',
          content: `Approval ${approval.approvalId} was ${approval.approved ? 'approved and executed' : 'rejected'}.`
            + (approval.result !== undefined ? ` Result: ${boundedToolOutput(approval.result)}` : '')
            + (approval.error ? ` Error: ${approval.error}` : ''),
        })
      }
      session.appliedWorkIds = [...session.appliedWorkIds, work.id].slice(-200)
    }
    return session
  }

  private freezePromptContext(candidate: PromptContext, epoch: number, context: TurnContext): PromptContext {
    return {
      ...structuredClone(candidate),
      epoch,
      assembledAt: new Date().toISOString(),
      sourceVersions: { ...candidate.sourceVersions, promptContract: this.promptContractVersion },
      systemInstructions: this.policy.assembleSystemPrompt(candidate, context),
    }
  }

  // -------------------------------------------------------------------------
  // Terminal error handling
  // -------------------------------------------------------------------------

  private async finishWithError(
    work: WorkItem, runId: string, signals: AttemptSignals,
    session: SessionRecord | null, error: unknown,
  ): Promise<void> {
    const log = this.logger.child({ runId })
    if (signals.preemptRequested()) {
      if (session) {
        await this.host.saveSession(work, session).catch((saveError: unknown) => {
          log.error('preemption session save failed', { error: saveError })
        })
      }
      await this.event(work, runId, {
        kind: 'run.preempted', stage: 'cancelled', visibility: 'internal', data: { lane: work.lane },
      }).catch((eventError: unknown) => {
        log.error('preemption event failed', { error: eventError })
      })
      await this.host.yieldWork(work)
      return
    }
    const leaseLost = signals.leaseLost()
    if (leaseLost) {
      // The lease is gone: another worker may already own the work. Log and
      // walk away — no completion call is valid without the lease.
      log.warn('lease lost mid-run', { error: errorMessage(error) })
      return
    }
    const cancelled = signals.lifecycle.signal.aborted
      || error instanceof RunCancelledError
      || error instanceof KernelCancelledError
    const status = cancelled ? 'cancelled' : 'failed'
    await this.event(work, runId, {
      kind: cancelled ? 'run.cancelled' : 'run.failed', stage: status, visibility: 'user',
      data: {
        error: errorMessage(error),
        ...(error instanceof ModelDriverError ? { modelDiagnostics: error.diagnostics } : {}),
      },
    }).catch((eventError: unknown) => {
      log.error('terminal event emission failed', { error: eventError })
    })
    await this.host.completeWork(work, { status, error: errorMessage(error) }).catch((completeError: unknown) => {
      log.error('terminal completion failed', { error: completeError })
    })
  }
}
