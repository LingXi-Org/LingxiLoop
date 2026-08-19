/**
 * Mid-turn "steering" queue. The agent's pod is single-threaded — one
 * turn runs at a time — so a user message that arrives during a long
 * hop sequence used to be invisible until the turn finished and the
 * scheduler woke the agent again. For long-running turns (multi-step
 * tool calls, big diffs, slow LLM) that delay was felt as "the agent
 * isn't listening."
 *
 * Design — mirrors OpenAI Codex's steering pattern, adapted for our
 * Responses-API hop loop:
 *
 *  - **Inter-hop injection, not stream cancel.** New user messages
 *    arrive via the wake-bus as steer events and land in the queue
 *    here. The currently-running LLM stream + any in-flight tool
 *    call are NOT disturbed — they finish and write their
 *    `function_call` / `function_call_output` pair normally. At the
 *    hop boundary in turn.ts we drain this queue and append the
 *    steered items to history. Result: `function_call ↔
 *    function_call_output` pairing in history is never broken by
 *    construction.
 *  - **Auto-batching.** Per-message drains would let a busy group
 *    chat flood the context window. We hold incoming items in a
 *    fixed-window debounce buffer (DEBOUNCE_MS from the FIRST item;
 *    later items in the same window pile in but don't extend the
 *    deadline). The hop-loop's drain check returns false until the
 *    window elapses, so multiple messages naturally merge into one
 *    batch.
 *  - **Summarization threshold.** Small batches (≤
 *    SUMMARIZE_THRESHOLD raw items) are spliced verbatim — preserves
 *    nuance, no extra LLM cost. Larger batches go through the same
 *    cheap-model summarizer the auto-compaction path uses.
 *  - **Hard cap.** MAX_BATCHES_PER_TURN bounds the total number of
 *    steering injections per turn so an indefinite chat firefight
 *    can't blow the context. Excess steers stay in the messages
 *    table and get picked up by the next wake.
 *
 *  This module is **state-only** — pure functions over a module-level
 *  Map. Pure makes it directly unit-testable; module-level Map is
 *  fine because the agent pod is single-process and per-agent
 *  serialization is enforced by pod-agent.ts's drain mutex. The
 *  lingxiloop-server uses the inproc runtime for tests where multiple
 *  agents share one process, but per-agent state still doesn't
 *  collide because each agentId gets its own bucket.
 */
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs'
import { env } from '../env.js'

/** One queued steer — wraps the raw message body with the metadata
 *  the summarizer / dedup paths need. Filled in by the SSE handler in
 *  pod-agent.ts based on the wake-bus payload. */
export interface SteerItem {
  /** messages.id — used for dedup so loadInbox on the NEXT turn
   *  doesn't show this message a second time. */
  messageId: string
  /** Which conversation the message came from. Mentioned to the
   *  model so it can disambiguate when steers cross conversations. */
  conversationId: string
  /** The author's display name (or @-handle) — fed verbatim into the
   *  rendered steer prefix so the model knows who said what. */
  authorName: string
  /** The message body. NOT trimmed here — we'll trim at drain time
   *  if needed for the summarizer budget. */
  body: string
  /** Date.now() at the time the steer was pushed. Drives the
   *  debounce window. */
  arrivedAt: number
}

/** Per-agent steering state. Kept tiny on purpose — the queue, when
 *  the current batch may drain, and how many batches we've consumed
 *  this turn. Reset between turns via {@link resetSteerForAgent}. */
interface AgentSteerState {
  queue: SteerItem[]
  /** Parallel set of messageIds currently in `queue`, kept in sync on
   *  push + drain. Replaces the previous O(n) `queue.some()` dedup
   *  check — at MAX_QUEUE_ITEMS=100 the linear scan was 100 string
   *  comparisons per push in the worst case. */
  queuedIds: Set<string>
  /** Wall-clock at which the current batch becomes drainable
   *  (== arrivedAt of the FIRST item + DEBOUNCE_MS). Reset to 0 when
   *  the queue is empty. */
  batchReadyAt: number
  /** Count of drained batches in the current turn. Bumped by
   *  {@link drainSteer}; checked by {@link canDrainSteer} against
   *  MAX_BATCHES_PER_TURN. */
  batchesDrainedThisTurn: number
  /** Cumulative body-bytes drained in the current turn. Bumped by
   *  the caller (turn.ts) via recordSteerBytes after each drain
   *  renders. Checked by canDrainSteer against MAX_BYTES_PER_TURN
   *  — exceeding this stops further drains for THIS turn. Reset on
   *  resetSteerForAgent. */
  bytesDrainedThisTurn: number
}

