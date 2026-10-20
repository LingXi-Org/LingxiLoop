import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Product runtime integration, real provider; only IM delivery and object storage
// use the existing local fixtures. Failure model: no implicit trigger, decorative
// cards for trivial answers, missing completed references, unmeasured provider use.
const cases = [
  { id: 'comparison', visual: true, text: '甲方案每月固定100元再加每次2元，乙方案没有月费但每次5元。帮我比较每月使用0到100次时怎么选，并解释交叉点。' },
  { id: 'relationships', visual: true, text: '我分不清浏览器、Web服务器、应用服务、数据库和缓存之间的关系。用一个具体的登录请求解释它们的连接和各自职责。' },
  { id: 'process', visual: true, text: '解释订单从创建、付款、库存检查到发货的完整流程，付款失败和库存不足分别走哪条分支？' },
  { id: 'trend', visual: true, text: '某店连续六个月销售额分别是12、18、17、25、31、40万元，成本分别是8、11、12、15、17、20万元。分析销售与利润的趋势以及变化最快的月份。' },
  { id: 'exploration', visual: true, text: '房间长6米宽4米，每箱地板可铺2平方米，单价180元。我想调整损耗率0到20%，看看箱数和费用怎么变。' },
  { id: 'fact', visual: false, text: '一小时有多少分钟？简短回答。' },
  { id: 'greeting', visual: false, text: '你好！' },
]
test('real provider chooses useful visual explanations without a visualization keyword', {
  skip: process.env.LINGXIOS_LIVE_VISUALIZE_TRIGGER !== '1', timeout: 1_500_000,
}, async () => {
  assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_issue213217_test')
  assert.equal(new URL(env.DATABASE_URL).hostname, '127.0.0.1')
  assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  assert.equal(process.env.AGENT_OS_MAX_CONCURRENT_RUNS, '1')
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const api = await lingxiOSControl()
  const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN!, port: 0 })
  process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  const output = process.env.VISUALIZE_TRIGGER_OUTPUT ?? 'artifacts/issue-213-217/live-trigger'
  await mkdir(output, { recursive: true })
  const results: Record<string, unknown>[] = []
  try {
    worker = await startLingxiOSWorker()
    for (const item of cases) {
      const conversationId = `visualize-trigger-${item.id}`, members = ['test-owner', agentId]
      await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
      await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
      const policy = await syncConversationPolicy(api, companyId, conversationId), started = Date.now()
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version, messageId: `${conversationId}-request`,
        version: 1, author: { id: 'test-owner', kind: 'human' }, mentions: [agentId], text: item.text,
      }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const identity = accepted.runs[0], deadline = started + 195_000
      let state = await api.readRunState(identity)
      while (state && ['queued', 'leased', 'waiting'].includes(state.run.status)) {
        assert.ok(Date.now() < deadline, `bounded live case timed out: ${item.id}`)
        await delay(500)
        state = await api.readRunState(identity)
      }
      const deliveryDeadline = Date.now() + 5000
      while (state?.delivery === 'pending' && Date.now() < deliveryDeadline) {
        await delay(100)
        state = await api.readRunState(identity)
      }
      const message = (await readRunProjection(api, identity, true)).snapshot.message
      // Undelivered UI projections intentionally suppress visualize references.
      // Measure the completed native result, and report delivery separately.
      const answer = state?.message?.body ?? ''
      const tools = message.content.flatMap(part => part.type === 'tool-call' ? [part.toolName] : [])
      const ledger = (await pool.query<{ calls: number; measured: boolean; cost: string }>(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
        COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
      const references = visualizeReferences(answer).length
      results.push({ id: item.id, expectedVisual: item.visual, status: state?.run.status, delivery: state?.delivery, elapsedMs: Date.now() - started,
        completedReferences: references, tools, measuredCalls: ledger.calls, measured: ledger.measured, costUSD: Number(ledger.cost),
        answerSHA256: createHash('sha256').update(answer).digest('hex'),
        passed: state?.run.status === 'succeeded' && state.delivery === 'delivered' && ledger.measured && ledger.calls > 0 && (item.visual ? references > 0 : references === 0 && !tools.includes('visualize.save')),
      })
      await writeFile(`${output}/results.json`, JSON.stringify({ realProvider: true, model: env.OPENAI_MODEL, imDeliveryFixture: true, browserRendered: false, cases: results }, null, 2))
    }
    assert.ok(results.every(result => result.passed), 'See per-case real-provider evidence; failed cases must not be reported as passed')
  } finally {
    await worker?.stop(); await im.close(); await teardownAll()
  }
})
