import assert from 'node:assert/strict'
import test from 'node:test'
import { modelStageExtras } from '../agent-runtime/model-observation-timing.js'
import { readAdminModelStageCalls, runStageTiming } from '../modules/platform-operations/model-stage-timing.js'
import type { Queryable } from '../db/queryable.js'

const identity = { runId: 'run', tenantId: 'tenant', agentId: 'agent', sessionId: 'session', principalId: 'human' }
const stage = { version: 1, clock: 'monotonic', providerTime: 'unavailable', totalMs: 100, modelPermitWaitMs: 0,
  observedStreamMs: 90, outputCallbackWaitMs: 60, httpToFirstContentMs: undefined, secret: 'PRIVATE' }
const publication = { version: 1, clock: 'monotonic', callId: 'call', requestVersion: 1, fence: 1, revision: 1,
  publicationTotalMs: 40, publicationWaitMs: 30, publicationCount: 3, acknowledgedCount: 2 }

test('ledger timing extras preserve observed zero, omit invalid/missing phases and never copy raw extensions', () => {
  const extras = modelStageExtras({ stageTimings: stage, fence: 1, requestVersion: 1 })
  assert.equal(extras.stageTimings?.modelPermitWaitMs, 0)
  assert.equal(extras.stageTimings?.totalMs, 100)
  assert.equal(extras.stageTimings?.httpToFirstContentMs, undefined)
  assert.doesNotMatch(JSON.stringify(extras), /PRIVATE/)
  assert.deepEqual(modelStageExtras({ stageTimings: stage, requestVersion: 1 }), {})
  assert.deepEqual(modelStageExtras({ fence: 1, requestVersion: 1 }), {})
  assert.equal(modelStageExtras({ stageTimings: { ...stage, totalMs: -1 }, fence: 1, requestVersion: 1 }).stageTimings?.totalMs, undefined)
})

test('model stage reader binds complete authorized identity/current request and retains failed correction calls', async () => {
  const calls: unknown[][] = []
  const db = { query: async (sql: string, params: unknown[]) => { calls.push([sql, params]); return { rows: [
    { call_id: 'call', request_version: '1', fence: '2', operation: 'correction', status: 'failed', stages: stage, failure_kind: 'output', output_callback: 'operation' },
    { call_id: 'old', request_version: '2', fence: '1', status: 'succeeded', stages: stage },
    { call_id: 'legacy', request_version: '1', fence: null, stages: stage },
  ] } } } as unknown as Queryable
  const result = await readAdminModelStageCalls(db, identity, 1)
  assert.deepEqual(calls[0][1], ['tenant', 'run', 'agent', 'human', 'session', null, '1'])
  assert.match(String(calls[0][0]), /l\.agent_id=b\.agent_id/)
  assert.doesNotMatch(String(calls[0][0]), /lingxios\./)
  assert.equal(result.calls.length, 1)
  assert.equal(result.calls[0].operation, 'correction')
  assert.equal(result.calls[0].status, 'failed')
  assert.equal(result.calls[0].fence, 2)
  assert.deepEqual(result.calls[0].failureAttribution, { kind: 'output', outputCallback: 'operation' })
  assert.equal(result.calls[0].stages.providerTime, 'unavailable')
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/)
})

test('publication revisions replace within call/fence/request identity; old fences remain distinct, other requests stay out', () => {
  const result = runStageTiming(identity, 1, { calls: [], truncated: false }, {
    run: { id: 'run', requestVersion: 1 }, publicationTimings: [publication,
      { ...publication, revision: 2, publicationWaitMs: 70, failure: { stage: 'seal', code: 'persistence_rejected', raw: 'PRIVATE' } },
      { ...publication, fence: 2, publicationWaitMs: 5 }, { ...publication, requestVersion: 2, publicationWaitMs: 999 },
    ], publicationTimingsTruncated: true })
  assert.equal(result.publicationTimings.length, 2)
  assert.equal(result.publicationTimings[0].publicationWaitMs, 70)
  assert.equal(result.publicationTimings[1].publicationWaitMs, 5)
  assert.equal(result.publicationsTruncated, true)
  assert.equal(result.unattributedRunMs, null)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|999/)
  assert.deepEqual(runStageTiming(identity, 1, null, { run: { id: 'other', requestVersion: 1 }, publicationTimings: [publication] }).publicationTimings, [])
})

test('missing old measurements and unavailable readers never become zero or a fabricated provider duration', () => {
  const result = runStageTiming(identity, 1, null, null)
  assert.equal(result.modelCallsAvailable, false)
  assert.equal(result.publicationMeasurementsAvailable, false)
  assert.deepEqual(result.calls, [])
  assert.deepEqual(result.publicationTimings, [])
  assert.equal(result.providerTime, 'unavailable')
})

test('failure origin is closed and legacy missing metadata never becomes a provider diagnosis', async () => {
  const db = { query: async () => ({ rows: [
    { call_id: 'legacy', request_version: '1', fence: '1', status: 'failed', stages: stage, failure_kind: 'PRIVATE_RAW', output_callback: 'PRIVATE_STAGE' },
    { call_id: 'protocol-callback', request_version: '1', fence: '1', status: 'failed', stages: stage, output_callback: 'delta' },
    { call_id: 'success', request_version: '1', fence: '1', status: 'succeeded', stages: stage, failure_kind: 'output', output_callback: 'operation' },
  ] }) } as unknown as Queryable
  const result = await readAdminModelStageCalls(db, identity, 1)
  assert.equal(result.calls[0].failureAttribution, undefined)
  assert.deepEqual(result.calls[1].failureAttribution, { kind: null, outputCallback: 'delta' })
  assert.equal(result.calls[2].failureAttribution, undefined)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RAW|PRIVATE_STAGE/)
})
