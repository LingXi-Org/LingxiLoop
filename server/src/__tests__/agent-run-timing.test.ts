import assert from 'node:assert/strict'
import test from 'node:test'
import { agentRunTiming } from '../modules/platform-operations/agent-run-timing.js'

const now = Date.parse('2026-11-03T12:00:00Z')
const run = { id: 'run', status: 'queued' as const, fence: 1, requestVersion: 1, attempts: 0,
  availableAt: new Date(now - 151_000).toISOString(), executionMs: 0 }
const started = { runId: 'run', seq: 1, kind: 'run.started', data: { fence: 1, requestVersion: 1, attempts: 1, queueWaitMs: 151_120, private: 'PRIVATE' } }

test('future availability is delayed, never counted as eligible Worker queue wait', () => {
  const delayed = agentRunTiming({ ...run, availableAt: new Date(now + 30_000).toISOString() }, { now })
  assert.equal(delayed.queueState, 'delayed')
  assert.equal(delayed.availableDelayMs, 30_000)
  assert.equal(delayed.eligibleQueueMs, null)
  const eligible = agentRunTiming(run, { now })
  assert.equal(eligible.queueState, 'eligible')
  assert.equal(eligible.eligibleQueueMs, 151_000)
  assert.equal(eligible.availableDelayMs, null)
})

test('151-second first queue and 55-second attempt remain separate with no invented end-to-end or permit wait', () => {
  const timing = agentRunTiming({ ...run, status: 'succeeded', attempts: 1, executionMs: 55_614.509 }, { now, events: [started], afterSeq: 0 })
  assert.equal(timing.initialEligibleToStartedMs, 151_120)
  assert.equal(timing.attemptExecutionTotalMs, 55_614.509)
  assert.equal(timing.endToEndMs, null)
  assert.equal(timing.modelPermitWaitMs, null)
  assert.equal(timing.queueState, 'not-queued')
  assert.equal(timing.eligibleQueueMs, null)
  assert.doesNotMatch(JSON.stringify(timing), /PRIVATE/)
})

test('claimed work is not treated as proof of execution or a valid lease', () => {
  const timing = agentRunTiming({ ...run, status: 'leased', attempts: 1, executionMs: 1_200, heartbeatAt: new Date(now - 3000).toISOString() }, { now, events: [started], afterSeq: 0 })
  assert.equal(timing.queueState, 'not-queued')
  assert.equal(timing.leaseValidity, 'unknown')
  assert.equal(timing.leaseExpiresAt, null)
  assert.equal(timing.heartbeatAgeMs, 3000)
  assert.equal(timing.modelPermitWaitMs, null)
})

test('retries, revisions, cursor pages, incomplete/missing identities and another run never fabricate first queue', () => {
  for (const [candidate, options] of [
    [{ ...run, attempts: 2, fence: 2 }, { events: [started], afterSeq: 0 }],
    [{ ...run, attempts: 1, requestVersion: 2 }, { events: [started], afterSeq: 0 }],
    [{ ...run, attempts: 1 }, { events: [started], afterSeq: 3 }],
    [{ ...run, attempts: 1 }, { events: [{ ...started, runId: 'other' }], afterSeq: 0 }],
    [{ ...run, attempts: 1 }, { events: [{ ...started, data: {} }], afterSeq: 0 }],
    [{ ...run, attempts: 1 }, {}],
  ] as const) assert.equal(agentRunTiming(candidate, { now, ...options }).initialEligibleToStartedMs, null)
  const retried = agentRunTiming({ ...run, attempts: 2, fence: 2, executionMs: 300_000 }, { now })
  assert.equal(retried.attemptExecutionTotalMs, 300_000)
  assert.equal(retried.endToEndMs, null)
})

test('cancelled queue, invalid timestamps and unavailable event pages retain unknowns rather than zero', () => {
  assert.equal(agentRunTiming({ ...run, status: 'cancelled' }, { now }).eligibleQueueMs, null)
  const invalid = agentRunTiming({ ...run, availableAt: 'invalid', executionMs: Number.NaN }, { now })
  assert.equal(invalid.queueState, 'unknown')
  assert.equal(invalid.eligibleQueueMs, null)
  assert.equal(invalid.attemptExecutionTotalMs, null)
  assert.equal(invalid.eventHistory, 'unavailable')
  assert.equal(agentRunTiming(run, { now, events: [], afterSeq: 0 }).eventHistory, 'first-page')
})
