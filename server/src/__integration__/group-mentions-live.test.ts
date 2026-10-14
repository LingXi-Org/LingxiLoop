import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { createNativeMessage, nativeText } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Live failure cases: one agent does every role, prose never dispatches, unbounded
// mentions, wrong principal, incorrect arithmetic, hidden children, or missing metering.
test('live model uses the product collaboration rules and ends a public specialist chain', {
  skip: process.env.LINGXIOS_LIVE_GROUP_MENTIONS !== '1', timeout: 360000,
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_release_mentions_model_test')
  const output = 'artifacts/group-mentions/live'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: false }))
  await ensureSchemaOnce(); await resetAllTables()
  const recording = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent({ agentId: 'planner' })
    await seedUserMembership('test-owner', companyId)
    const roles = [
      { id: agentId, name: '规划员', role: '分配专业工作，复杂问题优先请研究员完成计算，请复核员独立检查。' },
      { id: 'solver', name: '研究员', role: '完成被分配的数学计算并给出过程，交由复核员独立检查。' },
      { id: 'verifier', name: '复核员', role: '独立检查研究员的结果，正确且任务结束时直接说明结论；需要修正时再联系相关成员。' },
    ]
    for (const role of roles) await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,system_prompt,initial,avatar_bg,status,capabilities)
      VALUES($1,$2,'agent',$3,$4,$4,'M','#abcdef','avail','[]') ON CONFLICT(id,company_id)
      DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,system_prompt=EXCLUDED.system_prompt,capabilities=EXCLUDED.capabilities`,
    [role.id, companyId, role.name, role.role])
    const channelId = 'live-mentions', members = ['test-owner', ...roles.map(role => role.id)]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
      [channelId, companyId, projectId, JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
      [channelId, companyId, JSON.stringify({ channelType: 2, members }), agentId])
    const payload = createNativeMessage({ id: 'live-mention-source', role: 'user', content: [{ type: 'text',
      text: '@planner 请通过专业分工计算并独立复核17×23，给出过程和结论。每次发言80字以内，无需创建业务记录。' }] })
    await imMessagesApplication.acceptUserMessage({ companyId, userId: 'test-owner', channelId, clientNonce: payload.id, payload })
    await receiveAgentRequest({ companyId, agentId, channelId, clientMsgNo: payload.id })
    const api = await lingxiOSControl()
    worker = createWorker({ controlPlane: api, policy: new ProductRuntimePolicy(), worker: { id: 'live-group-mentions', concurrency: 1, shutdownGraceMs: 1000 },
      modelBudget: { inputCostMicrosPerMillion: Number(process.env.AGENT_OS_INPUT_COST_MICROS_PER_MILLION),
        outputCostMicrosPerMillion: Number(process.env.AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION) },
      model: { id: process.env.OPENAI_MODEL!, apiKey: process.env.OPENAI_API_KEY!, baseUrl: process.env.OPENAI_BASE_URL!,
        requestTimeoutMs: 90000, maxThinkingTokens: 0, capabilities: { parallelTools: false } },
    })
    await worker.start()
    const deadline = Date.now() + 280000
    let idle = 0
    while (idle < 10) {
      assert.ok(Date.now() < deadline, 'live collaboration did not settle')
      const runs = (await pool.query('SELECT * FROM agent_run_bindings WHERE company_id=$1', [companyId])).rows
      const states = await Promise.all(runs.map(run => api.readRunState({ runId: run.run_id, tenantId: companyId,
        agentId: run.agent_id, principalId: run.principal_id, sessionId: run.session_id, ...(run.thread_id ? { threadId: run.thread_id } : {}) })))
      assert.ok(states.every(state => state?.run.status !== 'failed' && state?.run.status !== 'cancelled'), 'live run failed')
      idle = states.length > 0 && states.every(state => state && ['succeeded', 'partial', 'blocked'].includes(state.run.status) && state.delivery === 'delivered') ? idle + 1 : 0
      await delay(250)
    }
    await worker.stop(); worker = undefined
    const messages = recording.messages.filter(message => message.payload.role === 'assistant')
    assert.ok(messages.length >= 3 && messages.length <= 8)
    assert.deepEqual([...new Set(messages.map(message => message.fromUid))].sort(), roles.map(role => role.id).sort())
    assert.match(nativeText(messages.at(-1)!.payload), /391/)
    assert.equal((await pool.query('SELECT 1 FROM lingxios.agent_work_waits')).rowCount, 0)
    const runs = (await pool.query('SELECT run_id,agent_id,principal_id,internal FROM agent_run_bindings')).rows
    assert.ok(runs.every(run => run.principal_id === 'test-owner' && !run.internal))
    const usage = (await pool.query(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
      COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1`, [companyId])).rows[0]
    assert.ok(usage.calls >= messages.length && usage.measured && Number(usage.cost) <= 0.25)
    await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, model: process.env.OPENAI_MODEL,
      reproduce: 'node e2e/server/group-mentions-live.mjs --live-group-mentions', usage, runs,
      messages: messages.map(message => ({ author: message.fromUid, text: nativeText(message.payload) })),
      transport: 'recording WuKong fixture', realModel: true, runtime: '3.4.1', maxChainCostUSD: 0.25 }, null, 2))
  } finally { await worker?.stop(); await recording.close(); await teardownAll() }
})
