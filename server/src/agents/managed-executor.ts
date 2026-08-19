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
import type { AgentTurnOptions } from './turn.js'

type TurnRunner = (agentId: string, options: AgentTurnOptions) => Promise<void>

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
}

const runners = new Map<string, ManagedRunnerState>()

function getRunner(agentId: string): ManagedRunnerState {
  let state = runners.get(agentId)
  if (!state) {
    state = { busy: false, pendingRerun: false, pendingOptions: null }
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
): Promise<void> {
  const state = getRunner(agentId)
  mergeTurnOptions(state, options)

  if (state.busy) {
    state.pendingRerun = true
    return
  }

  state.busy = true
  try {
    do {
      state.pendingRerun = false
      const turnOptions = state.pendingOptions ?? {}
      state.pendingOptions = null
      try {
        const run = await getTurnRunner()
        await run(agentId, turnOptions)
      } catch (err) {
        console.error(`[managed-executor] turn failed for ${agentId}:`,
          err instanceof Error ? err.message : String(err))
      }
    } while (state.pendingRerun)
  } finally {
    state.busy = false
  }
}

/** True while a turn for this agent is in flight in this process.
 *  Test-only / observability helper. */
export function isManagedAgentBusy(agentId: string): boolean {
  return runners.get(agentId)?.busy ?? false
}

/** Test-only reset — clears all in-memory per-agent runner state. */
export function _resetManagedExecutorForTests(): void {
  runners.clear()
}