const state = new Map<string, AgentSteerState>()

// ── mid-tool interrupt registry ────────────────────────────────────────
//
// Steering only injects at hop boundaries by design (so we never break
// `function_call ↔ function_call_output` pairing). But a single tool
// call — `yt-dlp` ripping a long video, `ffmpeg` transcoding, an
// `opencli browser` flow that's stuck on a network read — can run for
// minutes without a hop boundary, leaving the user staring at a silent
// agent.
//
// To fix that, turn.ts registers an `AbortController` for every tool
// batch it dispatches. When pushSteer notices a registration that's
// older than INTERRUPT_AFTER_MS, it fires `abort()`. The bash tool
// (currently the only abortable one — see tBash) kills its child,
// returns `aborted: true`, and the hop loop drains the steer
// immediately instead of waiting for the next natural hop boundary.
//
// The registry is module-local + per-agent: a single pod runs one
// turn at a time, so at most one batch is ever active per agentId.
interface ActiveToolBatch {
  controller: AbortController
  startedAt: number
  /** Names of the tools in this batch — used purely for observability /
   *  logging when we decide to abort. */
  toolNames: string[]
  /** Has the abort actually been fired? Idempotent guard so a burst of
   *  steer messages doesn't call `controller.abort()` repeatedly. */
  aborted: boolean
}
const activeToolBatches = new Map<string, ActiveToolBatch>()

/** Minimum age (ms) a tool batch has to reach before a steer is
 *  allowed to abort it. Short tool calls (set_turn_status, fast
 *  read_file) finish in <1s; aborting them on every steer would mean
 *  the steer message races the tool — sometimes wins, sometimes
 *  doesn't, behavior depends on scheduling. With a positive floor the
 *  fast path is always "tool finishes → hop drains steer normally"
 *  and only genuinely-slow tools get the abort treatment.
 *
 *  Sourced from env so ops can tune without a redeploy. Default 20s
 *  comfortably covers fast LLM hops + quick tool calls while still
 *  leaving 3× headroom before the UI's 5-min stalled badge fires. */
function interruptAfterMs(): number {
  const raw = Number(process.env.STEER_INTERRUPT_AFTER_MS)
  if (!Number.isFinite(raw) || raw < 0) return 20_000
  return raw
}

/** Called from turn.ts before kicking off a tool batch. */
export function registerActiveToolBatch(
  agentId: string,
  controller: AbortController,
  toolNames: string[],
): void {
  activeToolBatches.set(agentId, {
    controller,
    startedAt: Date.now(),
    toolNames,
    aborted: false,
  })
}

/** Called from turn.ts when a tool batch finishes (success, failure,
 *  or abort) so the next batch starts with a clean slate. */
export function clearActiveToolBatch(agentId: string): void {
  activeToolBatches.delete(agentId)
}

/** Test-only inspection. */
export function _peekActiveToolBatchForTests(agentId: string): {
  ageMs: number
  toolNames: string[]
  aborted: boolean
} | null {
  const b = activeToolBatches.get(agentId)
  return b ? { ageMs: Date.now() - b.startedAt, toolNames: b.toolNames, aborted: b.aborted } : null
}

// ── tunable knobs ──────────────────────────────────────────────────────

/** Fixed-window debounce: after the first item arrives, wait this
 *  long before letting the hop loop drain. Subsequent items inside
 *  the window pile into the same batch but do NOT extend the
 *  deadline — a busy chat would otherwise starve drain forever. */
export const DEBOUNCE_MS = 1500

/** Batches up to this many raw items are spliced verbatim into
 *  history. Larger batches go through the summarizer. Picked low (3)
 *  because the common case is "user clarifies / corrects in 1–2
 *  follow-ups" and the agent benefits from exact wording. */
export const SUMMARIZE_THRESHOLD = 3

/** Total steer drains permitted in one turn. Excess steers stay
 *  in the messages table and surface on the next wake. Picked at 8
 *  so a 200-hop turn can absorb up to 8 mid-flight corrections
 *  without context bloat. */
