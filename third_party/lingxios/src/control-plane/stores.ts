/**
 * Storage ports of the control plane. Implementations must be transactional
 * enough to uphold the lease and idempotency invariants:
 *
 * - a work item has at most one live lease; `fence` increases by one on every
 *   lease acquisition and every yield;
 * - at most one live lease exists per session key (session exclusivity);
 * - a session is routed to one worker; re-routing to a different live worker
 *   is forbidden, and taking over a dead worker's session bumps `homeEpoch`;
 * - events are deduplicated on `(runId, seq)`;
 * - host actions are executed at most once per idempotency key.
 */
import type {
  HostActionResult, ModelItem, RunEvent, SessionRecord,
  WorkCompletion, WorkItem, WorkKind, WorkLane,
} from '../protocol/types.js'

// ---------------------------------------------------------------------------
// Work store
// ---------------------------------------------------------------------------

export interface EnqueueWorkInput {
  /** Client-supplied id makes the enqueue idempotent. */
  id?: string
  tenantId: string
  agentId: string
  sessionId: string
  threadId?: string
  kind: WorkKind
  lane: WorkLane
  triggerRef: string
  principalId?: string
  /** Not before this instant. */
  availableAt?: string
  /** Tie-break inside a lane; higher first. */
  priority?: number
  meta?: Record<string, unknown>
}

export interface EnqueueResult {
  id: string
  deduplicated: boolean
}

/** What `claim` hands the worker: a full WorkItem with a fresh lease. */
export interface ClaimResult {
  work: WorkItem
}

export interface HeartbeatRow {
  cancelRequested: boolean
  preemptRequested: boolean
  steer: Array<{ id: string; text: string; createdAt: string }>
}

/** A validated lease: the durable row as the control plane sees it. */
export interface LeasedWork {
  work: Omit<WorkItem, 'leaseToken'>
  status: 'leased'
  cancelRequested: boolean
}

export interface WorkStoreOptions {
  leaseTtlMs?: number
  workerTimeoutMs?: number
}

export interface WorkStore {
  enqueue(input: EnqueueWorkInput): Promise<EnqueueResult>

  /**
   * Atomically claim the highest-priority eligible work item for `workerId`:
   * lane priority desc, then priority desc, then created-at asc. Applies
   * session exclusivity and session→worker routing; returns null when
   * nothing is claimable.
   */
  claim(workerId: string): Promise<WorkItem | null>

  /** Renew the lease; null when the lease is no longer valid. */
  heartbeat(id: string, fence: number, leaseTokenHash: string): Promise<HeartbeatRow | null>

  /** Validate a lease without mutating it; null when invalid. */
  getLeased(id: string, fence: number, leaseTokenHash: string): Promise<LeasedWork | null>

  /** Requeue preempted work (fence advances). False when not yieldable. */
  yieldWork(id: string, fence: number, leaseTokenHash: string): Promise<boolean>

  /** Terminal transition. False when the lease is no longer valid. */
  complete(id: string, fence: number, leaseTokenHash: string, completion: WorkCompletion): Promise<boolean>

  // Control operations (no lease required; from product surfaces/operators).
  requestCancel(id: string): Promise<boolean>
  requestPreempt(id: string): Promise<boolean>
  addSteer(id: string, text: string): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export type SaveSessionResult = { ok: true; revision: number } | { ok: false; conflict: true }

export interface SessionStore {
  get(key: string): Promise<SessionRecord | null>
  /**
   * Optimistic save: succeeds only when the stored revision equals
   * `session.revision` (or the session does not exist and revision is 0).
   */
  save(session: SessionRecord): Promise<SaveSessionResult>
}

// ---------------------------------------------------------------------------
// Event store
// ---------------------------------------------------------------------------

export interface StoredRunEvent extends RunEvent {
  tenantId: string
  agentId: string
  recordedAt: string
}

export interface EventStore {
  /** Append with (runId, seq) dedupe. Returns false for a duplicate. */
  append(event: StoredRunEvent): Promise<boolean>
  /** Events of one attempt range, ordered by seq. */
  listRange(runId: string, fromSeqExclusive: number, toSeqInclusive: number, kinds?: readonly string[]): Promise<StoredRunEvent[]>
}

// ---------------------------------------------------------------------------
// Action ledger
// ---------------------------------------------------------------------------

export interface ActionLedgerStore {
  /** The recorded result for this idempotency key, if the action already ran. */
  find(idempotencyKey: string): Promise<HostActionResult | null>
  /**
   * Record a result. Returns the winning result: on a concurrent duplicate,
   * the first recorded result is returned and the new one discarded.
   */
  record(idempotencyKey: string, result: HostActionResult): Promise<HostActionResult>
}

// ---------------------------------------------------------------------------
// Deployment ports (product integration)
// ---------------------------------------------------------------------------

/** Assembles everything but `work` in a TurnContext. */
export interface ContextProvider {
  loadContext(work: Omit<WorkItem, 'leaseToken'>): Promise<{
    persona: { name: string; role: string; instructions: string }
    capabilities: string[]
    messages: Array<{
      ref: string; authorId: string; authorName: string
      authorKind: 'human' | 'agent' | 'system'; body: string; createdAt: string; replyToRef?: string
    }>
    promptContextCandidate?: import('../protocol/types.js').PromptContext
    pendingApproval?: import('../protocol/types.js').ApprovalResolution
    dynamic?: Record<string, unknown>
  }>
}

/** Executes one granted host action against the product. */
export interface ActionExecutor {
  execute(work: WorkItem, action: import('../protocol/types.js').HostAction): Promise<HostActionResult>
}

/**
 * Authoritative capability resolution. The control plane refuses any action
 * outside this grant regardless of what the kernel allowed.
 */
export interface CapabilityResolver {
  resolve(work: Omit<WorkItem, 'leaseToken'>): Promise<import('../protocol/types.js').CapabilityGrant[]>
}

/** Streams events and delivers final messages to product surfaces. */
export interface DeliveryPort {
  onEvent(work: Omit<WorkItem, 'leaseToken'>, event: RunEvent): Promise<void>
  deliverMessage(work: Omit<WorkItem, 'leaseToken'>, message: import('../protocol/types.js').AssistantMessage): Promise<void>
}

// ---------------------------------------------------------------------------
// Convenience: model-item validation shared by session save paths
// ---------------------------------------------------------------------------

export function isModelItem(value: unknown): value is ModelItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item['role'] === 'string') {
    return ['user', 'assistant', 'system'].includes(item['role']) && typeof item['content'] === 'string'
  }
  if (item['type'] === 'function_call') {
    return typeof item['callId'] === 'string' && typeof item['name'] === 'string' && typeof item['arguments'] === 'string'
  }
  if (item['type'] === 'function_call_output') {
    return typeof item['callId'] === 'string' && typeof item['output'] === 'string'
  }
  return false
}
