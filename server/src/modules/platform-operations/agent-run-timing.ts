import type { RunRecord } from '@lyyzka/lingxios'
import type { AgentRunTiming } from '../../../../shared/agent-run-timing.js'

type RunTimingInput = Pick<RunRecord, 'id' | 'status' | 'fence' | 'requestVersion' | 'attempts' | 'availableAt' | 'executionMs'> & { heartbeatAt?: string | null }
const duration = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Read only published lifecycle data. Future availableAt is not Worker shortage;
 * SDK21 queueWaitMs includes claim recovery before run.started. The SDK does not
 * expose per-run permit waits or exact lease expiry through these readers. */
export function agentRunTiming(run: RunTimingInput, input: { now?: number; events?: readonly unknown[]; afterSeq?: number } = {}): AgentRunTiming {
  const now = input.now ?? Date.now(), availableAt = Date.parse(run.availableAt)
  const heartbeat = run.heartbeatAt ? Date.parse(run.heartbeatAt) : NaN
  const queued = run.status === 'queued'
  const queueState = !queued ? 'not-queued' : !Number.isFinite(availableAt) ? 'unknown' : availableAt > now ? 'delayed' : 'eligible'
  const eventHistory = !input.events ? 'unavailable' : input.afterSeq === 0 ? 'first-page' : 'cursor-page'
  const first = eventHistory === 'first-page' && run.attempts === 1 && run.requestVersion === 1 && run.fence === 1
    ? input.events?.map(object).find(event => event.runId === run.id && event.seq === 1 && event.kind === 'run.started') : undefined
  const data = object(first?.data)
  const initialWait = data.attempts === 1 && data.fence === 1 && data.requestVersion === 1 ? duration(data.queueWaitMs) : null
  return { observedAt: new Date(now).toISOString(), queueState,
    eligibleQueueMs: queueState === 'eligible' ? Math.max(0, now - availableAt) : null,
    availableDelayMs: queueState === 'delayed' ? availableAt - now : null,
    initialEligibleToStartedMs: initialWait, attemptExecutionTotalMs: duration(run.executionMs),
    modelPermitWaitMs: null, ingressToEnqueueMs: null, endToEndMs: null,
    leaseValidity: run.status === 'leased' ? 'unknown' : 'not-leased',
    heartbeatAgeMs: run.status === 'leased' && Number.isFinite(heartbeat) && heartbeat <= now ? now - heartbeat : null,
    leaseExpiresAt: null, eventHistory }
}
