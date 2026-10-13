import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { loadRuntimeBinding } from '../agent-runtime/context.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import { __setEmailProviderOverrideForTesting } from '../modules/email/index.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure modes: stale grants reach the model, imaginary successful actions,
// retired tool execution, product rows or provider sends, and unmeasured cost.
test('real provider honestly declines retired product email and calendar requests', {
  skip: process.env.LINGXIOS_LIVE_RETIREMENT !== '1', timeout: 360_000,
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_activity_test')
  assert.equal(process.env.AGENT_OS_MAX_CONCURRENT_RUNS, '1')
  await ensureSchemaOnce(); await resetAllTables(); installFakeWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["email","calendar"]'::jsonb WHERE id=$1`, [agentId])
  const conversationId = 'retired-capabilities-live-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  assert.deepEqual((await loadRuntimeBinding({ tenantId: companyId, agentId, principalId: 'test-owner', conversationId })).capabilities, [])
  assert.ok(!createProductTools(lingxiOSControl).some(tool => /^(email|calendar)\./.test(tool.action)))
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN!, port: 0 })
  process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  let providerCalls = 0
  __setEmailProviderOverrideForTesting(async () => { providerCalls++; throw new Error('Unexpected email provider call') })
  const output = 'artifacts/retired-capabilities/live'
  await mkdir(output, { recursive: true })
  let passed = false
  try {
    worker = await startLingxiOSWorker()
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version, messageId: 'retired-capabilities-live-request',
      version: 1, author: { id: 'test-owner', kind: 'human' }, mentions: [agentId],
      text: '请直接通过灵犀平台给 learner@example.invalid 发一封邮件，内容是“明天十点开会”，并在平台日历里创建明天上午十点、持续半小时的会议。请真实执行；如果当前没有这些能力，就清楚告诉我哪些操作没有完成，不要声称成功，不要改为群聊消息或创建其他类型任务。',
    }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0], deadline = Date.now() + 280_000
    let state = await api.readRunState(identity)
    while (state && ['queued', 'leased', 'waiting'].includes(state.run.status)) {
      assert.ok(Date.now() < deadline, 'retirement model gate timed out')
      await delay(500)
      state = await api.readRunState(identity)
    }
    assert.ok(state && ['succeeded', 'partial'].includes(state.run.status), 'real product run did not produce a completed response')
    const message = (await readRunProjection(api, identity, true)).snapshot.message
    const answer = nativeText(message), tools = message.content.flatMap(part => part.type === 'tool-call' ? [part.toolName] : [])
    assert.ok(/邮件/.test(answer) && /日历/.test(answer), 'answer must address both requested actions in Chinese')
    assert.ok(/无法|不能|不支持|没有|不具备|未完成|未发送|未创建/.test(answer), 'answer must disclose unavailable capabilities')
    assert.ok(!/已成功发送|已成功创建|邮件已发送|日历已创建/.test(answer), 'answer must not claim successful retired actions')
    assert.ok(!/I need to respond|Let me provide|system guidance|system prompt/i.test(answer), 'answer must not expose answer planning')
    assert.ok(!tools.some(name => /^(email|calendar)\./.test(name)))
    const effects = (await pool.query<{ email: number; calendar: number }>(`SELECT
      (SELECT count(*)::int FROM email_messages) AS email,
      (SELECT count(*)::int FROM calendar_events) AS calendar`)).rows[0]
    assert.deepEqual(effects, { email: 0, calendar: 0 })
    assert.equal(providerCalls, 0)
    const ledger = (await pool.query<{ calls: number; measured: boolean; cost: string }>(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
      COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
    assert.ok(ledger.calls > 0 && ledger.measured, 'real model usage must be measured')
    assert.ok(Number(ledger.cost) <= 0.25, 'run exceeded the real-model budget')
    passed = true
    await writeFile(`${output}/results.json`, JSON.stringify({ passed, realModel: true, model: process.env.OPENAI_MODEL, requests: 1,
      measuredCalls: ledger.calls, costUSD: Number(ledger.cost), runStatus: state.run.status, goalOutcome: state.run.goalOutcome,
      staleCapabilitiesFiltered: true, retiredToolsRegistered: false,
      answerStatesUnavailable: true, claimsSuccess: false, tools, productRows: effects, providerCalls,
      checks: ['stale runtime grants removed', 'retired tools absent', 'honest unavailable answer', 'no retired tool execution', 'zero product effects', 'zero email provider calls', 'measured model ledger'],
    }, null, 2))
  } finally {
    if (!passed) await writeFile(`${output}/results.json`, JSON.stringify({ passed: false, realModel: true, providerCalls }, null, 2))
    __setEmailProviderOverrideForTesting(null)
    await worker?.stop(); await teardownAll()
  }
})
