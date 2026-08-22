/**
 * Server-side managed executor — dispatches `runAgentTurn()` directly
 * inside the LingxiLoop API process for `managed` agents running the
 * LingxiGraph reasoning runtime, bypassing the per-Agent Kubernetes
 * Pod entirely (see issue #4).
 *
 * This mirrors the busy/pendingRerun coalescing pattern already
 * proven by the Pod runner (runtime/pod-agent.ts), just re-keyed by
 * agentId since a single server process here multiplexes many agents
 * instead of being one-pod-per-agent:
 *
 *   idle + wake         → start turn
 *   busy + wake         → pendingRerun = true; merge turn options
 *   turn finished        → if pendingRerun, reload latest inbox
 *                          (via a fresh runAgentTurn call) and run once more
 *
 * The executor holds no business state itself — Postgres/Redis remain
 * the source of truth; `busy`/`pendingRerun`/`pendingOptions` are pure
 * in-memory dispatch bookkeeping, safe to lose on process restart.
 *
 * MVP constraint: this in-memory state is per-process. Running more
 * than one LingxiLoop API replica with
 * LINGXILOOP_MANAGED_AGENT_EXECUTION=server means each replica keeps
 * its own busy/pendingRerun map, so two replicas could each believe
 * they're the only one running a turn for the same agent and dispatch
 * concurrently. Multi-replica coordination (distributed lock / queue)
 * is out of scope for this issue — see env.ts for the boot-time guard.
 */

import { Semaphore } from '../concurrency.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import {
  getLingxiGraphRun,
  LingxiGraphRequestError,
  type LingxiGraphRunEvent,
  type LingxiGraphSteerResult,
  steerLingxiGraphRun,
  streamLingxiGraphRunEvents,
} from './lingxigraph-adapter.js'
import { resolveMailboxDelivery, type AgentActivation, type MailboxDeliveryPhase } from './mailbox-delivery.js'
import type { AgentTurnOptions } from './turn.js'

type TurnRunner = (agentId: string, options: AgentTurnOptions) => Promise<void>

/** Bounds how many runAgentTurn() calls run at once across this whole
 *  process (all agents, all wake sources — fan-out, poll/kanban wakes,
 *  retries), independent of the fan-out triage gate in scheduler.ts.
 *  See env.MANAGED_TURN_CONCURRENCY. A turn can run for minutes and
 *  holds several pg connections at once, so this is what actually
 *  protects the pool; it must not be conflated with the fan-out
 *  semaphore, which only needs to bound the fast triage/dispatch step
 *  and would otherwise serialize unrelated conversations behind one
 *  another for the full duration of every turn. */
const turnExecutionSem = new Semaphore(env.MANAGED_TURN_CONCURRENCY)

/** Indirection so tests can swap in a fake turn runner without loading
 *  turn.ts (it transitively pulls in DB/Redis/OpenAI clients that
 *  aren't available in a unit-test process). `undefined` means
 *  "use the real runAgentTurn", lazily imported on first call so
 *  merely importing this module never triggers that dependency
 *  chain. */
let turnRunnerOverride: TurnRunner | undefined
let realRunAgentTurn: TurnRunner | undefined

async function getTurnRunner(): Promise<TurnRunner> {
  if (turnRunnerOverride) return turnRunnerOverride
  if (!realRunAgentTurn) {
    ({ runAgentTurn: realRunAgentTurn } = await import('./turn.js'))
  }
  return realRunAgentTurn
}

/** Test-only: replace the turn runner. Call with no args to restore
 *  the real `runAgentTurn`. */
export function _setTurnRunnerForTests(fn?: TurnRunner): void {
  turnRunnerOverride = fn
}

type ManagedRunnerState = {
  busy: boolean
  pendingRerun: boolean
  pendingOptions: AgentTurnOptions | null
  activeRun: { runId: string; loopRunId: string | null; companyId: string | null } | null
  pendingSteers: Map<string, ManagedSteerPayload>
  lastSteeredMessageId: string | null
}

export interface ManagedSteerPayload {
  messageId: string
  conversationId: string
  authorId?: string
  authorName: string
  body: string
  companyId?: string
  authorKind?: 'human' | 'agent' | 'unknown'
  activation?: AgentActivation
  mailboxPhase?: MailboxDeliveryPhase
}

