import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

test('invalid tool arguments can be corrected and repeated failures stop within the native bound', { timeout: 60000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    await pool.query("UPDATE participants SET capabilities='[]'::jsonb WHERE company_id=$1 AND id=$2", [companyId, agentId])
    const conversationId = 'tool-recovery-room', members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Discovery',$4::jsonb)",
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
    const usage = { available: true, inputTokens: 100, outputTokens: 10 }
    let calls = 0, repeatInvalid = false
    worker = createWorker({ controlPlane: api, worker: { id: 'tool-recovery-fixture' },
      model: { modelId: 'recovery-fixture', async compact() { throw new Error('unexpected compaction') },
        async structured() { return { value: { missing: [] }, model: 'recovery-fixture', usage } },
        async run(request) {
          calls++
          const names = request.tools?.map(tool => tool.name) ?? []
          const outputs = request.items.filter(item => 'type' in item && item.type === 'function_call_output')
          const last = outputs.at(-1)
          const result = last && 'output' in last ? JSON.parse(last.output) : undefined
          assert.ok(names.includes('chat__send'))
          assert.ok(!names.includes('email__send'), 'discovery must never grant an unauthorized capability')
          assert.ok(names.includes('directory__self'))
          if (repeatInvalid) {
            assert.ok(calls <= 3, 'unchanged invalid calls must stop within the native correction bound')
            if (calls > 1) assert.equal(result.code, 'invalid_arguments')
          } else if (calls === 2) {
            assert.equal(result.code, 'invalid_arguments')
            assert.equal(result.ok, false)
          } else if (calls === 3) {
            assert.equal(result.ok, true)
            return { text: '已读取当前身份。', output: [{ role: 'assistant', content: '已读取当前身份。' }], usage }
          }
          return { text: '', output: [{ type: 'function_call', callId: `call-${calls}`, name: 'directory__self',
            arguments: repeatInvalid || calls === 1 ? '{"invented":true}' : '{}' }], usage }
        } },
    })
    const result = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'discovery-question', version: 1, author: { id: 'test-owner', kind: 'human' }, text: '读取当前身份。', mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const run = result.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
    const deadline = AbortSignal.timeout(30000)
    while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(20) }
    const state = await api.readRunState(run)
    assert.equal(state?.run.status, 'succeeded', JSON.stringify(state?.run.goalOutcome))
    assert.equal(state?.message?.body, '已读取当前身份。')
    assert.equal(calls, 3)
    const ledger = await pool.query("SELECT count(*)::int AS count FROM llm_calls WHERE run_id=$1 AND purpose='lingxios.agent-turn'", [run.runId])
    assert.equal(ledger.rows[0].count, 3)
    await mkdir('.codex-tmp/harness-recovery', { recursive: true })
    await writeFile('.codex-tmp/harness-recovery/recovery.json', JSON.stringify({ calls, forbiddenToolsHidden: true, toolExecuted: true, invalidArgumentsCorrected: true, status: state.run.status }))
    repeatInvalid = true; calls = 0
    const repeated = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'repeated-invalid-question', version: 1, author: { id: 'test-owner', kind: 'human' }, text: '再次检查当前身份。', mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const repeatedRun = repeated.runs[0]; assert.ok(repeatedRun); await bindProductRun(pool, repeatedRun, conversationId)
    while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(20) }
    const failed = await api.readRunState(repeatedRun)
    assert.equal(failed?.run.status, 'failed')
    assert.equal(calls, 3, 'three rejected arguments must terminate without another model call')
    await writeFile('.codex-tmp/harness-recovery/repeated-invalid.json', JSON.stringify({ calls, status: failed.run.status, bounded: true }))
  } finally { await worker?.stop(); await teardownAll(); await im.close() }
})
