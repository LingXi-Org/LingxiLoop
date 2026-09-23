import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>, worker: ReturnType<typeof createWorker> | undefined
before(async () => { process.env.AGENT_OS_RESPONSE_POLICY = 'auto'; await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await worker?.stop(); await teardownAll(); await im?.close() })

test('ordinary product chat defers retrieval, upgrades durably and keeps every model call in the shared ledger', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["knowledge"]'::jsonb WHERE company_id=$1 AND id=$2`, [companyId, agentId])
  const conversationId = 'response-policy-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Response',$4::jsonb)`,
    [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  let upgrade = false, fastCalls = 0, deepCalls = 0
  const usage = { available: true, inputTokens: 100, outputTokens: 10 }
  const auxiliary = { async compact() { throw new Error('unexpected compaction') },
    async structured() { return { value: { missing: [] }, model: 'deep-fixture', usage } } }
  worker = createWorker({ controlPlane: api, worker: { id: 'response-policy-worker' },
    fastModel: { ...auxiliary, modelId: 'fast-fixture', configurationFingerprint: 'fast-config', async run(request) {
      fastCalls++
      assert.deepEqual(request.tools?.map(tool => tool.name), ['response__upgrade'])
      assert.doesNotMatch(JSON.stringify(request.items), /"knowledgeRetrieval"/)
      assert.match(JSON.stringify(request.items), /保留原始要求/)
      request.onTextDelta?.('直')
      return upgrade ? { text: '', output: [{ type: 'function_call', name: 'response__upgrade', callId: 'upgrade', arguments: '{}' }], usage }
        : { text: '直接回答。', output: [{ role: 'assistant', content: '直接回答。' }], usage }
    } },
    model: { ...auxiliary, modelId: 'deep-fixture', configurationFingerprint: 'deep-config', async run(request) {
      deepCalls++
      assert.ok(request.tools?.some(tool => tool.name === 'knowledge__search'))
      assert.match(JSON.stringify(request.items), /"maxTokens\\":8000/)
      return { text: '深度回答。', output: [{ role: 'assistant', content: '深度回答。' }], usage }
    } },
  })
  for (const shouldUpgrade of [false, true]) {
    upgrade = shouldUpgrade
    const result = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: `request-${upgrade}`, version: 1, author: { id: 'test-owner', kind: 'human' }, text: '保留原始要求：请回答。', mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'operation' })
    const run = result.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
    assert.equal(await worker.runNext(), true)
    const state = await api.readRunState(run)
    assert.equal(state?.run.status, 'succeeded')
    assert.equal(state?.message?.body, upgrade ? '深度回答。' : '直接回答。')
    const calls = (await pool.query(`SELECT model,status,extras FROM llm_calls WHERE company_id=$1 AND run_id=$2 AND purpose='lingxios.agent-turn' ORDER BY created_at`,
      [companyId, run.runId])).rows
    assert.deepEqual(calls.map(call => [call.model, call.status]), upgrade ? [['fast-fixture', 'succeeded'], ['deep-fixture', 'succeeded']] : [['fast-fixture', 'succeeded']])
    assert.equal(calls[0].extras.configurationFingerprint, 'fast-config')
    const steps = (await pool.query(`SELECT request_version FROM lingxios.agent_steps WHERE work_id=$1 AND kind='runtime.response'`, [run.runId])).rows
    assert.equal(steps.length, upgrade ? 1 : 0)
  }
  assert.deepEqual([fastCalls, deepCalls], [2, 1])
})
