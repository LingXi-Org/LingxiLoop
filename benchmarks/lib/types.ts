/**
 * Shared types for the lingxiloop multi-agent coordination benchmark suite.
 *
 * A `Scenario` is one game definition. The harness runs N `Trial`s of each
 * scenario, then aggregates into a `BenchmarkResult`. Pass criteria are
 * **statistical** (e.g. "≥3/5 trials reach 8/8"), never per-trial, because
 * the underlying behavior is LLM-judgment-driven and naturally stochastic.
 *
 * See `lib/harness.ts` for the runner and `games/*.ts` for concrete scenarios.
 */

/** Identity of one agent the harness will include in the test convo. The
 *  agent must already exist in the target environment's `participants` table
 *  (the benchmark does NOT create agents — that's an operator concern). */
export interface AgentRef {
  id: string
  /** Optional: skip this agent for a given trial. Useful for the
   *  "absent-member" scenario where we deliberately leave someone out
   *  (e.g. olivia in the chain test). When `absent: true`, the agent is
   *  still listed as a member of the test convo (so freshness/preflight see
   *  the same shape) but we don't expect them to participate; metrics
   *  treat them as offline. */
  absent?: boolean
}

/** A single benchmark scenario. */
export interface Scenario {
  /** Short identifier — used on CLI (`bench:<id>`), in result filenames,
   *  and in CI logs. Must be lowercase, no spaces. */
  id: string
  /** One-sentence description (shown in CLI output + README index). */
  description: string
  /** The agents that participate (or are deliberately absent — see
   *  `AgentRef.absent`). Order is irrelevant; the harness will fan out. */
  agents: AgentRef[]
  /** The HUMAN's seed message body. Whatever this says is what the agents
   *  are reacting to. Keep it natural-language, no embedded instructions
   *  to the harness. */
  seed: string
  /** Optional per-trial setup, run AFTER the convo is created and BEFORE
   *  the seed message is posted. Use for games that need pre-existing DB
   *  state (kanban: create a board + card; werewolf could pre-create role
   *  DMs but doesn't have to). Receives pool + convoId + benchCompany; can
   *  attach arbitrary scratch state to `scratch` for `computeMetrics` to
   *  read later. */
  setupTrial?: (args: {
    pool: import('pg').Pool
    conversationId: string
    benchCompany: string
    benchUser: string
    scratch: Record<string, unknown>
  }) => Promise<void>
  /** Wall-clock timeout for ONE trial. Past this, the trial is recorded
   *  as `timed_out` and metrics computed against partial state. The
   *  harness DOES NOT poll forever; this keeps total CI cost bounded. */
  timeoutMs: number
  /** How many independent trials to run. The pass criterion is over the
   *  full sample, not per-trial. 3 is a sane default for a real-LLM
   *  benchmark; raise to 5 for tighter stat. confidence at 1.67x cost. */
  trials: number
  /** Compute per-trial metrics from the final conversation state. May be
   *  async (games that need DB state — e.g. kanban looking up card column
   *  transitions — query inside this). Called continuously by the harness
   *  during the polling loop (to detect natural termination via the
   *  `complete` field) AND once at the end. Should be idempotent and
   *  side-effect-free. */
  computeMetrics: (ctx: TrialContext) => TrialMetrics | Promise<TrialMetrics>
  /** Pass criterion over all trials' metrics. Returns
   *  `{ pass: true }` if the scenario meets its bar; `{ pass: false,
   *  reason }` otherwise. Examples: "≥60% of trials had `complete=true`",
   *  "median collision count ≤ 1". */
  passCriterion: (allTrialMetrics: TrialMetrics[]) => PassResult
}

/** State the harness hands to `computeMetrics`. */
export interface TrialContext {
  scenario: Scenario
  /** Conversation id created for this trial (`g-<short>`). */
  conversationId: string
  /** All messages posted to the convo, in sequence order. The first one is
   *  always the human seed (author = the human user the benchmark uses
   *  to drive scenarios). Subsequent entries are agent posts. */
  messages: TrialMessage[]
  /** Did the trial reach a "natural" terminal state (scenario-defined) or
   *  did the wall-clock timeout fire first? */
  terminated: 'natural' | 'timeout'
  /** Wall-clock from seed to last message (or to timeout). */
  durationMs: number
  /** Free-form scratch space written by `setupTrial`. Use for game-specific
   *  per-trial state the harness needs to thread through (kanban: board/
   *  card ids; werewolf: assigned role mapping if pre-seeded). */
  scratch?: Record<string, unknown>
  /** Postgres pool — passed through so `computeMetrics` can query game-
   *  specific tables (boards/cards for kanban). The harness manages
   *  lifecycle; do NOT close it from computeMetrics. */
  pool?: import('pg').Pool
}

export interface TrialMessage {
  sequence: number
  authorId: string
  body: string
  kind: 'text' | 'tool' | 'notice' | 'system'
  createdAt: string
}

/** Per-trial output. Scenarios are free to add their own fields; the harness
 *  serializes the whole object to the result file so trends can be tracked
 *  later without re-running. Standard fields are enforced for cross-game
 *  dashboards. */
export interface TrialMetrics {
  /** Did the scenario's "task complete" definition hold at terminal? */
  complete: boolean
  /** How long, wall-clock, from seed to terminal state. */
  durationMs: number
  /** Number of agent posts (excluding the seed). */
  totalPosts: number
  /** Number of UNIQUE participating agents (>=1 post). */
  uniqueContributors: number
  /** Number of detected verbatim-duplicate adjacent posts (= preflight
   *  failure to catch a content-dup). Each game can override what counts
   *  as a "collision" via per-game extension fields below. */
  verbatimCollisions: number
  /** Any per-game extra metrics. Free-form; the harness preserves them. */
  extra?: Record<string, unknown>
}

export interface PassResult {
  pass: boolean
  reason?: string
  /** Optional: numeric score for trend dashboards (e.g. completion rate). */
  score?: number
}

/** Top-level result of running ONE scenario (over its `trials` count). */
export interface BenchmarkResult {
  scenarioId: string
  ranAt: string  // ISO
  lingxiloopVersion: string  // npm package version of the daemon under test
  serverSha: string  // git sha of the lingxiloop server under test
  trials: TrialMetrics[]
  verdict: PassResult
}
