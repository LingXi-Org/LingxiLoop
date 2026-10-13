import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Live gate: missing reports, imaginary tool execution, leaked private reasoning,
// unmeasured usage, lost replay order, and a fixture presented as model evidence fail.
test('real provider publishes public explanations and a plan through the product worker', {
  skip: process.env.LINGXIOS_LIVE_ACTIVITY !== '1', timeout: 360_000,
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_activity_test')
  assert.equal(process.env.AGENT_OS_MAX_CONCURRENT_RUNS, '1')
  await ensureSchemaOnce(); await resetAllTables(); installFakeWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["files"]'::jsonb WHERE id=$1`, [agentId])
  const conversationId = 'public-activity-live-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN!, port: 0 })
  process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  const output = 'artifacts/run-activity/live', observed: string[][] = []
  await mkdir(output, { recursive: true })
  let passed = false
  try {
    worker = await startLingxiOSWorker()
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version, messageId: 'public-activity-live-request',
      version: 1, author: { id: 'test-owner', kind: 'human' }, mentions: [agentId],
      text: '请检查本次请求是否有附件，并用中文说明检查结果。请先用 chat.report_progress 发布一个真实的两步计划（检查附件、总结结果），然后发布 kind=reasoning 的简短公开操作说明，明确这只是给我的方法说明，不含内部思维。实际调用 files.list 检查附件，再更新同一计划为完成，最后正常答复。不要创建文件，不要发送额外消息，不要展示内部标识。',
    }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0], deadline = Date.now() + 280_000
    let state = await api.readRunState(identity)
    while (state && ['queued', 'leased', 'waiting'].includes(state.run.status)) {
      assert.ok(Date.now() < deadline, 'public activity model gate timed out')
      const snapshot = (await readRunProjection(api, identity, true)).snapshot
      const kinds = snapshot.message.content.map(part => `${activityAnnotation(part)?.kind ?? 'other'}:${part.type}`)
      if (JSON.stringify(kinds) !== JSON.stringify(observed.at(-1))) observed.push(kinds)
      await delay(500)
      state = await api.readRunState(identity)
    }
    assert.equal(state?.run.status, 'succeeded', 'real product run did not succeed')
    const message = (await readRunProjection(api, identity, true)).snapshot.message
    assert.ok(message.content.some(part => part.type === 'reasoning'), 'provider did not publish a public explanation')
    assert.ok(message.content.some(part => part.type === 'generative-ui' && activityAnnotation(part)?.kind === 'commentary'), 'provider did not publish a plan')
    const tool = message.content.find(part => part.type === 'tool-call' && part.toolName === 'files.list')
    assert.ok(tool?.type === 'tool-call' && tool.timing?.completedAt && tool.timing.completedAt >= tool.timing.startedAt, 'real tool execution timing missing')
    assert.equal(Reflect.get(tool.result as object, 'status'), 'completed')
    assert.ok(nativeText(message).length > 10, 'authoritative final answer missing')
    assert.doesNotMatch(JSON.stringify(message), /<think>|scratchpad|system_prompt|Bearer\s+[A-Za-z0-9._-]{16,}/i)
    assert.deepEqual(message.content, (await readRunProjection(api, identity, true)).snapshot.message.content)
    const ledger = (await pool.query<{ calls: number; measured: boolean; cost: string }>(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
      COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
    assert.ok(ledger.calls > 0 && ledger.measured, 'real model usage must be measured')
    assert.ok(Number(ledger.cost) <= 0.25, 'run exceeded the real-model budget')
    passed = true
    await writeFile(`${output}/results.json`, JSON.stringify({ passed, realModel: true, model: process.env.OPENAI_MODEL, runtime: '3.3.6',
      measuredCalls: ledger.calls, costUSD: Number(ledger.cost), observations: observed, finalKinds: message.content.map(part => part.type),
      checks: ['public explanation', 'public plan', 'real files.list', 'measured tool duration', 'authoritative answer', 'replay', 'measured model ledger'],
    }, null, 2))
  } finally {
    if (!passed) await writeFile(`${output}/results.json`, JSON.stringify({ passed: false, realModel: true, observations: observed }, null, 2))
    await worker?.stop(); await teardownAll()
  }
})
