import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { nativeText } from '../im/message-types.js'

// Failure model precedes implementation in docs/model-availability-failure-model.md.
// Additional failure cases: missing streamed usage settles an estimate; failed tools
// still emit tool.completed; an auxiliary retry replays a completed action or hides
// a provider attempt from either ledger. Check actual HTTP attempts and receipts.
// Cancellation/idle/total driver cases live in LingxiOS PR #30's
// test/auxiliary-streaming.test.ts; this fixture does not claim product cancellation coverage.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await stopLingxiOSControl(); await teardownAll(); await recording?.close() })

for (const model of ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash'])
for (const retryAuxiliary of [false, true]) test(`${model}: slow auxiliary generation preserves measured usage, receipts and the next turn (503 retry=${retryAuxiliary})`, { timeout: 30000 }, async () => {
  const requests: { structured: boolean; stream: boolean; effort: unknown; thinking: unknown; status: number }[] = []
  let injectedFailure = false
  const provider = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk
    const input = JSON.parse(raw)
    assert.equal(input.response_format?.type, 'json_object')
    // Both agent turns and auxiliary review use JSON mode; only main turns
    // receive the public-purpose wire contract (review keeps its own schema).
    const structured = !input.messages.some((message: { role: string; content: string }) =>
      message.role === 'system' && message.content.includes('Public output wire contract (purpose-json-v1):'))
    const fail = retryAuxiliary && structured && !injectedFailure
    requests.push({ structured, stream: input.stream === true, effort: input.reasoning_effort, thinking: input.enable_thinking, status: fail ? 503 : 200 })
    if (fail) {
      injectedFailure = true
      response.writeHead(503, { 'content-type': 'application/json', 'retry-after': '0.01', 'x-request-id': 'synthetic-auxiliary-503' })
      response.end(JSON.stringify({ error: { message: 'PRIVATE_SYNTHETIC_PROVIDER_ERROR' } }))
      return
    }
    const usage = { prompt_tokens: 20, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 4 } }
    if (requests.length === 1) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'fixture-identity', type: 'function', function: { name: 'directory__self', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
      return
    }
    const content = structured ? '{"missing":[]}' : JSON.stringify({ commentary: '', answer: 'Fixture completed.' })
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
    const modelKey = model.startsWith('deepseek') ? 'deepseek' : 'glm'
    const principalId = `auxiliary-human-${modelKey}-${retryAuxiliary}`, room = `auxiliary-latency-${modelKey}-${retryAuxiliary}`, members = [principalId, agentId]
    await seedUserMembership(principalId, companyId)
    await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER') ON CONFLICT DO NOTHING", [projectId, companyId, principalId])
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Fixture',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: api, worker: { id: `auxiliary-latency-${retryAuxiliary}`, concurrency: 1 }, model: {
      ...runtimeModelConfiguration({ id: model, apiKey: 'synthetic-key', baseUrl: 'https://api.siliconflow.cn/v1' }, 1500),
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      firstByteTimeoutMs: 100, streamIdleTimeoutMs: 100,
      recovery: { maxAttempts: 3, totalTimeoutMs: 3000 },
    } })
    const outcomes: unknown[] = []
    for (const messageId of ['first', 'next']) {
      const requestOffset = requests.length
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
        messageId, version: 1, author: { id: principalId, kind: 'human' }, text: 'Answer briefly.', mentions: [agentId] },
      // Exercise completion review without claiming this read requires a business mutation.
      { mode: 'execute', deliveryMode: 'text', codeExecution: 'disabled', executionClass: 'operation' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, room)
      assert.equal(await worker.runNext(), true)
      const state = await api.readRunState(run)
      const expectedFailed = messageId === 'first' && retryAuxiliary ? 1 : 0
      const expectedCalls = (messageId === 'first' ? 3 : 2) + expectedFailed
      const readCalls = async () => (await pool.query('SELECT id,purpose,status,measured,input_tokens,output_tokens,extras,error FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id', [run.runId])).rows
      let calls = await readCalls()
      for (let n = 0; n < 100 && calls.length < expectedCalls; n++) { await delay(20); calls = await readCalls() }
      const events = (await api.readEvents(run, 0)).events
      const startedTools = events.filter(event => event.kind === 'tool.started')
      const completedTools = events.filter(event => event.kind === 'tool.completed')
      // The public replay API intentionally omits internal model events.
      const modelStarts = (await pool.query("SELECT seq,data FROM lingxios.agent_run_events WHERE run_id=$1 AND kind='model.request.started' ORDER BY seq", [run.runId])).rows
      const reviewStarts = modelStarts.filter(event => event.data.purpose === 'structured')
      const receipts = (await pool.query(`SELECT i.idempotency_key,i.intent->'action'->>'action' AS action,l.result
        FROM lingxios.agent_action_intents i LEFT JOIN lingxios.agent_action_ledger l USING(idempotency_key)
        WHERE i.intent->>'workId'=$1 AND i.intent->'action'->>'action'='directory.self'`, [run.runId])).rows
      const settlements = (await pool.query(`SELECT call_id,input_tokens,output_tokens,observation
        FROM lingxios.agent_model_budget_calls WHERE root_work_id=$1 ORDER BY call_id`, [run.runId])).rows
      const currentRequests = requests.slice(requestOffset)
      assert.equal(state?.run.status, 'succeeded')
      assert.equal(state?.message?.body, 'Fixture completed.')
      assert.equal(currentRequests.filter(row => row.structured).length, 1 + expectedFailed, 'exercise review and its exact retry count')
      assert.ok(requests.every(row => row.stream && row.effort === (modelKey === 'glm' ? 'low' : undefined) && row.thinking === false))
      const expectedTools = messageId === 'first' ? 1 : 0
      assert.equal(startedTools.length, expectedTools)
      assert.equal(completedTools.length, expectedTools, 'auxiliary retries and the next turn must not replay the completed tool')
      assert.equal(receipts.length, expectedTools)
      assert.equal(modelStarts.length, expectedCalls)
      assert.equal(reviewStarts.length, 1 + expectedFailed)
      if (expectedTools) {
        assert.equal(startedTools[0]!.data.name, 'directory.self')
        assert.equal(completedTools[0]!.stage, 'completed')
        assert.equal(completedTools[0]!.data.isError, false)
        assert.equal((completedTools[0]!.data.result as { status: string }).status, 'completed')
        assert.equal(receipts[0].action, 'directory.self')
        assert.equal(receipts[0].result?.ok, true)
        assert.equal(completedTools[0]!.data.toolCallId, `host:${receipts[0].idempotency_key}`)
        assert.equal(startedTools[0]!.data.toolCallId, completedTools[0]!.data.toolCallId)
        assert.ok(completedTools[0]!.seq < Number(reviewStarts[0]!.seq), 'the successful tool receipt must precede auxiliary work and its retry')
      }
      assert.equal(currentRequests.length, expectedCalls, 'every outbound attempt must have its own settlement')
      assert.equal(currentRequests.filter(row => row.status === 503).length, expectedFailed)
      assert.equal(calls.length, expectedCalls)
      assert.equal(new Set(calls.map(row => row.id)).size, expectedCalls)
      const failed = calls.filter(row => row.status === 'failed'), succeeded = calls.filter(row => row.status === 'succeeded')
      assert.equal(failed.length, expectedFailed)
      assert.equal(succeeded.length, expectedCalls - expectedFailed)
      for (const call of succeeded) {
        assert.equal(call.measured, true)
        assert.equal(Number(call.input_tokens), 20); assert.equal(Number(call.output_tokens), 8)
        assert.equal(call.extras.reasoningTokens, 4)
        assert.equal(call.extras.costMeasurement, 'measured')
      }
      const reviews = calls.filter(row => row.purpose === 'lingxios.structured').sort((a, b) => a.extras.attempt - b.extras.attempt)
      assert.deepEqual(reviews.map(row => row.extras.attempt), expectedFailed ? [1, 2] : [1])
      if (expectedFailed) {
        assert.equal(failed[0].purpose, 'lingxios.structured')
        assert.equal(failed[0].extras.failure.category, 'unavailable')
        assert.equal(failed[0].extras.failure.status, 503)
        assert.equal(failed[0].extras.failure.requestId, 'synthetic-auxiliary-503')
        assert.equal(failed[0].measured, false)
        assert.equal(failed[0].extras.costMeasurement, 'estimated', 'the 503 response contains no provider usage')
        assert.equal(reviews[1].extras.logicalCallId, reviews[0].extras.callId)
      }
      assert.equal(settlements.length, expectedCalls)
      assert.deepEqual(settlements.map(row => `lingxios-${row.call_id}`).sort(), calls.map(row => row.id).sort())
      for (const settlement of settlements) {
        assert.notEqual(settlement.input_tokens, null); assert.notEqual(settlement.output_tokens, null)
        const call = calls.find(row => row.id === `lingxios-${settlement.call_id}`)!
        assert.equal(settlement.observation.status, call.status)
        assert.equal(settlement.observation.cost.usage, call.extras.costMeasurement)
        assert.equal(settlement.observation.usage.available, call.measured)
        if (call.measured) {
          assert.equal(Number(settlement.input_tokens), 20); assert.equal(Number(settlement.output_tokens), 8)
          assert.equal(settlement.observation.usage.reasoningTokens, 4)
        }
      }
      assert.doesNotMatch(JSON.stringify({ calls, settlements, events }), /PRIVATE_SYNTHETIC_REASONING|PRIVATE_SYNTHETIC_PROVIDER_ERROR|synthetic-key/)
      for (let n = 0; n < 100 && (await api.readRunState(run))?.delivery !== 'delivered'; n++) await delay(20)
      assert.equal((await api.readRunState(run))?.delivery, 'delivered')
      assert.equal(recording.messages.filter(row => row.channelId === room && row.payload.role === 'system').length, 0)
      assert.deepEqual(recording.messages.filter(row => row.channelId === room && row.fromUid === agentId).map(row => nativeText(row.payload)),
        Array.from({ length: messageId === 'first' ? 1 : 2 }, () => 'Fixture completed.'))
      outcomes.push({ status: state?.run.status, completedTools: completedTools.length, successfulReceipts: receipts.length,
        wireAttempts: currentRequests.length, settlements: settlements.length,
        calls: calls.map(row => ({ status: row.status, measured: row.measured, inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens),
          reasoningTokens: row.extras.reasoningTokens ?? null, costMeasurement: row.extras.costMeasurement, attempt: row.extras.attempt, failure: row.extras.failure ?? null })) })
      await mkdir('artifacts/model-availability', { recursive: true })
      await writeFile(`artifacts/model-availability/auxiliary-${modelKey}${retryAuxiliary ? '-retry' : ''}-candidate.json`, JSON.stringify({ passed: messageId === 'next',
        runtime: releaseVersions.runtime, model, fixture: 'local HTTP; 100ms first byte/idle, 250ms generation, 1500ms request, 3000ms logical total', retryAuxiliary,
        elapsedMs: Math.round(performance.now() - began), requests, outcomes }, null, 2) + '\n')
    }
    assert.equal(injectedFailure, retryAuxiliary)
  } finally {
    await worker?.stop(); provider.closeAllConnections()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