export const MAX_BATCHES_PER_TURN = 8

/** Per-message body cap. Anything longer is truncated with a marker;
 *  the original is still in the messages table so the agent can
 *  re-read it via a tool if needed. Without this, a 5MB pasted file
 *  in a chat message would blow the prompt budget on a single
 *  steer. */
export const MAX_BODY_BYTES = 4096

/** Hard ceiling on queue length. Beyond this we FIFO-evict — the
 *  oldest queued items get dropped (they're still in the messages
 *  table; next wake re-surfaces them). Without this a chat firefight
 *  during a slow tool call could grow the queue without bound. */
export const MAX_QUEUE_ITEMS = 100

/** Maximum items rendered into a SINGLE batch — even with the
 *  summarizer, a 100-item batch produces a huge summarizer input.
 *  When the queue is larger, drainSteer returns the OLDEST N items
 *  and leaves the rest for the next drain. Picked at 30 (10× the
 *  summarize threshold) — wide enough that drains rarely split, low
 *  enough that summarizer input stays manageable. */
export const MAX_ITEMS_PER_DRAIN = 30

/** Hard cap on the cumulative steered-body bytes per turn. Even with
 *  all the other caps, a worst-case turn could in theory drain
 *  MAX_BATCHES_PER_TURN (8) × MAX_ITEMS_PER_DRAIN (30) ×
 *  MAX_BODY_BYTES (4KB) = 960KB into a single agent's history.
 *  Picked at 64KB so a "steering attack" can't burn arbitrary
 *  amounts of model context. Tracked via {@link recordSteerBytes};
 *  {@link canDrainSteer} returns false once exceeded. */
export const MAX_BYTES_PER_TURN = 64 * 1024

// ── why this queue is intentionally NOT persisted ──────────────────────
//
// The queue lives only in process memory. A pod crash mid-turn loses
// every in-flight steer. That sounds bad — but the design is correct:
//
// 1. Every steered message is ALREADY in the `messages` table
//    BEFORE the steer event publishes (the scheduler.wake() path
//    writes to DB first, then publishes). So the message is durable.
// 2. On pod restart, the pod's SSE re-attach kicks `void drain()`
//    unconditionally. drain() → runAgentTurn → loadInbox reads every
//    unread message via the conversation_reads cursor (which is also
//    in DB). Anything not yet processed surfaces; anything already
//    processed has its cursor advanced and is skipped.
// 3. So "lost queue" only loses the LATENCY OPTIMIZATION of mid-turn
//    injection. The message itself reaches the agent on the very next
//    turn — exactly as it would have pre-steering. Worst case: ~one
//    turn of extra latency, which is the steady-state for any agent
//    that wasn't actively running a turn anyway.
//
// Adding Redis persistence would:
//  - introduce a new failure mode (pod restart → replay of already-
//    consumed steers → potential duplicate processing if the cursor
//    update raced with the persist)
//  - require extra Redis I/O on every push (hot path)
//  - solve a problem that the inbox + cursor already self-heals
//
// If you find yourself wanting to add persistence here, first answer:
// "what user-visible outcome differs from the inbox-based recovery?"
// In our model the answer is "nothing observable" — and that means
// the right call is to NOT add the complexity.

// ── push / drain API ───────────────────────────────────────────────────

/** Enqueue a steer for the given agent. First item sets the debounce
 *  deadline; subsequent items within the window join the batch but
 *  don't extend it. Idempotent on messageId — duplicate pushes (e.g.
 *  retried Redis delivery) are silently coalesced. */
