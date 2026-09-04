/**
 * HostPort — the worker-side view of the control plane. The runtime depends
 * only on this interface; `HttpHostClient` is the production implementation
 * and tests use in-memory fakes.
 */
import type {
  AssistantMessage, HeartbeatResult, HostAction, HostActionResult,
  RunEvent, SessionRecord, TurnContext, WorkCompletion, WorkItem,
} from '../protocol/types.js'

export interface HostPort {
  /** Claim one queued work item, or null when none is available. */
  claimWork(signal?: AbortSignal): Promise<WorkItem | null>

  /** Renew the lease; also transports cancel/preempt/steer signals back. */
  heartbeat(work: WorkItem): Promise<HeartbeatResult>

  /** Load the full turn context for a claimed work item. */
  loadContext(work: WorkItem): Promise<TurnContext>

  /** Execute one host action under the work's lease and capability grant. */
  executeAction(work: WorkItem, action: HostAction): Promise<HostActionResult>

  /** Append one durable run event (also drives user-visible streaming). */
  emitEvent(work: WorkItem, event: RunEvent): Promise<void>

  loadSession(work: WorkItem, key: string): Promise<SessionRecord | null>
  saveSession(work: WorkItem, session: SessionRecord): Promise<void>

  /** Deliver the final assistant message (stream-integrity checked). */
  commitMessage(work: WorkItem, message: AssistantMessage): Promise<void>

  /** Terminal state transition for this attempt. */
  completeWork(work: WorkItem, completion: WorkCompletion): Promise<void>

  /** Requeue preempted work (fence advances; this lease is dead). */
  yieldWork(work: WorkItem): Promise<void>
}