type SteerRunner = typeof steerLingxiGraphRun
let steerRunner: SteerRunner = steerLingxiGraphRun
type ConsumedMarker = (agentId: string, payload: ManagedSteerPayload) => Promise<void>
const defaultConsumedMarker: ConsumedMarker = async (agentId, payload) => {
  const { runtime } = await import('./runtime/select.js')
  await runtime.markConversationRead({
    agentId,
    conversationId: payload.conversationId,
    upToMessageId: payload.messageId,
  })
}
let consumedMarker: ConsumedMarker = defaultConsumedMarker
type ReceiptStore = {
  activate(agentId: string, loopRunId: string, runtimeRunId: string): Promise<void>
  accepted(agentId: string, payload: ManagedSteerPayload, accepted: LingxiGraphSteerResult): Promise<void>
  resolve(agentId: string, eventId: string, status: 'consumed' | 'superseded'): Promise<ManagedSteerPayload | null>
  active(agentId: string, companyId: string | null): Promise<{ loopRunId: string; runtimeRunId: string; companyId: string | null } | null>
}
const pgReceiptStore: ReceiptStore = {
  async activate(agentId, loopRunId, runtimeRunId) {
    await pool.query(
      `UPDATE agent_runs
          SET reasoning_runtime = 'lingxigraph', external_runtime_run_id = $1, updated_at = NOW()
        WHERE id = $2 AND agent_id = $3`,
      [runtimeRunId, loopRunId, agentId],
    )
  },
  async accepted(agentId, payload, accepted) {
    await pool.query(
      `INSERT INTO lingxigraph_steering_receipts
         (message_id, company_id, agent_id, conversation_id, runtime_run_id, steering_event_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (message_id) DO UPDATE SET
         runtime_run_id = EXCLUDED.runtime_run_id,
         steering_event_id = EXCLUDED.steering_event_id,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [payload.messageId, payload.companyId ?? null, agentId, payload.conversationId,
        accepted.runId, accepted.eventId, accepted.status === 'consumed' ? 'consumed' : 'accepted'],
    )
  },
  async resolve(agentId, eventId, status) {
    const { rows } = await pool.query<{
      message_id: string; company_id: string | null; conversation_id: string
    }>(
      `UPDATE lingxigraph_steering_receipts
          SET status = $2, consumed_at = CASE WHEN $2 = 'consumed' THEN NOW() ELSE consumed_at END, updated_at = NOW()
        WHERE steering_event_id = $1 AND agent_id = $3
      RETURNING message_id, company_id, conversation_id`,
      [eventId, status, agentId],
    )
    const row = rows[0]
    return row ? {
      messageId: row.message_id,
      conversationId: row.conversation_id,
      authorName: '', body: '', companyId: row.company_id ?? undefined,
    } : null
  },
  async active(agentId, companyId) {
    const { rows } = await pool.query<{
      id: string; external_runtime_run_id: string; company_id: string | null
    }>(
      `SELECT id, external_runtime_run_id, company_id
         FROM agent_runs
        WHERE agent_id = $1
          AND status = 'running'
          AND reasoning_runtime = 'lingxigraph'
          AND external_runtime_run_id IS NOT NULL
          AND ($2::text IS NULL OR company_id = $2)
        ORDER BY started_at DESC
        LIMIT 1`,
      [agentId, companyId],
    )
    const row = rows[0]
    return row ? { loopRunId: row.id, runtimeRunId: row.external_runtime_run_id, companyId: row.company_id } : null
  },
}
let receiptStore: ReceiptStore = pgReceiptStore
const recoveryMonitors = new Set<string>()
let runLookup = getLingxiGraphRun
let runEventStreamer = streamLingxiGraphRunEvents

function monitorRecoveredRun(agentId: string, state: ManagedRunnerState): void {
  const active = state.activeRun
  if (!active || recoveryMonitors.has(active.runId)) return
  recoveryMonitors.add(active.runId)
  void runEventStreamer(
    active.runId,
    (event) => recordManagedLingxiGraphEvent(agentId, event),
    { url: env.LINGXIGRAPH_URL, token: env.LINGXIGRAPH_TOKEN, tenantId: active.companyId },
  ).catch((error) => {
    console.warn(`[managed-executor] recovered run stream ${active.runId} failed:`,
      error instanceof Error ? error.message : String(error))
  }).finally(() => {
    recoveryMonitors.delete(active.runId)
    if (state.activeRun?.runId !== active.runId) return
    const needsFallback = state.pendingSteers.size > 0
    state.pendingSteers.clear()
    state.activeRun = null
    if (needsFallback) {
      void scheduleManagedAgentTurn(agentId, { trigger: 'message.new' })
    }
  })
}

const runners = new Map<string, ManagedRunnerState>()

function getRunner(agentId: string): ManagedRunnerState {
  let state = runners.get(agentId)
  if (!state) {
    state = { busy: false, pendingRerun: false, pendingOptions: null, activeRun: null, pendingSteers: new Map(), lastSteeredMessageId: null }
    runners.set(agentId, state)
  }
  return state
}

/** Merges a newly-arrived wake's options into whatever's already
 *  pending for this agent. `background_scan` wakes fully replace
 *  (rather than merge into) the pending options, matching the Pod
 *  runner's existing semantics — a background brief shouldn't be
 *  diluted by an unrelated idle/triage note queued earlier. */
function mergeTurnOptions(state: ManagedRunnerState, next: AgentTurnOptions | null): void {
  if (!next || Object.keys(next).length === 0) return
  if (next.trigger === 'background_scan') {
    state.pendingOptions = next
    return
  }
  state.pendingOptions = state.pendingOptions ? { ...state.pendingOptions, ...next } : next
}

/**
 * Schedule a managed-agent turn to run directly in this process.
 *
 * - If the agent is idle, starts a turn immediately.
 * - If the agent is already running a turn, coalesces this wake into
 *   a single pending rerun (never spawns a second concurrent turn for
 *   the same agent).
 * - On turn completion, if a rerun was requested while busy, runs
 *   again immediately with the merged options (which re-reads the
 *   latest inbox from scratch — `runAgentTurn` never caches message
 *   bodies across calls).
 * - A thrown turn always clears `busy` in `finally`, so a crash can't
 *   wedge the agent into permanent busy state.
 */
export async function scheduleManagedAgentTurn(
  agentId: string,
  options: AgentTurnOptions = {},
  steerPayload: ManagedSteerPayload | null = null,
): Promise<void> {
  const state = getRunner(agentId)
  const initialMailbox = steerPayload
    ? resolveMailboxDelivery({
        authorKind: steerPayload.authorKind ?? 'unknown',
        activation: steerPayload.activation,
        targetBusy: state.busy,
      })
    : null
  // Defense in depth: the scheduler normally omits queue-only peers from its
  // recipient list, but the executor also enforces the contract so a direct
  // caller cannot accidentally turn mailbox delivery into work activation.
  if (steerPayload && !initialMailbox?.activate) return

  // Process-restart recovery: the in-memory executor can be idle while a
  // LingxiGraph worker is still running the durable Run. Resolve that mapping
  // from Loop's own agent_runs row, verify status with Runtime, then steer it
  // instead of blindly creating a concurrent replacement turn.
  if (!state.busy && steerPayload) {
    const recovered = await receiptStore.active(agentId, steerPayload.companyId ?? null).catch(() => null)
    if (recovered) {
      try {
        const run = await runLookup(recovered.runtimeRunId, recovered.companyId, {
          url: env.LINGXIGRAPH_URL,
          token: env.LINGXIGRAPH_TOKEN,
        })
        state.lastSteeredMessageId = null
        state.activeRun = { runId: run.id, loopRunId: recovered.loopRunId, companyId: recovered.companyId }
        const acceptsSteering = ['pending', 'running', 'paused', 'cancelling'].includes(run.status) && !run.supersededByRunId
        if (acceptsSteering) {
          state.busy = true
          try {
            await scheduleManagedAgentTurn(agentId, options, steerPayload)
          } finally {
            state.busy = false
          }
          const accepted = state.lastSteeredMessageId === steerPayload.messageId
          if (accepted) {
            monitorRecoveredRun(agentId, state)
            return
          }
        } else {
          // Replay the durable terminal stream once to reconcile any consumed
          // receipts before loadInbox builds the fallback turn.
          await runEventStreamer(run.id, (event) => recordManagedLingxiGraphEvent(agentId, event), {
            url: env.LINGXIGRAPH_URL, token: env.LINGXIGRAPH_TOKEN, tenantId: recovered.companyId,
          }).catch(() => undefined)
        }
      } catch (error) {
        console.warn(`[managed-executor] active-run recovery failed for ${agentId}:`,
          error instanceof Error ? error.message : String(error))
      }
      state.activeRun = null
    }
  }

  if (state.busy) {
    const active = state.activeRun
    const mailbox = steerPayload
      ? resolveMailboxDelivery({
          authorKind: steerPayload.authorKind ?? 'unknown',
          activation: steerPayload.activation,
          targetBusy: true,
        })
      : null
    if (steerPayload && active && mailbox?.steerCurrentTurn) {
      // The run id is sourced only from the executor's active runtime state;
      // no message/user field can select an arbitrary run. The tenant tag
      // must agree as well before anything crosses the Runtime boundary.
      if (active.companyId && steerPayload.companyId && active.companyId !== steerPayload.companyId) {
        console.error(`[managed-executor] refused cross-tenant steer for ${agentId}`)
      } else {
        try {
          const accepted = await steerRunner({
            runId: active.runId,
            kind: 'message.new',
            payload: {
              messageId: steerPayload.messageId,
              conversationId: steerPayload.conversationId,
              authorId: steerPayload.authorId ?? '',
              authorName: steerPayload.authorName,
              body: steerPayload.body,
              mailboxPhase: mailbox.phase,
              activation: steerPayload.activation ?? 'trigger',
            },
            metadata: {
              agentId,
              companyId: steerPayload.companyId ?? active.companyId,
              mailboxPhase: mailbox.phase,
            },
            idempotencyKey: steerPayload.messageId,
          }, {
            url: env.LINGXIGRAPH_URL,
            token: env.LINGXIGRAPH_TOKEN,
          })
          if (accepted.status !== 'consumed' && accepted.status !== 'superseded') {
            state.pendingSteers.set(accepted.eventId, steerPayload)
          }
          await receiptStore.accepted(agentId, steerPayload, accepted).catch((error) =>
            console.warn(`[managed-executor] failed to persist steer receipt ${accepted.eventId}:`,
              error instanceof Error ? error.message : String(error)))
          console.info('[lingxigraph-steer]', JSON.stringify({
            messageId: steerPayload.messageId,
            agentId,
            runId: active.runId,
            steeringEventId: accepted.eventId,
            outcome: accepted.outcome,
            status: accepted.status,
          }))
          if (accepted.status === 'consumed') {
            await consumedMarker(agentId, steerPayload).catch(() => { /* unread is the safe fallback */ })
          } else if (accepted.status === 'superseded') {
            mergeTurnOptions(state, options)
            state.pendingRerun = true
            return
          }
          state.lastSteeredMessageId = steerPayload.messageId
          // Do not also request a fresh turn. The pending message remains in
          // Loop's durable store until run.steer.consumed confirms delivery.
          return
        } catch (error) {
          const code = error instanceof LingxiGraphRequestError ? error.code : 'unknown'
          console.warn(`[managed-executor] steer ${steerPayload.messageId} -> ${active.runId} failed (${code}); falling back to a new turn`)
        }
      }
    }
    mergeTurnOptions(state, options)
    state.pendingRerun = true
    return
  }

  mergeTurnOptions(state, options)

  state.busy = true
  try {
    do {
      state.pendingRerun = false
      const turnOptions = state.pendingOptions ?? {}
      state.pendingOptions = null
      try {
        const run = await getTurnRunner()
        await turnExecutionSem.run(() => run(agentId, turnOptions))
      } catch (err) {
        console.error(`[managed-executor] turn failed for ${agentId}:`,
          err instanceof Error ? err.message : String(err))
      }
    } while (state.pendingRerun)
  } finally {
    state.busy = false
  }
}

/** Called by turn.ts after the trusted Runtime has assigned a run id. */
export async function activateManagedLingxiGraphRun(
  agentId: string,
  runId: string,
  companyId: string | null,
  loopRunId: string | null = null,
): Promise<void> {
  const state = getRunner(agentId)
  if (!state.busy) return
  state.activeRun = { runId, loopRunId, companyId }
  state.pendingSteers.clear()
  state.lastSteeredMessageId = null
  if (loopRunId) {
    await receiptStore.activate(agentId, loopRunId, runId).catch((error) =>
      console.warn(`[managed-executor] failed to persist active Runtime run ${runId}:`,
        error instanceof Error ? error.message : String(error)))
  }
}

/**
 * Project native LingxiGraph steering lifecycle events back onto Loop's
 * communication cursor. accepted is deliberately insufficient: only a
 * durable consumed event proves the graph saw this message.
 */
export function recordManagedLingxiGraphEvent(agentId: string, event: LingxiGraphRunEvent): void {
  const state = runners.get(agentId)
  if (!state?.activeRun || state.activeRun.runId !== event.runId) return
  const eventId = typeof event.data.steering_event_id === 'string'
    ? event.data.steering_event_id
    : typeof event.data.source_event_id === 'string' ? event.data.source_event_id : null
  if (!eventId) return
  if (event.kind === 'run.steer.consumed') {
    const memoryPayload = state.pendingSteers.get(eventId) ?? null
    state.pendingSteers.delete(eventId)
    if (memoryPayload) {
      void consumedMarker(agentId, memoryPayload).catch(() => { /* durable receipt remains recoverable */ })
    }
    void receiptStore.resolve(agentId, eventId, 'consumed').then((storedPayload) => {
      if (!memoryPayload && storedPayload) return consumedMarker(agentId, storedPayload)
      return undefined
    }).catch((error) => {
      // A failed cursor update is safe: the message remains unread and the
      // stable idempotency key makes a later delivery replay harmless.
      console.warn(`[managed-executor] failed to reconcile consumed steer ${eventId}:`,
        error instanceof Error ? error.message : String(error))
    })
  } else if (event.kind === 'run.steer.superseded') {
    state.pendingSteers.delete(eventId)
    void receiptStore.resolve(agentId, eventId, 'superseded').catch(() => { /* next wake retries from message store */ })
    state.pendingRerun = true
  }
}

/** Called in the running turn's finally path before the executor loop settles. */
export function deactivateManagedLingxiGraphRun(agentId: string, runId: string): void {
  const state = runners.get(agentId)
  if (!state?.activeRun || state.activeRun.runId !== runId) return
  // A terminal stream should have classified every accepted steer as either
  // consumed or superseded. Conservatively re-run for anything unresolved.
  if (state.pendingSteers.size > 0) state.pendingRerun = true
  state.pendingSteers.clear()
  state.activeRun = null
}

export function _setSteerRunnerForTests(fn?: SteerRunner): void {
  steerRunner = fn ?? steerLingxiGraphRun
}

export function _setConsumedMarkerForTests(fn?: ConsumedMarker): void {
  consumedMarker = fn ?? defaultConsumedMarker
}

export function _setReceiptStoreForTests(store?: ReceiptStore): void {
  receiptStore = store ?? pgReceiptStore
}

export function _setRuntimeControlForTests(args?: {
  lookup?: typeof getLingxiGraphRun
  stream?: typeof streamLingxiGraphRunEvents
}): void {
  runLookup = args?.lookup ?? getLingxiGraphRun
  runEventStreamer = args?.stream ?? streamLingxiGraphRunEvents
}

/** True while a turn for this agent is in flight in this process.
 *  Test-only / observability helper. */
export function isManagedAgentBusy(agentId: string): boolean {
  return runners.get(agentId)?.busy ?? false
}

/** Test-only reset — clears all in-memory per-agent runner state. */
export function _resetManagedExecutorForTests(): void {
  runners.clear()
  steerRunner = steerLingxiGraphRun
  consumedMarker = defaultConsumedMarker
  receiptStore = pgReceiptStore
  runLookup = getLingxiGraphRun
  runEventStreamer = streamLingxiGraphRunEvents
}
