import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { pool } from '../db/pool.js'
import { createChatCompletion } from '../llm.js'
import { env } from '../env.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { assistantRunResponse, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failures: a real tool turn loses previews; commit clears text; the stream only
// emits a final snapshot; final HTTP replay differs; successful usage is
// unmeasured; a recovered failed attempt disappears or masquerades as measured.
test('real provider tool turns stream through the product projection and replay', {
  skip: process.env.LINGXIOS_LIVE_STREAMING !== '1', timeout: 540_000,
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_streaming_test')
  assert.equal(process.env.AGENT_OS_MAX_CONCURRENT_RUNS, '1')
  await ensureSchemaOnce(); await resetAllTables(); installFakeWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["files"]'::jsonb WHERE id=$1`, [agentId])
  const conversationId = 'streaming-live-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN!, port: 0 })
  process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
  const output = process.env.LINGXIOS_STREAMING_OUTPUT || 'artifacts/native-streaming/live'
  await mkdir(output, { recursive: true })
  const frames: { elapsedMs: number; snapshot: AgentRunSnapshot }[] = []
  const cancellation = new AbortController(), signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(480_000)])
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  try {
    const hostResponse = await createChatCompletion({ purpose: 'model-switch.acceptance', companyId }, {
      model: env.OPENAI_MODEL, messages: [{ role: 'user', content: 'Reply as JSON with exactly one field: {"ok":true}.' }], response_format: { type: 'json_object' }, max_tokens: 512,
    })
    assert.equal(hostResponse.choices[0]?.finish_reason, 'stop')
    assert.deepEqual(JSON.parse(hostResponse.choices[0]?.message.content || ''), { ok: true })
    const hostAttempts = (await pool.query('SELECT model,status,measured,cost_usd FROM llm_calls WHERE company_id=$1 AND purpose=$2', [companyId, 'model-switch.acceptance'])).rows
    const hostSuccesses = hostAttempts.filter(call => call.status === 'succeeded')
    assert.equal(hostSuccesses.length, 1)
    const hostCall = hostSuccesses[0]
    assert.equal(hostCall.model, env.OPENAI_MODEL)
    assert.equal(hostCall.measured, true)
    assert.ok(Number(hostCall.cost_usd) > 0)
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version, messageId: 'streaming-live-request',
      version: 1, author: { id: 'test-owner', kind: 'human' }, mentions: [agentId],
      text: '请先实际调用 files.list 核对本次请求是否有附件，简要报告检查结果，然后用六个简短段落（共约600字）向初学者解释 React 的状态更新、重新渲染和提交过程。不要创建文件，不要发送额外消息，不要展示内部思考或内部标识。',
    }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0]; assert.ok(identity)
    const projection = await readRunProjection(api, identity, true)
    const upstream = await api.streamRun(identity, { signal }); assert.ok(upstream.body)
    const response = assistantRunResponse(upstream.body, projection, { api, identity })
    assert.match(response.headers.get('content-type')!, /^text\/event-stream/)
    const tracker = new AssistantTransportDeltaTracker(), began = performance.now()
    worker = await startLingxiOSWorker()
    for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
      assert.equal(chunk.type, 'update-state')
      if (chunk.type !== 'update-state' || !chunk.operations.length) continue
      tracker.append(chunk.operations)
      frames.push({ elapsedMs: Math.round(performance.now() - began), snapshot: tracker.state as unknown as AgentRunSnapshot })
    }
    const message = (await readRunProjection(api, identity, true)).snapshot.message
    assert.equal(message.status?.type, 'complete')
    assert.ok(message.content.some(part => part.type === 'tool-call' && part.toolName === 'files.list' && Reflect.get(part.result as object, 'status') === 'completed'))
    const previews = frames.filter(frame => frame.snapshot.message.status?.type === 'running' && nativeText(frame.snapshot.message))
    assert.ok(previews.length > 5, 'real provider must expose incremental text before completion')
    assert.ok(nativeText(message).length > 200)
    assert.equal(nativeText(frames.at(-1)!.snapshot.message), nativeText(message))
    const ledger = (await pool.query<{ calls: number; cost: string }>(`SELECT count(*)::int AS calls,
      COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
    assert.ok(ledger.calls >= 2)
    assert.ok(Number(ledger.cost) > 0 && Number(ledger.cost) <= 0.25)
    const models = (await pool.query('SELECT DISTINCT model FROM llm_calls WHERE company_id=$1', [companyId])).rows
    assert.deepEqual(models.map(row => row.model), [env.OPENAI_MODEL])
    // The API's auxiliary path must also use this model and record a real, paid call.
    const billing = (await pool.query('SELECT purpose,model,status,measured,cost_estimated,input_tokens,cached_input_tokens,output_tokens,cost_usd,extras FROM llm_calls WHERE company_id=$1 ORDER BY created_at', [companyId])).rows
    assert.equal(billing.length, ledger.calls + hostAttempts.length, 'all Agent and host attempts must be retained')
    assert.ok(billing.filter(call => call.purpose === 'lingxios.agent-turn' && call.status === 'succeeded').length >= 2)
    for (const call of billing) {
      assert.ok(Number.isFinite(Number(call.cost_usd)) && Number(call.cost_usd) >= 0)
      if (call.status === 'succeeded') {
        assert.equal(call.measured, true, 'successful calls must include real usage')
        assert.ok(Number(call.cost_usd) > 0)
      }
      else {
        assert.equal(call.status, 'failed')
        assert.equal(typeof call.extras.failure?.category, 'string', 'failed attempts must retain their failure classification')
        const logicalCallId = call.extras.logicalCallId ?? call.extras.callId
        assert.equal(typeof logicalCallId, 'string')
        assert.ok(billing.some(retry => retry.status === 'succeeded' && retry.purpose === call.purpose && (retry.extras.logicalCallId ?? retry.extras.callId) === logicalCallId), 'failed logical calls must recover successfully')
      }
      if (!call.measured) {
        assert.equal(call.status, 'failed')
        assert.equal(call.cost_estimated, true, 'unmeasured failures must retain their conservative cost estimate')
        if (call.purpose.startsWith('lingxios.')) {
          assert.equal(call.extras.costMeasurement, 'estimated')
          assert.equal(call.extras.pricing?.currency, 'USD')
          assert.ok(call.extras.pricing.inputMicrosPerMillion > 0 && call.extras.pricing.outputMicrosPerMillion > 0)
        }
      } else if (env.OPENAI_MODEL === 'zai-org/GLM-5.3-Flash') {
        const expected = ((call.input_tokens - call.cached_input_tokens) * 0.8 + call.cached_input_tokens * 0.23 + call.output_tokens * 2.8) / 1_000_000 / Number(process.env.SILICONFLOW_USD_CNY_RATE)
        assert.ok(Math.abs(Number(call.cost_usd) - expected) <= 5.1e-9, 'host and Agent ledger must use the Flash CN tariff')
      }
    }
    assert.ok(billing.reduce((sum, call) => sum + Number(call.cost_usd), 0) <= 0.25, 'recorded total includes every failed attempt')
    const retractions = frames.filter((frame, index) => index && nativeText(frames[index - 1].snapshot.message) && !nativeText(frame.snapshot.message)).length
    const finalRetractions = frames.filter((frame, index) => index && nativeText(frames[index - 1].snapshot.message) === nativeText(message) && !nativeText(frame.snapshot.message)).length
    assert.equal(finalRetractions, 0, 'a durable final answer must survive ephemeral preview cleanup')
    await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, realModel: true, timestamp: new Date().toISOString(), billing: billing.map(call => ({ purpose: call.purpose, model: call.model, status: call.status, measured: call.measured, estimated: call.cost_estimated, inputTokens: call.input_tokens, cachedInputTokens: call.cached_input_tokens, outputTokens: call.output_tokens, costUSD: Number(call.cost_usd), reasoningTokens: call.extras.reasoningTokens, failure: call.extras.failure, callId: call.extras.callId, logicalCallId: call.extras.logicalCallId })), model: process.env.OPENAI_MODEL,
      previewFrames: previews.length, retractions, finalRetractions, measuredCalls: billing.filter(call => call.purpose !== 'model-switch.acceptance' && call.measured).length,
      recoveredFailedAttempts: billing.filter(call => call.status === 'failed').length,
      measuredUsageCostUSD: billing.filter(call => call.measured).reduce((sum, call) => sum + Number(call.cost_usd), 0),
      unmeasuredEstimatedCostUSD: billing.filter(call => !call.measured).reduce((sum, call) => sum + Number(call.cost_usd), 0),
      costUSD: Number(ledger.cost), hostAttemptCount: hostAttempts.length, hostCall: { model: hostCall.model, measured: hostCall.measured, costUSD: Number(hostCall.cost_usd) }, finalLength: nativeText(message).length }, null, 2))
  } finally {
    cancellation.abort()
    try {
      await worker?.stop()
      const diagnostics = await pool.query('SELECT purpose,model,status,measured,cost_estimated,input_tokens,cached_input_tokens,output_tokens,cost_usd,extras FROM llm_calls WHERE company_id=$1 ORDER BY created_at', [companyId])
      await writeFile(`${output}/diagnostics.json`, JSON.stringify({ timestamp: new Date().toISOString(), model: env.OPENAI_MODEL, frames: frames.length, finalStatus: frames.at(-1)?.snapshot.message.status, calls: diagnostics.rows.map(call => ({ purpose: call.purpose, model: call.model, status: call.status, measured: call.measured, estimated: call.cost_estimated, inputTokens: call.input_tokens, cachedInputTokens: call.cached_input_tokens, outputTokens: call.output_tokens, costUSD: Number(call.cost_usd), reasoningTokens: call.extras.reasoningTokens, failure: call.extras.failure, callId: call.extras.callId, logicalCallId: call.extras.logicalCallId, costMeasurement: call.extras.costMeasurement, pricing: call.extras.pricing })) }, null, 2))
    } finally {
      try { await writeFile(`${output}/replay.json.gz`, gzipSync(JSON.stringify(frames))) }
      finally { await teardownAll() }
    }
  }
})