export function pushSteer(agentId: string, item: SteerItem): void {
  // Emergency disable: STEER_ENABLED=false in env makes pushSteer a
  // no-op. The pod still receives steer SSE events but discards them;
  // the message remains in the DB and surfaces normally on the next
  // wake. Use this to disable steering without a redeploy if an
  // incident emerges in prod.
  if (!env.STEER_ENABLED) return
  if (!agentId || !item.messageId) return
  const cur = state.get(agentId) ?? newAgentState()
  // Idempotency: if this exact messageId is already in the queue,
  // drop the duplicate. The wake-bus delivers via Redis pub/sub which
  // is at-most-once on disconnect, but if the server retries during a
  // pod reconnect we could see the same id twice. Set lookup is O(1)
  // vs. queue.some() which was O(n).
  if (cur.queuedIds.has(item.messageId)) return

  // Bound the per-message body so a pasted-megabyte chat message
  // doesn't blow a single prompt. Truncation marker preserves the
  // signal "there is more"; the full body is still in the messages
  // table.
  const body = item.body.length > MAX_BODY_BYTES
    ? item.body.slice(0, MAX_BODY_BYTES) + '... [truncated]'
    : item.body
  const safeItem: SteerItem = body === item.body ? item : { ...item, body }

  // FIFO eviction: keep newest, drop oldest. Anything evicted is
  // still in the messages table; the next wake's loadInbox surfaces
  // it (modulo the conversation_reads cursor we advance at turn end,
  // which only applies to messages we ACTUALLY drained).
  if (cur.queue.length >= MAX_QUEUE_ITEMS) {
    const evicted = cur.queue.shift()
    if (evicted) cur.queuedIds.delete(evicted.messageId)
  }

  if (cur.queue.length === 0) cur.batchReadyAt = item.arrivedAt + DEBOUNCE_MS
  cur.queue.push(safeItem)
  cur.queuedIds.add(safeItem.messageId)
  state.set(agentId, cur)

  // Mid-tool interrupt: if there's an active tool batch that's been
  // running longer than the interrupt floor, abort it now. The bash
  // tool kills its child and returns `aborted: true`; turn.ts then
  // drains this steer immediately on the next iteration instead of
  // waiting for the (potentially distant) next natural hop boundary.
  //
  // Idempotent on `aborted` so a flurry of steers in the same batch
  // window only fires controller.abort() once.
  const active = activeToolBatches.get(agentId)
  if (active && !active.aborted) {
    const ageMs = Date.now() - active.startedAt
    if (ageMs >= interruptAfterMs()) {
      active.aborted = true
      try {
        active.controller.abort()
      } catch (err) {
        console.warn(`[steer] active-tool abort for ${agentId} failed:`,
          err instanceof Error ? err.message : err)
      }
    }
  }
}

/** True iff the agent has a batch ready for the hop loop to drain.
 *  Two gates: (1) queue non-empty AND debounce window elapsed, (2)
 *  haven't hit MAX_BATCHES_PER_TURN. */
export function canDrainSteer(agentId: string, now: number = Date.now()): boolean {
  const cur = state.get(agentId)
  if (!cur || cur.queue.length === 0) return false
  if (cur.batchesDrainedThisTurn >= MAX_BATCHES_PER_TURN) return false
  if (cur.bytesDrainedThisTurn >= MAX_BYTES_PER_TURN) return false
  return now >= cur.batchReadyAt
}

/** Bump the per-turn byte counter after a drain renders. Called from
 *  turn.ts after each successful drain — the caller knows the actual
 *  rendered text length, which is what bounds the model's context
 *  exposure (raw bodies + framing). Returns the new total. */
export function recordSteerBytes(agentId: string, bytes: number): number {
  const cur = state.get(agentId)
  if (!cur) return 0
  cur.bytesDrainedThisTurn += Math.max(0, bytes)
  return cur.bytesDrainedThisTurn
}

/** True iff the agent has hit MAX_BYTES_PER_TURN — used by turn.ts
 *  to emit an observability event when the cap trips. */
export function isSteerByteBudgetExhausted(agentId: string): boolean {
  const cur = state.get(agentId)
  return cur ? cur.bytesDrainedThisTurn >= MAX_BYTES_PER_TURN : false
}

/** Drain the current batch — returns the queued items in FIFO order
 *  and resets the queue. Bumps `batchesDrainedThisTurn`. Returns
 *  `null` (not `[]`) if there's nothing drainable, so the caller can
 *  cleanly distinguish "no steer this hop" from "empty batch
 *  somehow." Callers MUST check {@link canDrainSteer} first — drain
 *  doesn't re-check the gates. */
