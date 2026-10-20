import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { ensureSchemaOnce, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model precedes implementation: docs/evidence/issue-217-quality/FAILURE-MODEL.md.
// Only these two original synthetic prompts, no expected answers in model input.
// Never resets the original evidence DB or overwrites a previous run.
const cases = [
  { id: 'comparison', text: '甲方案每月固定100元再加每次2元，乙方案没有月费但每次5元。帮我比较每月使用0到100次时怎么选，并解释交叉点。' },
  { id: 'trend', text: '某店连续六个月销售额分别是12、18、17、25、31、40万元，成本分别是8、11、12、15、17、20万元。分析销售与利润的趋势以及变化最快的月份。' },
]
test('bounded real-provider numerical visualization regression', {
  skip: process.env.LINGXIOS_LIVE_VISUALIZE_QUALITY !== '1', timeout: 450_000,
}, async () => {
  assert.equal(new URL(env.DATABASE_URL).hostname, '127.0.0.1')
  assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_issue217_quality_test')
  assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  assert.equal(env.OPENAI_MODEL, 'zai-org/GLM-5.3-Flash')
  assert.equal(process.env.AGENT_OS_MAX_CONCURRENT_RUNS, '1')
  const maxCalls = Number(process.env.AGENT_OS_MAX_MODEL_CALLS)
  assert.ok(maxCalls >= 1 && maxCalls <= 12 && Number.isInteger(maxCalls))
  assert.equal(process.env.AGENT_OS_MAX_MODEL_TOKENS, '1000000')
  assert.equal(process.env.AGENT_OS_MAX_MODEL_COST_MICROS, '100000')
  assert.equal(process.env.AGENT_OS_MAX_WORK_MS, '180000')
  assert.ok(process.env.AGENT_OS_HOMES_ROOT?.includes('/issue217-quality-homes'))
  await ensureSchemaOnce()
  const attempt = process.env.VISUALIZE_QUALITY_ATTEMPT ?? 'initial'
  assert.match(attempt, /^[a-z][a-z0-9-]{0,30}$/)
  const prefix = attempt === 'initial' ? 'visualize-quality' : `visualize-quality-${attempt}`
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM conversations WHERE id=ANY($1::text[])',
    [cases.map(item => `${prefix}-${item.id}`)])).rows[0].count, 0,
    'Preserve prior evidence; do not rerun into an existing quality conversation')
  const output = process.env.VISUALIZE_QUALITY_OUTPUT ?? `artifacts/issue-217-quality/provider-${attempt}`
  await mkdir(dirname(output), { recursive: true })
  // Atomic admission: even another attempt must never replace prior evidence.
  await mkdir(output)
  const im = await installRecordingWukong()
  // Reuse the original test actor/company for follow-ups. The product permits
  // only one active institutional membership; never move an existing actor to
  // a new company just to rerun this case.
  const original = attempt === 'initial' ? undefined : (await pool.query<{
    companyId: string; projectId: string; agentId: string
  }>(`SELECT room.company_id AS "companyId",room.project_id AS "projectId",run.agent_id AS "agentId"
    FROM conversations room JOIN agent_run_bindings run ON run.company_id=room.company_id AND run.conversation_id=room.id
    WHERE room.id='visualize-quality-comparison' AND run.principal_id='test-owner'`)).rows[0]
  if (attempt !== 'initial') assert.ok(original, 'A follow-up needs the original dedicated test actor and company')
  const { companyId, projectId, agentId } = original ?? await seedCompanyWithAgent()
  if (!original) await seedUserMembership('test-owner', companyId)
  const api = await lingxiOSControl()
  const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN!, port: 0 })
  process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  const results: Record<string, unknown>[] = []
  try {
    worker = await startLingxiOSWorker()
    for (const item of cases) {
      const result: Record<string, unknown> = { id: item.id, completed: false }
      results.push(result)
      let phase = 'ingest'
      try {
        const conversationId = `${prefix}-${item.id}`, members = ['test-owner', agentId]
        await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
        await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
        const policy = await syncConversationPolicy(api, companyId, conversationId), started = Date.now()
        const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version, messageId: `${conversationId}-request`,
          version: 1, author: { id: 'test-owner', kind: 'human' }, mentions: [agentId], text: item.text,
        }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
        const identity = accepted.runs[0], deadline = started + 195_000
        result.runId = identity.runId
        phase = 'wait'
        let state = await api.readRunState(identity)
        while (state && ['queued', 'leased', 'waiting'].includes(state.run.status)) {
          assert.ok(Date.now() < deadline, `bounded live case timed out: ${item.id}`)
          await delay(500); state = await api.readRunState(identity)
        }
        const deliveryDeadline = Date.now() + 5000
        while (state?.delivery === 'pending' && Date.now() < deliveryDeadline) {
          await delay(100); state = await api.readRunState(identity)
        }
        phase = 'read-evidence'
        Object.assign(result, { status: state?.run.status, delivery: state?.delivery, elapsedMs: Date.now() - started })
        const message = (await readRunProjection(api, identity, true)).snapshot.message
        const answer = state?.message?.body ?? ''
        const tools = message.content.flatMap(part => part.type === 'tool-call' ? [part.toolName] : [])
        const ledger = (await pool.query<{ calls: number; measured: boolean; cost: string }>(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
          COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
        const saved = (await pool.query<{ source_hash: string; version: number; html: string }>(
          'SELECT source_hash,version,html FROM im_visualize_documents WHERE company_id=$1 AND channel_id=$2 ORDER BY path', [companyId, conversationId])).rows
        await writeFile(`${output}/${item.id}-answer.md`, answer, { flag: 'wx' })
        for (const [index, document] of saved.entries()) {
          await writeFile(`${output}/${item.id}-${index}.html`, document.html, { flag: 'wx' })
        }
        const documents = saved.map(({ source_hash, version }) => ({ source_hash, version }))
        const references = visualizeReferences(answer).length
        Object.assign(result, {
          completedReferences: references, tools, measuredCalls: ledger.calls, measured: ledger.measured, costUSD: Number(ledger.cost),
          answerSHA256: createHash('sha256').update(answer).digest('hex'), documents,
          // This records runtime completion only; numerical acceptance is the browser
          // regression against independent arithmetic, never the LLM verifier status.
          completed: state?.run.status === 'succeeded' && state.delivery === 'delivered' && ledger.measured && ledger.calls > 0 && references > 0,
        })
      } catch (error) {
        // Do not lose a paid failed/uncertain attempt if polling or evidence
        // collection throws. Error messages can contain input; record type only.
        Object.assign(result, { completed: false, harnessFailure: { phase, errorType: error instanceof Error ? error.name : 'unknown' } })
        throw error
      } finally {
        await writeFile(`${output}/results.json`, JSON.stringify({ attempt, realProvider: true, model: env.OPENAI_MODEL,
          imDeliveryFixture: true, browserRendered: false, perCaseBudget: { calls: maxCalls, tokens: 1_000_000, costUSD: 0.1, workMs: 180_000 }, cases: results }, null, 2))
      }
    }
    assert.ok(results.every(result => result.completed), 'Retain partial/failed cases; completion does not establish numerical correctness')
  } finally {
    await worker?.stop(); await im.close(); await teardownAll()
  }
})
