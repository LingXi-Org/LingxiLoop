/**
 * Core protocol types shared by the control plane, workers, kernels, and
 * extensions. This module is intentionally logic-free: every layer depends on
 * it and it depends on nothing.
 */

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

/**
 * Why a work item exists. `turn` is the ordinary conversational turn handled
 * by the runtime's agent loop; every other kind is routed to a registered
 * {@link import('../runtime/runtime.js').WorkProcessor}.
 */
export type WorkKind = 'turn' | 'resume' | (string & {})

/** Scheduling lane. Higher lanes are claimed before lower ones. */
export type WorkLane = 'interactive' | 'approval' | 'collaboration' | 'background'

export const WORK_LANE_PRIORITY: Readonly<Record<WorkLane, number>> = Object.freeze({
  interactive: 4,
  approval: 3,
  collaboration: 2,
  background: 1,
})

export type WorkStatus = 'queued' | 'leased' | 'completed' | 'failed' | 'cancelled'

/**
 * A durable unit of agent work, claimed under a fenced lease.
 *
 * Invariants:
 * - `fence` increases by exactly one on every lease acquisition and every
 *   yield, and never decreases. Every mutating control-plane call carries
 *   `(id, fence, leaseToken)` and is rejected unless all three match the
 *   current lease.
 * - `id` doubles as the run id: a retried attempt reuses every externally
 *   visible identity, and attempt separation happens through the fence-scoped
 *   event-sequence ranges (see `RUN_SEQUENCE_SPAN`).
 */
export interface WorkItem {
  id: string
  fence: number
  /**
   * Increments when the session is re-routed to a different worker, so a
   * kernel filesystem home written by a lost worker is never reused.
   */
  homeEpoch: number
  tenantId: string
  agentId: string
  sessionId: string
  /** Optional sub-thread inside the session. */
  threadId?: string
  kind: WorkKind
  lane: WorkLane
  /** Opaque reference to whatever triggered this work (message id, cron id…). */
  triggerRef: string
  /** Human principal whose authorization the work runs under, if any. */
  principalId?: string
  createdAt?: string
  availableAt?: string
  attempts?: number
  preemptions?: number
  /** Bearer proof of the current lease. Never persisted in clear text. */
  leaseToken: string
  /** Deployment-defined extra routing/context payload (opaque to the core). */
  meta?: Record<string, unknown>
}

