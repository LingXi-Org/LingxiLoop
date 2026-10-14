import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { pool } from '../db/pool.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { assistantRunResponse, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failures: a real tool turn loses previews; commit clears text; the stream only
// emits a final snapshot; final HTTP replay differs; usage is unmeasured.
test('real provider tool turns stream through the product projection and replay', {
  skip: process.env.LINGXIOS_LIVE_STREAMING !== '1', timeout: 300_000,
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
  const output = 'artifacts/native-streaming/live'
  await mkdir(output, { recursive: true })
  const frames: { elapsedMs: number; snapshot: AgentRunSnapshot }[] = []
  const cancellation = new AbortController(), signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(250_000)])
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  try {
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
    const ledger = (await pool.query<{ calls: number; measured: boolean; cost: string }>(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
      COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
    assert.ok(ledger.calls && ledger.measured)
    assert.ok(Number(ledger.cost) <= 0.25)
    const retractions = frames.filter((frame, index) => index && nativeText(frames[index - 1].snapshot.message) && !nativeText(frame.snapshot.message)).length
    const finalRetractions = frames.filter((frame, index) => index && nativeText(frames[index - 1].snapshot.message) === nativeText(message) && !nativeText(frame.snapshot.message)).length
    assert.equal(finalRetractions, 0, 'a durable final answer must survive ephemeral preview cleanup')
    await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, realModel: true, model: process.env.OPENAI_MODEL,
      previewFrames: previews.length, retractions, finalRetractions, measuredCalls: ledger.calls, costUSD: Number(ledger.cost), finalLength: nativeText(message).length }, null, 2))
  } finally {
    cancellation.abort()
    await writeFile(`${output}/replay.json.gz`, gzipSync(JSON.stringify(frames)))
    await worker?.stop(); await teardownAll()
  }
})
