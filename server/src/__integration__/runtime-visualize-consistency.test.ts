import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { skillIndex } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { env } from '../env.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async () => { await teardownAll() })

// Synthetic measurements test consistency, not the correctness of a FlashAttention IO model.
const requestText = '按给定测试数据创建交互对比图并说明默认值：n=1024，d=64，Br=Bc=64；普通9.25 MiB，Flash20.3 MiB。'
// biome-ignore lint/suspicious/noTemplateCurlyInString: This literal is the saved guest script, not a host template.
const html = '<div><label>n <input id="n" type="range" value="1024" min="512" max="2048"></label><output id="values"></output></div><script>const measured={ordinary:9.25,flash:20.3};function render(){document.getElementById("values").textContent=`${measured.ordinary} MiB / ${measured.flash} MiB = ${(measured.ordinary/measured.flash).toFixed(2)}`;}document.getElementById("n").addEventListener("input",render);render();</script>'

const liveReview = process.env.LINGXIOS_LIVE_VISUALIZE_CONSISTENCY === '1'
for (const scenario of liveReview ? ['contradictory'] as const : ['consistent', 'contradictory', 'unavailable-review'] as const) test(`native visualization content review: ${scenario}`, { timeout: liveReview ? 120_000 : 35_000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const userId = 'test-owner', channelId = 'visualize-consistency', members = [userId, agentId]
  await seedUserMembership(userId, companyId)
  await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3', [JSON.stringify(['visualize']), companyId, agentId])
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic consistency',$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  let generations = 0, reviews = 0, runId = '', handlerError: unknown
  const provider = createServer(async (req, res) => {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk
      const input = JSON.parse(raw)
      let delta: object
      if (!input.tools?.length) {
        reviews++; assert.ok(reviews <= (scenario === 'unavailable-review' ? 3 : 1), 'one native scope, with only its existing malformed-JSON repair allowance')
        assert.ok(raw.includes('visualize-content-consistency-v1'))
        assert.ok(raw.includes('measured'), 'the reviewer receives actual saved-source/readback, not just a saved path')
        if (liveReview) {
          assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
          const upstream = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: raw, signal: AbortSignal.timeout(90_000),
          })
          assert.equal(upstream.status, 200)
          res.writeHead(200, { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream' })
          assert.ok(upstream.body); for await (const chunk of upstream.body) res.write(chunk)
          res.end(); return
        }
        if (scenario === 'unavailable-review') {
          delta = { content: '{invalid review' }
        } else {
          if (scenario === 'contradictory') assert.ok(raw.includes('8.31') && raw.includes('3.16'))
          delta = { content: JSON.stringify({ missing: scenario === 'contradictory'
            ? [{ quote: '说明默认值', reason: 'For the same default inputs the answer says 8.31/3.16=2.63, while the saved source/readback uses 9.25/20.3=0.46.', priority: 'required' }] : [], limitations: [] }) }
        }
      } else {
        generations++; assert.ok(generations <= 6)
        const calls: Array<{ name: string; args: unknown }> = []
        if (generations === 1) { const { name, version, hash } = skillIndex(visualizeSkill); calls.push({ name: 'skills__activate', args: { name, version, hash } }) }
        if (generations === 2) calls.push({ name: 'visualize__save', args: { name: 'synthetic-transfer', html } })
        const saved = (await pool.query('SELECT path FROM im_visualize_documents WHERE run_id=$1', [runId])).rows[0]
        if (generations === 3) { assert.ok(saved); calls.push({ name: 'visualize__read', args: { path: saved.path } }) }
        const parts = reviews ? (await pool.query("SELECT input->>'partId' AS id FROM lingxios.agent_steps WHERE work_id=$1 AND kind='runtime.answer_segment' ORDER BY step_seq", [runId])).rows : []
        if (generations >= 4) calls.push({ name: 'public_answer', args: {
          operation: reviews ? { kind: 'replace', supersedes: [parts.at(-1).id] } : { kind: 'append', supersedes: [] }, answer: (reviews ? '图与说明的数值一致性尚未确认。' : scenario === 'contradictory' ? '默认值8.31 MiB / 3.16 MiB，比值2.63。' : '默认值9.25 MiB / 20.3 MiB，比值0.46。')
            + '\n::visualize' + JSON.stringify({ path: saved.path }), commentary: '', outcome: reviews ? { status: 'partial', gaps: ['Numerical consistency remains unresolved.'] } : { status: 'satisfied', gaps: [] },
        } })
        delta = { tool_calls: calls.map((call, index) => ({ index, id: `call-${generations}-${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: 'tool_calls' in delta ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
    } catch (error) { handlerError ??= error; res.writeHead(500); res.end('{}') }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: api, policy: new ProductRuntimePolicy(), modelBudget: { maxModelCalls: 8 },
      model: { ...runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: 'synthetic-only', baseUrl: 'https://api.siliconflow.cn/v1' }, 90_000), baseUrl: `http://127.0.0.1:${address.port}/v1` },
      worker: { id: 'visualize-consistency', concurrency: 1 } })
    const run = (await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version, messageId: 'request', version: 1,
      author: { id: userId, kind: 'human' }, text: requestText, mentions: [agentId] }, { mode: 'execute', codeExecution: 'disabled', deliveryMode: 'auto', executionClass: 'conversation' })).runs[0]
    assert.ok(run); runId = run.runId; await bindProductRun(pool, run, channelId); await worker.runNext()
    assert.equal(handlerError, undefined); assert.equal(reviews, scenario === 'unavailable-review' ? 3 : 1)
    const state = await api.readRunState(run)
    const review = (await pool.query("SELECT output FROM lingxios.agent_steps WHERE work_id=$1 AND kind='runtime.review'", [runId])).rows
    assert.equal(review.length, 1)
    const result = JSON.parse(review[0].output)
    if (scenario === 'consistent') {
      assert.equal(state?.run.status, 'succeeded'); assert.equal(result.error, undefined); assert.deepEqual(result.missing, [])
    } else {
      assert.equal(state?.run.goalOutcome?.status, 'partial', 'delivery cannot turn a content gap or failed review into satisfaction')
      if (scenario === 'contradictory') assert.ok(result.missing.length > 0)
      else assert.ok(result.error)
    }
    console.info(JSON.stringify({ qualification: liveReview ? 'real-reviewer-synthetic-generation-real-worker-consistency' : 'synthetic-model-real-worker-consistency', scenario, generations, reviews, status: state?.run.status, goal: state?.run.goalOutcome, browserValidation: false }))
  } finally { await worker?.stop(); await stopLingxiOSControl(); await im.close(); await new Promise<void>(resolve => provider.close(() => resolve())) }
})