export function drainSteer(agentId: string, now: number = Date.now()): SteerItem[] | null {
  const cur = state.get(agentId)
  if (!cur || cur.queue.length === 0) return null
  // Defensive runtime check: callers MUST gate on canDrainSteer first
  // (docstring contract). If they don't, debounce semantics are
  // violated and a 1-message-arrival could drain mid-typing. Warn
  // loudly and refuse to drain rather than silently corrupting
  // behavior. The `> readyAt` gate matches canDrainSteer's `>=`
  // logic — same now-value would pass canDrainSteer.
  if (now < cur.batchReadyAt) {
    console.warn(`[steer] drainSteer(${agentId}) called before debounce elapsed — refusing to drain`)
    return null
  }
  if (cur.batchesDrainedThisTurn >= MAX_BATCHES_PER_TURN) {
    console.warn(`[steer] drainSteer(${agentId}) called past MAX_BATCHES_PER_TURN — refusing to drain`)
    return null
  }
  if (cur.bytesDrainedThisTurn >= MAX_BYTES_PER_TURN) {
    console.warn(`[steer] drainSteer(${agentId}) called past MAX_BYTES_PER_TURN — refusing to drain`)
    return null
  }
  // Cap per-drain size — if the queue is huge, take the OLDEST
  // MAX_ITEMS_PER_DRAIN (FIFO) and leave the rest for the next
  // drain. Older-first preserves causal ordering: the agent sees
  // "user said A, then B, then C" rather than "B, A, C" if a single
  // hop boundary happened to coincide with a burst.
  const out = cur.queue.slice(0, MAX_ITEMS_PER_DRAIN)
  cur.queue = cur.queue.slice(MAX_ITEMS_PER_DRAIN)
  for (const item of out) cur.queuedIds.delete(item.messageId)
  // batchReadyAt = 0 means "drainable immediately" (any `now` value
  // passes the `now >= readyAt` gate). Whether leftover items
  // exist or not, the *next* drain should not be gated by another
  // debounce window — debounce is per-batch-entry, and the leftover
  // is by definition past its original debounce.
  cur.batchReadyAt = 0
  cur.batchesDrainedThisTurn += 1
  state.set(agentId, cur)
  return out
}

/** Discard ALL state for an agent. Called at turn start (in case the
 *  previous turn ended with a stale partial batch) and turn end. Pod
 *  shutdown also calls this implicitly via process exit. Also clears
 *  any lingering active-tool registration so the next turn starts
 *  fresh — turn.ts should always pair register/clear, but a crash
 *  between them would leak a stale controller without this. */
export function resetSteerForAgent(agentId: string): void {
  state.delete(agentId)
  activeToolBatches.delete(agentId)
}

/** True iff the agent has hit MAX_BATCHES_PER_TURN — callers can use
 *  this to emit a `turn.steer_saturated` event the first time the cap
 *  trips so we can see it in observability. */
export function isSteerSaturated(agentId: string): boolean {
  const cur = state.get(agentId)
  return cur ? cur.batchesDrainedThisTurn >= MAX_BATCHES_PER_TURN : false
}

// ── test-only inspection (NOT exported via index — module-local) ──────

/** Test-only: peek at internal state. Production code must never call
 *  this; the prefix `_` plus the documented test-only role keeps it
 *  out of normal autocomplete. */
export function _peekSteerStateForTests(agentId: string): {
  queueLength: number
  batchReadyAt: number
  batchesDrainedThisTurn: number
  bytesDrainedThisTurn: number
} | null {
  const cur = state.get(agentId)
  if (!cur) return null
  return {
    queueLength: cur.queue.length,
    batchReadyAt: cur.batchReadyAt,
    batchesDrainedThisTurn: cur.batchesDrainedThisTurn,
    bytesDrainedThisTurn: cur.bytesDrainedThisTurn,
  }
}

/** Test-only: reset every agent's state. Production must never call. */
export function _resetAllSteerForTests(): void {
  state.clear()
  activeToolBatches.clear()
}

// ── helpers ────────────────────────────────────────────────────────────

function newAgentState(): AgentSteerState {
  return { queue: [], queuedIds: new Set(), batchReadyAt: 0, batchesDrainedThisTurn: 0, bytesDrainedThisTurn: 0 }
}

// `ResponseInputItem` is imported so callers can stay aligned with
// turn.ts's types when they translate SteerItem → ResponseInputItem at
// drain time. The render itself lives in turn.ts (it needs access to
// the summarizer LLM client).
export type { ResponseInputItem }
