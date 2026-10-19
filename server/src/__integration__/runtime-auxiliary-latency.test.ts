import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model precedes implementation in docs/model-availability-failure-model.md.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await stopLingxiOSControl(); await teardownAll(); await recording?.close() })

test('slow auxiliary generation within the total budget completes without poisoning the next turn', { timeout: 30000 }, async () => {
  const requests: { structured: boolean; stream: boolean }[] = []
  const provider = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk
    const input = JSON.parse(raw), structured = input.response_format?.type === 'json_object'
    requests.push({ structured, stream: input.stream === true })
    const usage = { prompt_tokens: 20, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 4 } }
    const content = structured ? '{"missing":[]}' : 'Fixture completed.'
    if (input.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const heartbeat = setInterval(() => response.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'PRIVATE_SYNTHETIC_REASONING' } }] })}\n\n`), 20)
      try {
        if (structured) await delay(250)
        response.end(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
      } finally { clearInterval(heartbeat) }
    } else {
      if (structured) await delay(250)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage }))
    }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  const began = performance.now()
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    const principalId = 'auxiliary-human', room = 'auxiliary-latency', members = [principalId, agentId]
    await seedUserMembership(principalId, companyId)
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Fixture',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: api, worker: { id: 'auxiliary-latency', concurrency: 1 }, model: {
      id: 'auxiliary-latency-fixture', apiKey: 'synthetic-key', baseUrl: `http://127.0.0.1:${address.port}/v1`,
      maxThinkingTokens: 0, contextWindowTokens: 200000,
      requestTimeoutMs: 1500, firstByteTimeoutMs: 100, streamIdleTimeoutMs: 100,
      recovery: { maxAttempts: 3, totalTimeoutMs: 3000 },
    } })
    const outcomes: unknown[] = []
    for (const messageId of ['first', 'next']) {
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
        messageId, version: 1, author: { id: principalId, kind: 'human' }, text: 'Answer briefly.', mentions: [agentId] },
      { mode: 'execute', codeExecution: 'disabled', executionClass: 'operation' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, room)
      assert.equal(await worker.runNext(), true)
      const state = await api.readRunState(run)
      const calls = (await pool.query('SELECT status,extras,error FROM llm_calls WHERE run_id=$1 ORDER BY created_at', [run.runId])).rows
      outcomes.push({ status: state?.run.status, calls: calls.map(row => ({ status: row.status, failure: row.extras.failure ?? null })) })
      await mkdir('artifacts/model-availability', { recursive: true })
      await writeFile('artifacts/model-availability/auxiliary.json', JSON.stringify({ fixture: 'local HTTP; 100ms first byte, 250ms generation, 1500ms total request',
        elapsedMs: Math.round(performance.now() - began), requests, outcomes }, null, 2) + '\n')
      assert.equal(state?.run.status, 'succeeded')
      assert.equal(state?.message?.body, 'Fixture completed.')
      assert.ok(requests.some(row => row.structured), 'exercise the actual auxiliary model path')
      assert.ok(calls.every(row => row.status === 'succeeded'))
      assert.doesNotMatch(JSON.stringify(calls), /PRIVATE_SYNTHETIC_REASONING|synthetic-key/)
      for (let n = 0; n < 100 && (await api.readRunState(run))?.delivery !== 'delivered'; n++) await delay(20)
      assert.equal((await api.readRunState(run))?.delivery, 'delivered')
      assert.equal(recording.messages.filter(row => row.channelId === room && row.payload.role === 'system').length, 0)
    }
  } finally {
    await worker?.stop(); provider.closeAllConnections()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
