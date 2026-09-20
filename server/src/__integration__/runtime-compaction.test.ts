import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await worker?.stop(); await teardownAll(); await im?.close() })

test('an oversized persisted conversation compacts, records every call and accepts a followup in the same session', { timeout: 60000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const conversationId = 'compaction-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Compaction',$4::jsonb)`,
    [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const enqueue = async (messageId: string) => {
    const result = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId, version: 1, author: { id: 'test-owner', kind: 'human' }, text: '继续解释。', mentions: [agentId] },
    { mode: 'chat', executionClass: 'operation', codeExecution: 'disabled' })
    assert.equal(result.runs.length, 1)
    const run = result.runs[0]
    await bindProductRun(pool, run, conversationId)
    return run
  }
  const run = await enqueue('initial')
  const history = [{ role: 'user', content: 'old-context-中文😀'.repeat(15000) },
    ...Array.from({ length: 20 }, () => ({ role: 'user', content: 'Recent observation' }))]
  await pool.query(`INSERT INTO lingxios.agent_os_sessions(session_key,tenant_id,agent_id,session_id,history,revision)
    VALUES($1,$2,$3,$4,$5::jsonb,1)`, [JSON.stringify([companyId, agentId, run.sessionId, null]), companyId, agentId, run.sessionId, JSON.stringify(history)])
  let chunks = 0
  const usage = { available: true, inputTokens: 100, outputTokens: 20 }
  worker = createWorker({ controlPlane: api, worker: { id: 'product-compaction' }, performance: { asyncCompaction: true },
    model: { modelId: 'compaction-fixture', contextWindowTokens: 128000, maxOutputTokens: 8192,
      async compact() {
        chunks++
        return { value: JSON.stringify({ observedResults: 'Earlier context retained.', decisions: '', remainingWork: 'Continue explaining.', uncertainties: '' }),
          model: 'compaction-fixture', usage }
      },
      async run(request) {
        assert.doesNotMatch(JSON.stringify(request.items), /old-context/)
        assert.match(JSON.stringify(request.items), /Earlier context retained/)
        return { text: '继续说明。', output: [{ role: 'assistant', content: '继续说明。' }], model: 'compaction-fixture', usage }
      },
      async structured() { return { value: { missing: [] }, model: 'compaction-fixture', usage } },
    } })
  assert.equal(await worker.runNext(), true)
  assert.ok(chunks > 1)
  const followup = await enqueue('followup')
  assert.equal(followup.sessionId, run.sessionId)
  assert.equal(await worker.runNext(), true)
  for (let attempt = 0; attempt < 100 && (await api.readRunState(followup))?.delivery !== 'delivered'; attempt++) await delay(20)
  assert.equal((await api.readRunState(run))?.run.status, 'succeeded')
  assert.equal((await api.readRunState(followup))?.delivery, 'delivered')
  assert.equal(im.messages.filter(message => message.channelId === conversationId).length, 2)
  assert.deepEqual((await pool.query(`SELECT compaction_epoch FROM lingxios.agent_os_sessions WHERE tenant_id=$1 AND session_id=$2`,
    [companyId, run.sessionId])).rows, [{ compaction_epoch: 1 }])
  for (let attempt = 0; attempt < 100; attempt++) {
    const calls = (await pool.query(`SELECT status FROM llm_calls WHERE company_id=$1 AND run_id=$2 AND purpose='lingxios.compaction'`,
      [companyId, run.runId])).rows
    if (calls.length === chunks) { assert.deepEqual(calls, Array.from({ length: chunks }, () => ({ status: 'succeeded' }))); return }
    await delay(20)
  }
  assert.fail('each compaction chunk must reach the shared product LLM ledger')
})
