// #633: synthetic provider, real published Worker, product tools and PostgreSQL.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { executionBudgetMessages } from '../../../src/lib/executionBudget.js'
import { createHash } from 'node:crypto'
import { createWorker } from '@lingxi-org/lingxios/worker'
import { skillIndex } from '@lingxi-org/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { runtimeExecutionBudget } from '../agent-runtime/model-budget.js'
import { productSkills } from '../agent-runtime/system-skills.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

before(async () => { await ensureSchemaOnce() })
after(async () => { await stopLingxiOSControl(); await teardownAll() })
const html = (id: string) => `<section id="${id}"><h1>KV Cache ${id}</h1><p>Saved qualification content.</p></section>`
const bad = '<section id="slide-5"><h1>KV Cache 5</h1><table style="border-collapse:collapse"><tr><td>Fix this unsupported style</td></tr></table></section>'

for (const scenario of ['previous-token-limit', 'expanded-budget'] as const) test(`#633 ${scenario}: ten-page save, check, repair, recheck and final answer`, { timeout: 40000 }, async () => {
  await stopLingxiOSControl(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const room = `budget-${scenario}`, principalId = 'test-owner', members = [principalId, agentId]
  await seedUserMembership(principalId, companyId)
  await pool.query(`UPDATE participants SET capabilities='["slides"]'::jsonb WHERE id=$1`, [agentId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [room,companyId,projectId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [room,companyId,JSON.stringify({ channelType: 2,members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
  let calls = 0, artifactId = ''
  const limits = runtimeExecutionBudget(scenario === 'previous-token-limit' ? { AGENT_OS_MAX_MODEL_TOKENS: '1000000' } : {})
  const worker = createWorker({ controlPlane: api, worker: { id: room, concurrency: 1 },
    modelBudget: { ...limits, inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'synthetic-ppt-budget', contextWindowTokens: 1_000_000, maxOutputTokens: 16_384,
      // Deliberately conservative wire admission versus smaller measured usage.
      generationInputTokens: () => 300_000,
      async run() {
        const stage = calls++
        assert.ok(stage <= 9, 'bounded model stages')
        let name = '', input: object = {}
        if (stage === 0) {
          const { name: skillName, version, hash } = skillIndex(productSkills.find(skill => skill.name === 'claude-slides')!)
          name = 'skills__load'; input = { name: skillName, version, hash }
        } else if (stage === 1) { name = 'slides__create'; input = { title: 'Synthetic ten-page KV Cache' } }
        else {
          const artifact = (await pool.query('SELECT id FROM artifacts WHERE company_id=$1 AND conversation_id=$2', [companyId,room])).rows[0]
          assert.ok(artifact); artifactId = artifact.id
          if (stage === 2) { name = 'slides__read_file'; input = { artifactId, path: 'project/deck.json' } }
          if (stage >= 3 && stage <= 5) {
            const files: Record<string, object> = {}
            const start = (stage - 3) * 4 + 1
            for (let page = start; page <= Math.min(10, start + 3); page++) files[`project/slides/slide-${page}.html`] = { content: page === 5 ? bad : html(`slide-${page}`), ifMatch: null }
            if (stage === 5) {
              const index = (await pool.query('SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifactId,'project/deck.json'])).rows[0]
              const metadata = JSON.parse(index.body.toString()); metadata.order = Array.from({ length: 10 }, (_, n) => `slide-${n+1}`)
              files['project/deck.json'] = { content: JSON.stringify(metadata), ifMatch: index.sha256 }
            }
            name = 'slides__write_files'; input = { artifactId, files }
          }
          if (stage === 6 || stage === 8) { name = 'slides__check'; input = { artifactId } }
          if (stage === 7) {
            name = 'slides__write_files'; input = { artifactId, files: { 'project/slides/slide-5.html': { content: html('slide-5'), ifMatch: createHash('sha256').update(bad).digest('hex') } } }
          }
        }
        const text = stage === 9 ? '十页演示文稿已保存，已检查、修正并复查。' : ''
        return { text, output: name ? [{ type: 'function_call' as const, callId: `step-${stage}`, name, arguments: JSON.stringify(input) }]
          : [{ role: 'assistant' as const, content: text }], usage: { available: true as const, inputTokens: 90_000, outputTokens: 1 } }
      },
      async structured() { return { model: 'synthetic-ppt-budget', value: { missing: [] }, usage: { available: true, inputTokens: 10, outputTokens: 1 } } },
      async compact() { throw Error('bounded synthetic fixture must not compact') },
    } })
  try {
    const run = (await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
      messageId: 'request', version: 1, author: { id: principalId, kind: 'human' }, text: '制作十页 KV Cache 演示文稿，检查并修正后完成答复。', mentions: [agentId] },
    { mode: 'execute', codeExecution: 'disabled', deliveryMode: 'auto', executionClass: 'conversation' })).runs[0]
    assert.ok(run); await bindProductRun(pool, run, room); assert.equal(await worker.runNext(), true)
    const state = await api.readRunState(run)
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM artifact_files WHERE artifact_id=$1 AND path LIKE 'project/slides/%'", [artifactId])).rows[0].n, 10)
    const budget = (await pool.query('SELECT max_tokens,max_model_calls,max_cost_micros,max_execution_ms,tokens,model_calls,cost_micros FROM lingxios.agent_model_budgets WHERE root_work_id=$1', [run.runId])).rows[0]
    assert.equal(Number(budget.max_tokens), limits.maxTokens)
    assert.equal(Number(budget.max_model_calls), limits.maxModelCalls)
    assert.equal(Number(budget.max_cost_micros), limits.maxCostMicros)
    assert.equal(Number(budget.max_execution_ms), limits.wallClockMs)
    const ledger = (await pool.query('SELECT COALESCE(sum(input_tokens+output_tokens),0) AS tokens,COALESCE(sum(cost_micros),0) AS cost,count(*) FILTER(WHERE input_tokens IS NULL)::int AS pending FROM lingxios.agent_model_budget_calls WHERE root_work_id=$1', [run.runId])).rows[0]
    assert.equal(ledger.pending, 0); assert.equal(Number(budget.tokens), Number(ledger.tokens), 'settled usage replaces reservations')
    assert.equal(Number(budget.cost_micros), Number(ledger.cost))
    const { events } = await api.readEvents(run)
    const checks = events.filter(event => event.kind === 'tool.completed' && JSON.stringify(event.data.result).includes('slideCount'))
    assert.ok(checks.length >= 1)
    assert.ok((checks[0].data.result as { value: { problems: number } }).value.problems > 0, 'the initial checker must observe the unsupported style')
    if (scenario === 'previous-token-limit') {
      assert.equal(state?.run.status, 'failed')
      const failure = events.find(event => event.kind === 'run.failed')!
      assert.equal((failure.data.budgetLimit as { dimension: string }).dimension, 'tokens')
      assert.ok(Number(budget.tokens) < 1_000_000, 'a next-call reservation can exhaust tokens before measured usage reaches the limit')
      const message = (await readRunProjection(api, run, true)).snapshot.message
      assert.equal(message.status?.type, 'incomplete')
      assert.equal(message.metadata.custom.harnessError, executionBudgetMessages.tokens)
      assert.ok(message.content.some(part => part.type === 'tool-call' && part.toolName === 'slides.write_files' && !part.isError))
    } else {
      assert.equal(state?.run.status, 'succeeded')
      assert.equal(state.run.goalOutcome?.status, 'satisfied')
      const last = checks.at(-1)!.data.result as { value: { slideCount: number; problems: number } }
      assert.equal(last.value.slideCount, 10); assert.equal(last.value.problems, 0)
      assert.match(state.message!.body, /已检查、修正并复查/)
      const deadline = Date.now() + 5000
      while ((await api.readRunState(run))?.delivery !== 'delivered') { assert.ok(Date.now() < deadline); await delay(30) }
      assert.ok(im.messages.some(message => message.channelId === room))
    }
    console.info(JSON.stringify({ qualification: 'synthetic-provider-real-product-tools-and-ledger', scenario, calls,
      tokens: Number(budget.tokens), nextReservationTokens: 316384, savedPages: 10, checks: checks.length, status: state?.run.status }))
  } finally { await worker.stop(); await stopLingxiOSControl(); await im.close() }
})
