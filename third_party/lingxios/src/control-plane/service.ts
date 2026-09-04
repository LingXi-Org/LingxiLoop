/**
 * ControlPlaneService — transport-independent control-plane logic.
 *
 * The HTTP layer (`http-server.ts`) is a thin adapter over this class, so the
 * full behavior is unit-testable without sockets. Responsibilities:
 *
 * - lease validation on every worker call;
 * - authoritative capability enforcement on host actions (the kernel-side
 *   allowlist is advisory; this check is the security boundary);
 * - the host-action idempotency ledger;
 * - run-event envelope validation, attempt-range fencing, and dedupe;
 * - stream-integrity verification of final assistant messages.
 */
import { createHash } from 'node:crypto'
import { errorMessage } from '../errors.js'
import { nullLogger, type Logger } from '../logging.js'
import type { MetricsRegistry } from '../metrics.js'
import { RUN_SEQUENCE_SPAN } from '../protocol/constants.js'
import type {
  AssistantMessage, HeartbeatResult, HostAction, HostActionResult,
  RunEvent, SessionRecord, TurnContext, WorkCompletion, WorkItem,
} from '../protocol/types.js'
import { sessionKeyOf } from '../protocol/types.js'
import type {
  ActionExecutor, ActionLedgerStore, CapabilityResolver, ContextProvider,
  DeliveryPort, EventStore, SessionStore, WorkStore,
} from './stores.js'
import { isModelItem } from './stores.js'

export interface ControlPlaneDeps {
  work: WorkStore
  sessions: SessionStore
  events: EventStore
  actions: ActionLedgerStore
  contextProvider: ContextProvider
  actionExecutor: ActionExecutor
  capabilityResolver: CapabilityResolver
  delivery: DeliveryPort
  logger?: Logger
  metrics?: MetricsRegistry
}

export class ControlPlaneError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ControlPlaneError'
  }
}

export interface LeaseProof {
  id: string
  fence: number
  leaseToken: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const RUN_STAGES = new Set(['started', 'delta', 'completed', 'failed', 'cancelled'])

export class ControlPlaneService {
  private readonly logger: Logger

  constructor(private readonly deps: ControlPlaneDeps) {
    this.logger = deps.logger ?? nullLogger
  }

  // -------------------------------------------------------------------------
  // Work lifecycle
  // -------------------------------------------------------------------------

