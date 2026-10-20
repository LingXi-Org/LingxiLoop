import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { ApprovedModelFallback } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure inventory: docs/evidence/issues-155-157-basic/FAILURE-MODEL.md.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
const receipts: unknown[] = []
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => {
  try {
    if (process.env.BASIC_ACCEPTANCE_RECEIPTS) await writeFile(process.env.BASIC_ACCEPTANCE_RECEIPTS, JSON.stringify(receipts, null, 2), { flag: 'wx' })
  } finally { await teardownAll(); await recording?.close() }
})
const until = async (check: () => Promise<boolean>) => {
  const signal = AbortSignal.timeout(5000)
  while (!await check()) { signal.throwIfAborted(); await delay(20) }
}
async function fixture(room: string, specialists: string[] = []) {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const principalId = `human-${room}`
  await seedUserMembership(principalId, companyId)
  for (const id of specialists) await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES($1,$2,'agent',$1,'specialist','B','#abcdef','avail')`, [id, companyId])
  const members = [principalId, agentId, ...specialists]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Basic acceptance',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
  const enqueue = async (messageId: string) => {
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
      messageId, version: 1, author: { id: principalId, kind: 'human' }, text: 'Answer briefly.', mentions: [agentId] },
    { mode: 'chat', codeExecution: 'disabled', executionClass: 'conversation' })
    const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, room); return run
  }
  return { api, enqueue, companyId, principalId, agentId }
}
const usage = { available: true, inputTokens: 10, outputTokens: 2 }
function driver(id: string, answer: () => string): ApprovedModelFallback['model'] {
  return { modelId: id, previewFormat: 'user-text', contextWindowTokens: 200000, maxOutputTokens: 8192, maxThinkingTokens: 0,
    profile: { id, contextWindowTokens: 200000, maxOutputTokens: 8192, maxThinkingTokens: 0, toolCalls: true, jsonObject: true, parallelTools: true },
    async run() { const text = answer(); return { output: [{ role: 'assistant', content: text }], text, model: id, usage } },
    async structured() { return { value: { missing: [] }, model: id, usage } },
    async compact() { throw new Error('short acceptance must not compact') } }
}
for (const mode of ['available', 'absent', 'revoked'] as const) test(`fallback ${mode}: explicit result, shared ledger and bounded primary rejection`, { timeout: 15000 }, async () => {
  const { api, enqueue, companyId, principalId } = await fixture(`fallback-${mode}`)
  let primaryCalls = 0, secondaryCalls = 0, authorizationChecks = 0
  const provider = createServer(async (request, response) => {
    for await (const _ of request) { /* Consume synthetic request without retaining content. */ }
    primaryCalls++
    response.writeHead(402, { 'content-type': 'application/json', 'x-request-id': 'synthetic-fallback-rejection' })
    response.end(JSON.stringify({ error: { code: 'insufficient_quota', message: 'PRIVATE_FALLBACK_BODY' } }))
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  const worker = createWorker({ controlPlane: api, worker: { id: `fallback-${mode}`, concurrency: 1 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { id: `primary-${mode}`, apiKey: 'synthetic-fallback-key', baseUrl: `http://127.0.0.1:${address.port}/v1`,
      contextWindowTokens: 200000, recovery: { maxAttempts: 3, totalTimeoutMs: 2000 } },
    ...(mode === 'absent' ? {} : { fallbackModel: {
      model: driver(`secondary-${mode}`, () => { secondaryCalls++; return 'Approved fallback answer.' }),
      inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1,
      async authorize({ work }: Parameters<ApprovedModelFallback['authorize']>[0]) {
        authorizationChecks++; assert.equal(work.tenantId, companyId); assert.equal(work.principalId, principalId)
        if (mode === 'revoked') throw new Error('route revoked')
      },
    } }),
  })
  try {
    const run = await enqueue(`fallback-source-${mode}`)
    await worker.runNext()
    const state = (await api.readRunState(run))!
    assert.equal(primaryCalls, 1); assert.equal(secondaryCalls, mode === 'available' ? 1 : 0)
    assert.equal(authorizationChecks, mode === 'absent' ? 0 : 1)
    assert.equal(state.run.status, mode === 'available' ? 'succeeded' : 'failed')
    if (mode === 'available') {
      assert.equal(state.message?.body, 'Approved fallback answer.')
      await until(async () => (await api.readRunState(run))?.delivery === 'delivered')
    } else {
      assert.equal(state.run.resultId, null)
      await until(async () => (await api.readTerminal(run))?.delivery === 'delivered')
    }
    const rows = (await pool.query('SELECT model,status,extras,error FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id', [run.runId])).rows
    assert.equal(rows.length, primaryCalls + secondaryCalls)
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_FALLBACK_BODY|synthetic-fallback-key/)
    if (mode === 'available') {
      assert.deepEqual(rows.map(row => row.extras.attempt), [1, 2])
      assert.equal(rows[1].extras.logicalCallId, rows[0].extras.callId)
    }
    const budgets = (await pool.query('SELECT root_work_id,model_calls FROM lingxios.agent_model_budgets WHERE root_work_id=$1', [run.runId])).rows
    assert.equal(budgets.length, 1); assert.equal(Number(budgets[0].model_calls), rows.length)
    receipts.push({ scenario: `fallback-${mode}`, status: state.run.status, primaryCalls, secondaryCalls, authorizationChecks,
      ledgerRows: rows.length, rootBudgets: budgets.length, syntheticProvider: true })
  } finally { await worker.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())) }
})

