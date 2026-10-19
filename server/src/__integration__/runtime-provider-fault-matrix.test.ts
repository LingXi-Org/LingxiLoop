import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure inventory is retained before this harness in docs/evidence/provider-matrix-20261019/FAILURE-MODEL.md.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
const receipts: unknown[] = []
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => {
  await mkdir('docs/evidence/provider-matrix-20261019', { recursive: true })
  await writeFile('docs/evidence/provider-matrix-20261019/product-fault-results.json', JSON.stringify(receipts, null, 2))
  await teardownAll(); await recording?.close()
})
const until = async (check: () => Promise<boolean>) => {
  for (let n = 0; n < 200; n++) { if (await check()) return; await delay(25) }
  assert.fail('product runtime did not converge within five seconds')
}

for (const mode of ['429', '503', 'socket-reset', 'stream-cut', 'empty-output'] as const) {
  test(`product HTTP ${mode}: bounded attempts, settled ledger, durable result and next human turn`, { timeout: 30000 }, async () => {
    const terminal = mode === 'stream-cut' || mode === 'empty-output'
    let healthy = false, requests = 0, failedResponses = 0
    const provider = createServer(async (request, response) => {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw); requests++
      if (!healthy && (terminal || failedResponses < 2)) {
        failedResponses++
        if (mode === 'socket-reset') { response.destroy(); return }
        if (mode === 'stream-cut') {
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'UNCOMMITTED_PARTIAL' }, finish_reason: null }] })}\n\n`)
          setTimeout(() => response.destroy(), 10)
          return
        }
        if (mode === 'empty-output') {
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
          return
        }
        response.writeHead(Number(mode), { 'content-type': 'application/json', 'retry-after': '0.01', 'x-request-id': `safe-${mode}-${failedResponses}` })
        response.end(JSON.stringify({ error: { message: 'PRIVATE_SYNTHETIC_PROVIDER_BODY', code: mode === '429' ? 'rate_limit_exceeded' : 'server_error' } }))
        return
      }
      const usage = { prompt_tokens: 10, completion_tokens: 2 }
      response.writeHead(200, { 'content-type': input.stream ? 'text/event-stream' : 'application/json' })
      response.end(input.stream
        ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Recovered.' }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`
        : JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"missing":[]}' }, finish_reason: 'stop' }], usage }))
    })
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    let worker: ReturnType<typeof createWorker> | undefined
    try {
      const { companyId, projectId, agentId } = await seedCompanyWithAgent()
      const principalId = `fault-human-${mode}`
      await seedUserMembership(principalId, companyId)
      const room = `fault-matrix-${mode}`, members = [principalId, agentId]
      await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic fault matrix',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
      const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
      const enqueue = async (id: string) => {
        const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
          messageId: id, version: 1, author: { id: principalId, kind: 'human' }, text: 'Answer briefly.', mentions: [agentId] },
        { mode: 'chat', codeExecution: 'disabled', executionClass: 'conversation' })
        const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, room); return run
      }
      const address = provider.address(); assert.ok(address && typeof address !== 'string')
      worker = createWorker({ controlPlane: api, worker: { id: `fault-matrix-${mode}`, concurrency: 1 }, model: {
        id: `fault-matrix-${mode}`, apiKey: 'synthetic-fault-key', baseUrl: `http://127.0.0.1:${address.port}/v1`,
        contextWindowTokens: 200000, requestTimeoutMs: 1000, firstByteTimeoutMs: 1000, streamIdleTimeoutMs: 1000,
        circuitResetMs: 50, recovery: { maxAttempts: 3, totalTimeoutMs: 5000 },
      } })
      const first = await enqueue(`${mode}-first`), began = Date.now()
      assert.equal(await worker.runNext(), true)
      const elapsedMs = Date.now() - began
      assert.ok(elapsedMs < 10000)
      const state = (await api.readRunState(first))!
      const firstRequests = requests
      if (terminal) {
        assert.equal(state.run.status, 'failed')
        assert.equal(state.run.resultId, null)
        assert.equal(failedResponses, 3)
        assert.equal(firstRequests, 3)
        await until(async () => (await api.readTerminal(first))?.delivery === 'delivered')
        assert.equal((await api.readTerminal(first))?.feedback.suppressAgentWake, true)
      } else {
        assert.equal(state.run.status, 'succeeded')
        assert.equal(state.message?.body, 'Recovered.')
        assert.equal(failedResponses, 2)
        assert.equal(firstRequests, 3, 'chat mode needs one successful generation after two transient failures')
        await until(async () => (await api.readRunState(first))?.delivery === 'delivered')
      }
      await until(async () => (await pool.query('SELECT count(*)::int AS n FROM llm_calls WHERE run_id=$1', [first.runId])).rows[0].n === firstRequests)
      const ledger = (await pool.query('SELECT id,status,measured,extras,error FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id', [first.runId])).rows
      assert.equal(new Set(ledger.map(row => row.id)).size, firstRequests)
      assert.equal(ledger.filter(row => row.status === 'failed').length, terminal ? 3 : 2)
      assert.doesNotMatch(JSON.stringify(ledger), /PRIVATE_SYNTHETIC_PROVIDER_BODY|synthetic-fault-key|UNCOMMITTED_PARTIAL/)
      const settled = (await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_model_budget_calls WHERE root_work_id=$1 AND input_tokens IS NOT NULL', [first.runId])).rows[0].n
      assert.equal(settled, firstRequests)
      const notices = () => recording.messages.filter(message => message.channelId === room && message.payload.role === 'system').length
      assert.equal(notices(), terminal ? 1 : 0)
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_work_items WHERE tenant_id=$1', [companyId])).rows[0].n, 1)
      healthy = true; await delay(60)
      const next = await enqueue(`${mode}-next`)
      assert.equal(await worker.runNext(), true)
      await until(async () => (await api.readRunState(next))?.delivery === 'delivered')
      assert.equal((await api.readRun(next))?.status, 'succeeded')
      assert.equal((await api.readMessage(next))?.body, 'Recovered.')
      assert.equal(notices(), terminal ? 1 : 0)
      const pending = (await pool.query("SELECT count(*)::int AS n FROM lingxios.agent_work_items WHERE tenant_id=$1 AND status IN ('queued','leased','waiting')", [companyId])).rows[0].n
      assert.equal(pending, 0)
      receipts.push({ mode, passed: true, realProvider: false, firstStatus: state.run.status, failedResponses,
        firstRequests, settledLedgerRows: settled, elapsedMs, terminalNotices: notices(), nextStatus: 'succeeded', pending,
        sanitizedFailures: ledger.filter(row => row.status === 'failed').map(row => row.extras.failure ?? null) })
    } finally {
      await worker?.stop(); provider.closeAllConnections()
      await new Promise<void>(resolve => provider.close(() => resolve()))
    }
  })
}