export interface WorkCompletion {
  status: 'completed' | 'failed' | 'cancelled'
  resultText?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * A capability grants access to one host-bridge namespace, optionally
 * restricted to specific methods. Grants are enforced twice: advisorily
 * inside the kernel (the model cannot even *name* an ungranted method) and
 * authoritatively in the control plane before any action executes.
 */
export interface CapabilityGrant {
  name: string
  /** When present, only these methods are callable. */
  methods?: readonly string[]
}

// ---------------------------------------------------------------------------
// Host actions (the typed effect bridge)
// ---------------------------------------------------------------------------

/**
 * One product side effect requested by kernel code via
 * `host.<namespace>.<method>(...)`.
 *
 * `idempotencyKey` is derived as `runId:cellId:callIndex` — deterministic
 * across kernel restarts replaying the same cell — so the control-plane
 * action ledger can collapse at-least-once delivery into exactly-once effects.
 */
export interface HostAction {
  runId: string
  cellId: string
  callIndex: number
  /** `<namespace>.<method>` */
  action: string
  args: Record<string, unknown>
  idempotencyKey: string
}

export interface HostActionResult {
  ok: boolean
  value?: unknown
  error?: string
  /** Present when the action suspended into a human approval. */
  approval?: { id: string; status: 'PENDING' }
  /** Optional host instruction back to the runtime. */
  directive?: HostDirective
}

/**
 * A host directive lets an action tell the runtime that the turn is finished
 * out-of-band (e.g. work was handed to another surface, or the host asked the
 * user a blocking question). The runtime completes the run successfully
 * without a final assistant message.
 */
export interface HostDirective {
  type: 'defer'
  reason?: string
  data?: Record<string, unknown>
}

export interface ApprovalResolution {
  approvalId: string
  approved: boolean
  result?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Kernel execution
// ---------------------------------------------------------------------------

export interface KernelArtifact {
  path: string
  size: number
  mime: string
  sha256: string
}

export interface KernelExecution {
  executionId: string
  stdout: string
  stderr: string
  result: unknown
  durationMs: number
  truncated: boolean
  artifacts: KernelArtifact[]
  directives: HostDirective[]
}

// ---------------------------------------------------------------------------
// Run events (the observability + streaming ledger)
// ---------------------------------------------------------------------------

export type RunStage = 'started' | 'delta' | 'completed' | 'failed' | 'cancelled'

/**
 * A single durable event of a run attempt. `seq` must fall inside the
 * attempt's fence-scoped range; the control plane rejects events outside it
 * and deduplicates on `(runId, seq)`.
 */
export interface RunEvent {
  runId: string
  seq: number
  kind: string
  stage: RunStage
  /** `user` events may be surfaced to end users; `internal` never are. */
  visibility: 'user' | 'internal'
  data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Sessions and model items
// ---------------------------------------------------------------------------

export type ModelItem =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { type: 'function_call'; callId: string; name: string; arguments: string }
  | { type: 'function_call_output'; callId: string; output: string }

/**
 * Durable conversational state of one agent session, saved with optimistic
 * concurrency (`revision`).
 */
export interface SessionRecord {
  key: string
  tenantId: string
  agentId: string
  sessionId: string
  threadId?: string
  summary?: string
  history: ModelItem[]
  /** Work ids whose turn input is already folded into `history`. */
  appliedWorkIds: string[]
  revision: number
  compactionEpoch: number
  /** Frozen system-prompt context; rebuilt when its source versions change. */
  promptContext?: PromptContext
}

/** Composite key shared by sessions, kernel affinity, and lease exclusivity. */
export function sessionKeyOf(work: Pick<WorkItem, 'tenantId' | 'agentId' | 'sessionId' | 'threadId'>): string {
  return [work.tenantId, work.agentId, work.sessionId, work.threadId ?? '-'].join(':')
}

/**
 * The cache-stable prefix of the model conversation. Frozen into the session
 * and only rebuilt when a source version changes, so provider prompt caches
 * stay warm across turns.
 */
export interface PromptContext {
  version: 2
  epoch: number
  assembledAt: string
  systemInstructions: string
  persona: { name: string; role: string; instructions: string }
  capabilities: string[]
  /** Versions of everything folded into `systemInstructions`. */
  sourceVersions: Record<string, string>
}

// ---------------------------------------------------------------------------
// Turn context (assembled fresh by the control plane for every attempt)
// ---------------------------------------------------------------------------

export interface ContextMessage {
  ref: string
  authorId: string
  authorName: string
  authorKind: 'human' | 'agent' | 'system'
  body: string
  createdAt: string
  replyToRef?: string
}

/**
 * Everything the runtime needs to run one attempt. Split into a cache-stable
 * candidate prompt context and per-turn dynamic context that is never frozen
 * into the session.
 */
export interface TurnContext {
  work: WorkItem
  persona: { name: string; role: string; instructions: string }
  capabilities: string[]
  messages: ContextMessage[]
  promptContextCandidate?: PromptContext
  pendingApproval?: ApprovalResolution
  /**
   * Deployment-defined per-turn context (retrieval results, live product
   * state…). Rendered by the active RuntimePolicy; opaque to the core.
   */
  dynamic?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Heartbeat / steering
// ---------------------------------------------------------------------------

export interface SteerInput {
  id: string
  text: string
  createdAt: string
}

export interface HeartbeatResult {
  ok: boolean
  cancelRequested?: boolean
  preemptRequested?: boolean
  steer?: SteerInput[]
}

// ---------------------------------------------------------------------------
// Outbound assistant messages
// ---------------------------------------------------------------------------

/**
 * The final user-visible assistant message of a turn. The control plane
 * verifies `body` byte-for-byte against the durably streamed deltas of the
 * same attempt before delivering it.
 */
export interface AssistantMessage {
  version: 2
  runId: string
  agentId: string
  sessionId: string
  threadId?: string
  body: string
  data?: Record<string, unknown>
}
