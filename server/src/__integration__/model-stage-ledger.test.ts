import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import type { ModelCallObservation } from '@lingxi-org/lingxios'
import { pool } from '../db/pool.js'
import { recordModelCall } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { readAdminModelStageCalls } from '../modules/platform-operations/model-stage-timing.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

after(async () => { await teardownAll() })
test('formal stage observations preserve ledger idempotency, fees and identity-scoped current-request reads', async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('stage-user', companyId)
  const room = 'stage-ledger-room', identity = { runId: 'stage-run', tenantId: companyId, agentId, sessionId: room, principalId: 'stage-user' }
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic timing',$4::jsonb)", [room, companyId, projectId, JSON.stringify(['stage-user', agentId])])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [room, companyId, JSON.stringify({ channelType: 2, kind: 'group', projectId, members: ['stage-user', agentId] })])
  await bindProductRun(pool, identity, room)
  const base: ModelCallObservation = { workId: identity.runId, tenantId: companyId, agentId, sessionId: room, principalId: 'stage-user',
    callId: 'stage-generation', purpose: 'agent-turn', operation: 'generation', model: 'synthetic-timing-model', fence: 1, requestVersion: 1,
    latencyMs: 137, status: 'succeeded', usage: { available: true, inputTokens: 10, outputTokens: 20 },
    cost: { amountMicros: 123, usage: 'measured', pricing: { version: 'synthetic', currency: 'USD', inputMicrosPerMillion: 1, outputMicrosPerMillion: 2 } },
    stageTimings: { version: 1, clock: 'monotonic', providerTime: 'unavailable', totalMs: 137, modelPermitWaitMs: 0,
      observedStreamMs: 100, outputCallbackTotalMs: 90, outputCallbackWaitMs: 60, streamCompleted: true } }
  await recordModelCall(base)
  await recordModelCall({ ...base, latencyMs: 999, cost: { ...base.cost!, amountMicros: 999 } })
  await recordModelCall({ ...base, callId: 'stage-correction', operation: 'correction', fence: 2, status: 'failed', failure: { kind: 'output', outputCallback: 'operation', category: 'unknown', retryable: false }, error: 'Model output callback rejected' })
  await recordModelCall({ ...base, callId: 'stage-new-request', requestVersion: 2, fence: 3 })
  await recordModelCall({ ...base, callId: 'stage-legacy', stageTimings: undefined, fence: undefined, requestVersion: undefined })
  const saved = (await pool.query('SELECT latency_ms,input_tokens,output_tokens,cost_usd,extras FROM llm_calls WHERE id=$1', ['lingxios-stage-generation'])).rows[0]
  assert.equal(saved.latency_ms, 137); assert.equal(saved.input_tokens, 10); assert.equal(saved.output_tokens, 20)
  assert.equal(Number(saved.cost_usd), 0.000123)
  assert.equal(saved.extras.stageTimings.modelPermitWaitMs, 0)
  const result = await readAdminModelStageCalls(pool, identity, 1)
  assert.equal(result.calls.length, 2)
  assert.ok(result.calls.some(call => call.operation === 'correction' && call.status === 'failed' && call.fence === 2))
  assert.deepEqual(result.calls.find(call => call.operation === 'correction')?.failureAttribution, { kind: 'output', outputCallback: 'operation' })
  assert.equal((await readAdminModelStageCalls(pool, identity, 2)).calls.length, 1)
  for (const changed of [{ tenantId: 'other' }, { principalId: 'other' }, { agentId: 'other' }, { sessionId: 'other' }, { threadId: 'other' }]) {
    assert.deepEqual((await readAdminModelStageCalls(pool, { ...identity, ...changed }, 1)).calls, [])
  }
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM llm_calls WHERE run_id=$1', [identity.runId])).rows[0].n, 4)
})
