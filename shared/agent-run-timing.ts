/** Product projection of the published run snapshot and lifecycle event fields.
 * Durations are independent observations, never additive wall-clock phases. */
export interface AgentRunTiming {
  observedAt: string
  queueState: 'eligible' | 'delayed' | 'not-queued' | 'unknown'
  eligibleQueueMs: number | null
  availableDelayMs: number | null
  initialEligibleToStartedMs: number | null
  attemptExecutionTotalMs: number | null
  modelPermitWaitMs: null
  ingressToEnqueueMs: null
  endToEndMs: null
  leaseValidity: 'unknown' | 'not-leased'
  heartbeatAgeMs: number | null
  leaseExpiresAt: null
  eventHistory: 'first-page' | 'cursor-page' | 'unavailable'
}