test('shared root rejects two mentions once, preserves committed result, and gives a new human message its own budget', { timeout: 20000 }, async () => {
  const room = 'basic-fanout', specialists = ['basic-first', 'basic-second']
  const { api, enqueue, companyId } = await fixture(room, specialists)
  let healthy = false
  const worker = createWorker({ controlPlane: api, worker: { id: 'basic-fanout', concurrency: 1 }, modelBudget: { maxModelCalls: 2 },
    model: driver('basic-fanout', () => healthy ? 'New message completed.' : `Completed root answer. @${specialists[0]} @${specialists[1]}`) })
  try {
    const first = await enqueue('basic-root'); await worker.runNext()
    await until(async () => (await api.readTerminal(first))?.delivery === 'delivered')
    const firstState = (await api.readRunState(first))!, feedback = (await api.readTerminal(first))!
    assert.equal(firstState.run.status, 'succeeded'); assert.match(firstState.message!.body, /Completed root answer/)
    assert.equal(feedback.feedback.notStartedCount, 2); assert.equal(feedback.feedback.reason, 'budget_limit')
    assert.equal(feedback.feedback.suppressAgentWake, true)
    const children = (await pool.query("SELECT id FROM lingxios.agent_work_items WHERE meta->>'rootWorkId'=$1", [first.runId])).rows
    assert.equal(children.length, 0)
    const denials = (await pool.query('SELECT dimension FROM lingxios.agent_budget_denials WHERE root_work_id=$1', [first.runId])).rows
    assert.deepEqual(denials.map(row => row.dimension), ['calls', 'calls'])
    const noticeCount = () => recording.messages.filter(message => message.channelId === room && message.payload.role === 'system').length
    assert.equal(noticeCount(), 1)
    const budgetBefore = (await pool.query('SELECT model_calls,tokens,cost_micros FROM lingxios.agent_model_budgets WHERE root_work_id=$1', [first.runId])).rows
    assert.equal((await enqueue('basic-root')).runId, first.runId)
    assert.equal(await worker.runNext(), false); assert.equal(noticeCount(), 1)
    healthy = true
    const next = await enqueue('basic-next'); assert.notEqual(next.runId, first.runId)
    await worker.runNext(); await until(async () => (await api.readRunState(next))?.delivery === 'delivered')
    assert.equal((await api.readRun(next))?.status, 'succeeded')
    assert.deepEqual((await pool.query('SELECT model_calls,tokens,cost_micros FROM lingxios.agent_model_budgets WHERE root_work_id=$1', [first.runId])).rows, budgetBefore)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_model_budgets WHERE root_work_id=ANY($1::text[])', [[first.runId, next.runId]])).rows[0].n, 2)
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM lingxios.agent_work_items WHERE tenant_id=$1 AND status IN ('queued','leased','waiting')", [companyId])).rows[0].n, 0)
    assert.equal(noticeCount(), 1)
    receipts.push({ scenario: 'shared-root-product-fanout', notStarted: 2, children: 0, notices: noticeCount(),
      rootResultPreserved: true, oldBudgetUnchanged: true, nextStatus: 'succeeded', independentRootBudgets: 2, syntheticProvider: true })
  } finally { await worker.stop() }
})