  async enqueue(input: Parameters<WorkStore['enqueue']>[0]): Promise<{ id: string; deduplicated: boolean }> {
    for (const [field, value] of Object.entries({
      tenantId: input.tenantId, agentId: input.agentId, sessionId: input.sessionId,
      kind: input.kind, lane: input.lane, triggerRef: input.triggerRef,
    })) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new ControlPlaneError(400, `enqueue requires a non-empty ${field}`)
      }
    }
    const result = await this.deps.work.enqueue(input)
    this.deps.metrics?.counter('agentos_work_enqueued_total', 'Work items enqueued').inc({ kind: input.kind, lane: input.lane })
    return result
  }

  async claim(workerId: string): Promise<WorkItem | null> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workerId)) {
      throw new ControlPlaneError(400, 'workerId must be 1-128 safe identifier characters')
    }
    const work = await this.deps.work.claim(workerId)
    if (work) {
      this.deps.metrics?.counter('agentos_work_claimed_total', 'Work items claimed').inc({ lane: work.lane })
    }
    return work
  }

  private async requireLease(proof: LeaseProof, options: { rejectCancelled?: boolean } = {}): Promise<Omit<WorkItem, 'leaseToken'>> {
    if (!proof.id || !Number.isSafeInteger(proof.fence) || !proof.leaseToken) {
      throw new ControlPlaneError(400, 'work lease proof required')
    }
    const leased = await this.deps.work.getLeased(proof.id, proof.fence, hashToken(proof.leaseToken))
    if (!leased) throw new ControlPlaneError(409, 'work lease lost or expired')
    if (options.rejectCancelled && leased.cancelRequested) {
      throw new ControlPlaneError(409, 'work is cancelled; no further actions are permitted')
    }
    return leased.work
  }

  async heartbeat(proof: LeaseProof): Promise<HeartbeatResult> {
    const row = await this.deps.work.heartbeat(proof.id, proof.fence, hashToken(proof.leaseToken))
    if (!row) return { ok: false }
    return {
      ok: true,
      cancelRequested: row.cancelRequested,
      preemptRequested: row.preemptRequested,
      steer: row.steer,
    }
  }

  async yieldWork(proof: LeaseProof): Promise<void> {
    const ok = await this.deps.work.yieldWork(proof.id, proof.fence, hashToken(proof.leaseToken))
    if (!ok) throw new ControlPlaneError(409, 'work is no longer yieldable')
  }

  async complete(proof: LeaseProof, completion: WorkCompletion): Promise<void> {
    if (!['completed', 'failed', 'cancelled'].includes(completion.status)) {
      throw new ControlPlaneError(400, 'invalid completion status')
    }
    const ok = await this.deps.work.complete(proof.id, proof.fence, hashToken(proof.leaseToken), completion)
    if (!ok) throw new ControlPlaneError(409, 'work lease lost before completion')
    this.deps.metrics?.counter('agentos_work_completed_total', 'Work attempts finished').inc({ status: completion.status })
  }

  async requestCancel(id: string): Promise<boolean> { return this.deps.work.requestCancel(id) }
  async requestPreempt(id: string): Promise<boolean> { return this.deps.work.requestPreempt(id) }
  async addSteer(id: string, text: string): Promise<boolean> {
    if (typeof text !== 'string' || !text.trim() || text.length > 8_000) {
      throw new ControlPlaneError(400, 'steer text must be a non-empty string of at most 8000 characters')
    }
    return this.deps.work.addSteer(id, text)
  }

  // -------------------------------------------------------------------------
  // Context
  // -------------------------------------------------------------------------

  async loadContext(proof: LeaseProof): Promise<TurnContext> {
    const work = await this.requireLease(proof)
    const context = await this.deps.contextProvider.loadContext(work)
    return { work: { ...work, leaseToken: proof.leaseToken }, ...context }
  }

  // -------------------------------------------------------------------------
  // Host actions: grant enforcement + idempotency ledger
  // -------------------------------------------------------------------------

  async executeAction(proof: LeaseProof, action: HostAction): Promise<HostActionResult> {
    const work = await this.requireLease(proof, { rejectCancelled: true })
    if (
      !action || typeof action !== 'object'
      || typeof action.action !== 'string'
      || typeof action.idempotencyKey !== 'string'
      || !action.idempotencyKey
      || action.runId !== work.id
      || !action.args || typeof action.args !== 'object' || Array.isArray(action.args)
    ) {
      throw new ControlPlaneError(400, 'invalid host action envelope')
    }
    const [namespace, method, ...rest] = action.action.split('.')
    if (!namespace || !method || rest.length > 0) {
      throw new ControlPlaneError(400, 'host action must be <namespace>.<method>')
    }

    // Authoritative capability check. The kernel-side allowlist only shapes
    // what the model can conveniently express; this is the boundary.
    const grants = await this.deps.capabilityResolver.resolve(work)
    const grant = grants.find((candidate) => candidate.name === namespace)
    if (!grant || (grant.methods && !grant.methods.includes(method))) {
      this.deps.metrics?.counter('agentos_actions_denied_total', 'Host actions denied by grant').inc({ namespace })
      return { ok: false, error: `capability denied: ${action.action} is not granted to this work item` }
    }

    // Idempotency: at-least-once delivery, at-most-once effect.
    const replayed = await this.deps.actions.find(action.idempotencyKey)
    if (replayed) {
      this.deps.metrics?.counter('agentos_actions_replayed_total', 'Host actions served from the ledger').inc({ namespace })
      return replayed
    }
    let result: HostActionResult
    try {
      result = await this.deps.actionExecutor.execute({ ...work, leaseToken: proof.leaseToken }, action)
    } catch (error) {
      result = { ok: false, error: errorMessage(error) }
    }
    const recorded = await this.deps.actions.record(action.idempotencyKey, result)
    this.deps.metrics?.counter('agentos_actions_executed_total', 'Host actions executed').inc({
      namespace, ok: String(recorded.ok),
    })
    return recorded
  }

  // -------------------------------------------------------------------------
  // Run events
  // -------------------------------------------------------------------------

  async recordEvent(proof: LeaseProof, event: RunEvent): Promise<void> {
    const work = await this.requireLease(proof)
    if (
      !event || typeof event !== 'object'
      || event.runId !== work.id
      || !Number.isSafeInteger(event.seq)
      || typeof event.kind !== 'string' || !event.kind || event.kind.length > 160
      || !RUN_STAGES.has(event.stage)
      || (event.visibility !== 'user' && event.visibility !== 'internal')
      || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)
    ) {
      throw new ControlPlaneError(400, 'invalid run event envelope')
    }
    // Attempt-range fencing: an event must land inside its own attempt's
    // sequence range so retried attempts can never shadow one another.
    const rangeStart = Math.max(0, work.fence - 1) * RUN_SEQUENCE_SPAN
    const rangeEnd = work.fence * RUN_SEQUENCE_SPAN
    if (event.seq <= rangeStart || event.seq > rangeEnd) {
      throw new ControlPlaneError(400, `event seq ${event.seq} is outside this attempt's range (${rangeStart}, ${rangeEnd}]`)
    }
    const inserted = await this.deps.events.append({
      ...event,
      tenantId: work.tenantId,
      agentId: work.agentId,
      recordedAt: new Date().toISOString(),
    })
    if (!inserted) return // duplicate delivery of an already-recorded event
    this.deps.metrics?.counter('agentos_events_recorded_total', 'Run events recorded').inc({ kind: event.kind })
    try {
      await this.deps.delivery.onEvent(work, event)
    } catch (error) {
      // Delivery is best-effort fan-out; the durable ledger already has the
      // event, so a delivery hiccup must not fail the worker's call.
      this.logger.warn('event delivery failed', { runId: event.runId, seq: event.seq, error: errorMessage(error) })
    }
  }

  // -------------------------------------------------------------------------
  // Final messages: stream-integrity verification
  // -------------------------------------------------------------------------

  async commitMessage(proof: LeaseProof, message: AssistantMessage): Promise<void> {
    const work = await this.requireLease(proof)
    if (
      !message || typeof message !== 'object'
      || message.runId !== work.id
      || message.agentId !== work.agentId
      || message.sessionId !== work.sessionId
      || typeof message.body !== 'string' || !message.body.trim()
    ) {
      throw new ControlPlaneError(409, 'assistant message is missing its stream identity or body')
    }
    const rangeStart = Math.max(0, work.fence - 1) * RUN_SEQUENCE_SPAN
    const rangeEnd = work.fence * RUN_SEQUENCE_SPAN
    const streamEvents = await this.deps.events.listRange(
      work.id, rangeStart, rangeEnd, ['model.delta', 'model.completed'],
    )
    const streamed = streamEvents
      .filter((event) => event.kind === 'model.delta'
        && event.data['partType'] === 'text' && typeof event.data['delta'] === 'string')
      .map((event) => String(event.data['delta']))
      .join('')
      .trim()
    const completedTurns = streamEvents.filter((event) => event.kind === 'model.completed')
    if (!streamed || completedTurns.length === 0 || streamed !== message.body.trim()) {
      throw new ControlPlaneError(409, 'assistant final message does not match its durably streamed deltas')
    }
    await this.deps.delivery.deliverMessage(work, message)
    this.deps.metrics?.counter('agentos_messages_delivered_total', 'Final assistant messages delivered').inc()
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  async getSession(key: string): Promise<SessionRecord | null> {
    return this.deps.sessions.get(key)
  }

  async saveSession(proof: LeaseProof, session: SessionRecord): Promise<{ revision: number }> {
    const work = await this.requireLease(proof)
    const expectedKey = sessionKeyOf(work)
    if (
      !session || typeof session !== 'object'
      || session.key !== expectedKey
      || !Array.isArray(session.history)
      || !session.history.every(isModelItem)
      || !Number.isSafeInteger(session.revision) || session.revision < 0
      || !Number.isSafeInteger(session.compactionEpoch) || session.compactionEpoch < 0
      || !Array.isArray(session.appliedWorkIds)
      || !session.appliedWorkIds.every((id) => typeof id === 'string')
    ) {
      throw new ControlPlaneError(400, 'invalid session record for this work lease')
    }
    const saved = await this.deps.sessions.save(session)
    if (!saved.ok) throw new ControlPlaneError(409, 'session revision conflict')
    return { revision: saved.revision }
  }
}
