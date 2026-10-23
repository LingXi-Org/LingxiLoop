import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { pool } from '../db/pool.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { assistantRunResponse, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model: docs/evidence/feedback-261/FAILURE-MODEL.md.
// Local HTTP provider exercises the published OpenAI driver, not a replacement
// model driver. Each release gate depends on public SSE/SQL assertions, not time.
const deferred = () => {
  let resolve!: () => void
  return { promise: new Promise<void>(done => { resolve = done }), resolve: () => resolve() }
}
const first = '先核对当前可视化是否可读。', second = '我会根据实际读取结果说明。', final = '读取未完成，当前没有取得可交付的可视化内容。'
test('visualization failure retains real public content through provider, durable ledger and SSE before final completion', { timeout: 30000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables(); installFakeWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const principalId = 'test-owner', conversationId = 'visualize-failure-public-streaming-room', members = [principalId, agentId]
  await seedUserMembership(principalId, companyId)
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
    messageId: 'visualize-failure-public-source', version: 1, author: { id: principalId, kind: 'human' }, text: '请读取已有可视化并简要说明读取结果。', mentions: [agentId] },
  { mode: 'execute', deliveryMode: 'text', executionClass: 'conversation', codeExecution: 'disabled' })
  const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool, identity, conversationId)
  const releasePrefix = deferred(), releaseTool = deferred(), releaseFinal = deferred()
  const prefixVisible = deferred(), continuationVisible = deferred(), finalVisible = deferred()
  const providerErrors: unknown[] = [], frames: AgentRunSnapshot[] = []
  let calls = 0, instructions = ''
  const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
  const provider = createServer((req, res) => { void (async () => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const request = JSON.parse(raw)
    if (!request.stream) {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ model: 'gpt-4o-mini', choices: [{ message: { content: '{"missing":[]}' }, finish_reason: 'stop' }], usage })); return
    }
    const call = ++calls
    if (call === 1) instructions = request.messages.filter((message: { role: string }) => message.role === 'system').map((message: { content: string }) => message.content).join('\n')
    res.setHeader('content-type', 'text/event-stream'); res.flushHeaders()
    const send = (delta: object, finish: string | null = null) => res.write(`data: ${JSON.stringify({ model: 'gpt-4o-mini', choices: [{ index: 0, delta, finish_reason: finish }], ...(finish ? { usage } : {}) })}\n\n`)
    send({ reasoning_content: 'PRIVATE_REASONING_SENTINEL' })
    if (call === 1) {
      send({ content: first }); await releasePrefix.promise
      send({ content: second }); await releaseTool.promise
      send({ tool_calls: [{ index: 0, id: 'visualize-read', type: 'function', function: { name: 'visualize__read', arguments: JSON.stringify({ path: '/synthetic-unavailable/diagram.html' }) } }] }, 'tool_calls')
    } else {
      assert.equal(call, 2, 'no extra model call is needed for public commentary')
      send({ content: final }); await releaseFinal.promise; send({}, 'stop')
    }
    res.end('data: [DONE]\n\n')
  })().catch(error => { providerErrors.push(error); res.destroy() }) })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address === 'object')
  const worker = createWorker({ controlPlane: api, policy: new ProductRuntimePolicy(), worker: { id: 'visualize-failure-public-worker', shutdownGraceMs: 1000 },
    model: { id: 'gpt-4o-mini', apiKey: 'synthetic-local-provider', baseUrl: `http://127.0.0.1:${address.port}/v1`, requestTimeoutMs: 20000, firstByteTimeoutMs: 5000, streamIdleTimeoutMs: 15000 } })
  const cancellation = new AbortController(), signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(25000)])
  let running: Promise<boolean> | undefined, reading: Promise<void> | undefined
  try {
    const projection = await readRunProjection(api, identity, true), upstream = await api.streamRun(identity, { signal })
    assert.ok(upstream.body)
    const response = assistantRunResponse(upstream.body, projection, { api, identity, signal })
    const tracker = new AssistantTransportDeltaTracker()
    reading = (async () => {
      for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
        if (chunk.type !== 'update-state' || !chunk.operations.length) continue
        tracker.append(chunk.operations)
        const snapshot = structuredClone(tracker.state) as unknown as AgentRunSnapshot
        frames.push(snapshot)
        const text = snapshot.message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('')
        if (text.includes(first)) prefixVisible.resolve()
        if (text.includes(first + second)) continuationVisible.resolve()
        if (text.includes(final)) finalVisible.resolve()
      }
    })()
    running = worker.runNext()
    const visible = (gate: ReturnType<typeof deferred>) => Promise.race([gate.promise, running!.then(() => { throw new Error('Worker ended before a gated public prefix reached SSE') })])
    await visible(prefixVisible)
    const beforeTool = await api.readEvents(identity)
    assert.ok(beforeTool.events.some(event => event.kind === 'public.text.delta'))
    assert.equal(beforeTool.events.some(event => event.kind === 'tool.started'), false)
    const reconnect = (await readRunProjection(api, identity, true)).snapshot
    assert.ok(reconnect.message.content.some(part => part.type === 'text' && part.text === first))
    releasePrefix.resolve(); await visible(continuationVisible)
    releaseTool.resolve(); await visible(finalVisible)
    assert.ok(frames.at(-1)!.message.content.some(part => part.type === 'tool-call' && part.toolName === 'visualize.read' && (part.result as { status?: string })?.status === 'failed'))
    assert.equal(frames.at(-1)!.message.status?.type, 'running', 'final text arrives while provider remains gated')
    releaseFinal.resolve(); await running; cancellation.abort(); await reading
    const replay = (await readRunProjection(api, identity, true)).snapshot
    assert.notEqual(replay.message.status?.type, 'running')
    assert.equal(replay.message.content.filter(part => part.type === 'text' && part.text === final).length, 1)
    const commentary = replay.message.content.find(part => activityAnnotation(part)?.kind === 'commentary')
    assert.equal(commentary?.type === 'text' && commentary.text, first + second)
    assert.doesNotMatch(JSON.stringify(frames), /PRIVATE_REASONING_SENTINEL/)
    assert.deepEqual(providerErrors, [])
    // Prompt alignment must not turn an optional useful progress report into an
    // extra call for every tool. The gated SSE assertions above still require
    // actual public content, the failed receipt and a single final answer.
    assert.ok(instructions.includes('Use the public answer channel specified by the trusted model driver; that driver alone determines wire encoding and tool-turn versus terminal response framing'), 'substantive answers must use the driver-owned public channel and framing')
    assert.equal(instructions.includes('Use the declared public `answer` field, never unframed prose'), false, 'product guidance must not impose a wire-level answer field')
    assert.equal(instructions.includes('using the complete native object and outcome:null'), false, 'product guidance must not impose a tool-turn response envelope')
    assert.ok(instructions.includes('same response as a necessary native tool call'), 'known explanations must not wait for every tool to finish')
    assert.ok(instructions.includes('Native lifecycle events already show tool activity; do not report each tool separately'), 'ordinary tool activity must not require duplicate progress calls')
    assert.ok(instructions.includes('Use chat.report_progress only for an independent useful plan, material progress or a failure needing attention, preserving task identity'), 'useful plans and failures retain the explicit progress path')
    assert.ok(instructions.includes('If a call fails, report the observed failure only when user attention is needed; do not repeat a complete answer or claim the view is ready'), 'failures needing attention must remain visible and truthful')
    assert.equal(calls, 2, 'the read and truthful failed-read answer need no extra process-report round')
    await mkdir('artifacts/feedback261', { recursive: true })
    await writeFile('artifacts/feedback261/visualize-failure-public-streaming.json', JSON.stringify({ passed: true, runtime: releaseVersions.runtime,
      realWorker: true, realPostgres: true, publishedOpenAIDriver: true, localProvider: true, productionRequests: 0,
      beforeTool: true, beforeFinalCompletion: true, stateFirstReplay: true, privateReasoningExcluded: true, modelCalls: calls, frames: frames.length }, null, 2) + '\n')
  } finally {
    releasePrefix.resolve(); releaseTool.resolve(); releaseFinal.resolve(); cancellation.abort()
    await running; await reading; await worker.stop(); await stopLingxiOSControl()
    provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
    await teardownAll()
  }
})
