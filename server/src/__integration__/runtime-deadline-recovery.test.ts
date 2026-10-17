import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure inventory: the outer model deadline becomes generic execution_failed,
// a hanging transport survives expiry, its usage stays unsettled, feedback is
// duplicated on replay, or the failed turn prevents a new human request.
test('total provider deadline persists classified feedback and the next turn succeeds', { timeout: 30000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const recording = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined
  let healthy = false, requests = 0, disconnected = 0
  const provider = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk
    const input = JSON.parse(raw); requests++
    if (!healthy) { response.on('close', () => { disconnected++ }); return }
    const usage = { prompt_tokens: 10, completion_tokens: 2 }
    response.writeHead(200, { 'content-type': input.stream ? 'text/event-stream' : 'application/json' })
    response.end(input.stream
      ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Recovered.' }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`
      : JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"missing":[]}' }, finish_reason: 'stop' }], usage }))
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const room = 'total-deadline-room', members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Deadline',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
    const enqueue = async (messageId: string) => {
      const result = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
        messageId, version: 1, author: { id: 'test-owner', kind: 'human' }, text: 'Answer briefly.', mentions: [agentId] },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const run = result.runs[0]; assert.ok(run); await bindProductRun(pool, run, room); return run
    }
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    const startWorker = (timeout: number) => createWorker({ controlPlane: api,
      model: { id: `total-deadline-${timeout}`, baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'synthetic-deadline-fixture',
        contextWindowTokens: 200000, requestTimeoutMs: 5000, firstByteTimeoutMs: 5000, recovery: { maxAttempts: 3, totalTimeoutMs: timeout } },
      worker: { id: `deadline-${timeout}`, concurrency: 1 } })
    const failed = await enqueue('total-deadline-failed'), began = performance.now()
    worker = startWorker(100)
    await worker.runNext()
    const elapsedMs = performance.now() - began
    assert.equal((await api.readRun(failed))?.status, 'failed')
    assert.equal((await api.readRun(failed))?.resultId, null)
    const deadline = AbortSignal.timeout(5000)
    while ((await api.readTerminal(failed))?.delivery !== 'delivered') { deadline.throwIfAborted(); await delay(20) }
    assert.equal((await api.readTerminal(failed))?.feedback.reason, 'model_unavailable')
    assert.equal(requests, 1); assert.equal(disconnected, 1); assert.ok(elapsedMs < 3000)
    const calls = await pool.query('SELECT input_tokens,output_tokens,observation FROM lingxios.agent_model_budget_calls WHERE work_id=$1', [failed.runId])
    assert.equal(calls.rows.length, 1); assert.notEqual(calls.rows[0].input_tokens, null)
    assert.equal(calls.rows[0].observation.failure.category, 'timeout')
    await worker.stop(); healthy = true; worker = startWorker(5000)
    const next = await enqueue('total-deadline-next'); await worker.runNext()
    assert.equal((await api.readRun(next))?.status, 'succeeded')
    while ((await api.readRunState(next))?.delivery !== 'delivered') { deadline.throwIfAborted(); await delay(20) }
    const notices = recording.messages.filter(message => message.channelId === room && message.payload.role === 'system')
    assert.equal(notices.length, 1)
    assert.equal((await api.readTerminal(failed))?.delivery, 'delivered')
    await mkdir('artifacts/runtime-development', { recursive: true })
    await writeFile('artifacts/runtime-development/deadline.json', JSON.stringify({ initialRequests: 1, totalRequests: requests,
      disconnected, elapsedMs, status: 'failed', reason: 'model_unavailable', nextStatus: 'succeeded', notices: notices.length,
      settledCalls: calls.rows.length, syntheticProvider: true }, null, 2))
  } finally {
    await worker?.stop(); provider.closeAllConnections()
    await new Promise<void>(resolve => provider.close(() => resolve()))
    await teardownAll(); await recording.close()
  }
})
