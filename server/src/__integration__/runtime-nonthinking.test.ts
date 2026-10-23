import { nativeText } from '../im/message-types.js'
import type { RunDisplayState } from '../../../src/lib/agentRunSnapshot.js'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, runtimeModelConfiguration, startLingxiOSWorker, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { answerSegment } from '../../../src/lib/answerSegment.js'
import { installProductionModelTransport } from './_production-model-transport.js'

// Native-envelope failure model: the deliberately invalid chat.ask must have
// valid transport framing and still fail the original business schema, then
// recover with exactly one answer call. A malformed envelope is not equivalent
// coverage. Private reasoning/arguments remain absent from previews and delivery.

let im: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await teardownAll(); await im?.close() })

test('production workers always expose full tools and disable thinking even with legacy auto configuration and stream only body text before completion', { timeout: 180000 }, async t => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const body = '第一段\n\n第二段 **正文**', privateText = 'private-reasoning-fixture'
  for (const mode of ['auto', 'deep']) {
    const requests: Record<string, unknown>[] = []
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const provider = createServer(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const request = JSON.parse(raw)
      assert.equal(request.response_format, undefined, 'Actual DeepSeek tools profile omits incompatible JSON response mode')
      assert.equal(request.model, 'deepseek-ai/DeepSeek-V4.1-Flash')
      requests.push(request)
      const usage = { prompt_tokens: 100, completion_tokens: 10 }
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"missing":[]}' }, finish_reason: 'stop' }], usage }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      assert.match(JSON.stringify(request.messages), /Public output wire contract \(purpose-json-v3\)/)
      const send = (delta: unknown, finish_reason: string | null = null) =>
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      assert.ok(!request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'response__upgrade'))
      if(requests.filter(item=>item.stream).length===1){
        const parameters = request.tools.find((tool: { function: { name: string } }) => tool.function.name === 'chat__ask').function.parameters
        assert.deepEqual(parameters.required, ['public_output', 'arguments'])
        send({role:'assistant',reasoning_content:privateText,tool_calls:[{index:0,id:'invalid-question',type:'function',function:{name:'chat__ask',arguments:'{"public_output":null,"arguments":{"title":'}}]})
        send({tool_calls:[{index:0,function:{arguments:'"PRIVATE TOOL ARGUMENT"}}'}}]},'tool_calls')
        res.end(`data: ${JSON.stringify({choices:[],usage})}\n\ndata: [DONE]\n\n`)
        return
      }
        const framed = JSON.stringify({ operation: { kind: 'append', supersedes: [] }, commentary: '', answer: body, outcome: { status: 'satisfied', gaps: [] } })
        const split = framed.indexOf('第一段') + '第一段'.length
        send({ role: 'assistant', reasoning_content: privateText })
        send({ content: framed.slice(0, split) })
        await gate
        send({ reasoning_content: privateText, content: framed.slice(split) }, 'stop')
      res.end(`data: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
    })
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    const transport = installProductionModelTransport(env, `http://127.0.0.1:${address.port}/v1`)
    t.after(() => transport.restore())
    assert.equal(runtimeModelConfiguration({ id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, 90000).contextWindowTokens, 1_000_000)
    process.env.AGENT_OS_RESPONSE_POLICY = mode === 'deep' ? 'deep' : 'auto'
    process.env.LINGXIOS_SERVICE_TOKEN = 'nonthinking-integration-service-token'
    // Keep health listeners outside the ephemeral ports used by the fixture servers.
    process.env.AGENT_OS_WORKER_PORT = '29093'
    const api = await lingxiOSControl()
    const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
    process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
    const conversationId = `nonthinking-${mode}`, members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Streaming',$4::jsonb)`,
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const policy = await syncConversationPolicy(api, companyId, conversationId)
    const result = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'question', version: 1, author: { id: 'test-owner', kind: 'human' }, text: '请解释这个概念。', mentions: [agentId] },
    { mode: 'execute', executionClass: 'conversation', codeExecution: 'disabled' })
    const run = result.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
    const cancellation = new AbortController(), timeout = AbortSignal.timeout(60000)
    const web = createServer(await buildApiTestApp('test-owner'))
    await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve))
    const webAddress = web.address(); assert.ok(webAddress && typeof webAddress !== 'string')
    const origin = `http://127.0.0.1:${webAddress.port}`
    const path = `/api/im/companies/${companyId}/channels/${conversationId}/agents/${agentId}/runs/${run.runId}/stream`
    const headers = { 'x-company-id': companyId, 'x-project-id': projectId }
    const stream = await fetch(origin + path, { headers, signal: AbortSignal.any([cancellation.signal, timeout]) })
    assert.equal(stream.status, 200)
    assert.match(stream.headers.get('content-type')!, /^text\/event-stream/)
    const snapshots: AgentRunSnapshot[] = []
    const tracker = new AssistantTransportDeltaTracker()
    let wire = ''
    let streamError: unknown
    const reading = (async () => {
      for await (const chunk of AssistantStream.fromResponse(stream, new AssistantTransportDecoder())) {
        wire += JSON.stringify(chunk)
        assert.equal(chunk.type, 'update-state')
        if (chunk.type === 'update-state' && chunk.operations.length) {
          tracker.append(chunk.operations)
          snapshots.push(tracker.state as unknown as AgentRunSnapshot)
        }
      }
    })().catch(error => { if (!cancellation.signal.aborted) streamError = error })
    let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
    try {
      worker = await startLingxiOSWorker()
      while (!wire.includes('第一段')) {
        timeout.throwIfAborted()
        const state = await api.readRunState(run)
        if (state && ['failed', 'cancelled', 'succeeded'].includes(state.run.status)) {
          const events = await api.readEvents(run, 0)
          const diagnostics = events.events.find(event => event.kind === 'run.failed')?.data.compactionDiagnostics as { reason?: unknown; contextWindowTokens?: unknown; hardLimitTokens?: unknown; estimatedTokens?: unknown } | undefined
          assert.fail(JSON.stringify({ phase: 'before-first-preview', status: state.run.status, providerRequests: requests.length,
            reason: diagnostics?.reason === 'irreducible_context' ? diagnostics.reason : 'unknown',
            ...Object.fromEntries(Object.entries(diagnostics ?? {}).filter(([key, value]) =>
              ['contextWindowTokens', 'hardLimitTokens', 'estimatedTokens'].includes(key) && typeof value === 'number')) }))
        }
        await delay(20)
      }
      assert.doesNotMatch(wire, /private-reasoning-fixture/)
      assert.equal((await api.readRunState(run))?.message, null, 'body preview must arrive before provider completion')
      release()
      while ((await api.readRunState(run))?.delivery !== 'delivered') { timeout.throwIfAborted(); await delay(20) }
      assert.equal((await api.readRunState(run))?.message?.body, body)
      assert.deepEqual(im.messages.filter(message => message.channelId === conversationId).map(message => nativeText(message.payload)), [body])
      assert.equal(requests.filter(request => request.stream).length, 2)
      assert.equal(transport.requests, requests.length, 'Every model request went only to the local stub')
      assert.equal(requests.length, 2, 'the invalid-tool correction and answer must not trigger a default content review')
      for (const request of requests) {
        assert.equal(request.enable_thinking, false)
        assert.equal(request.thinking,undefined)
        assert.equal(request.response_format, undefined)
        assert.equal(request.reasoning_effort, undefined)
        assert.equal(request.thinking_budget, undefined)
      }
      assert.doesNotMatch(wire, /private-reasoning-fixture|PRIVATE TOOL ARGUMENT|"type":"preview"|"type":"event"/)
      const replay = await fetch(origin + path, { headers, signal: timeout })
      const replayState = new AssistantTransportDeltaTracker()
      for await (const chunk of AssistantStream.fromResponse(replay, new AssistantTransportDecoder())) {
        if (chunk.type === 'update-state') replayState.append(chunk.operations)
      }
      const final = replayState.state as unknown as AgentRunSnapshot
      const previewPart = snapshots.filter(snapshot => snapshot.message.status?.type === 'running')
        .map(snapshot => snapshot.message.content.find(part => part.type === 'text' && part.text === '第一段'))
        .find(part => part !== undefined)
      assert.ok(previewPart)
      const previewActivity = activityAnnotation(previewPart)
      const previewSource = answerSegment(previewPart)
      assert.equal(previewActivity?.kind, 'answer')
      assert.match(previewActivity!.id, /^public-text:[a-f0-9]{64}$/)
      assert.ok(previewSource, 'A v3 preview must expose its native stable segment identity')
      assert.equal(previewSource.messageId, `answer:${run.runId}:v1`)
      assert.equal(previewSource.start, 0)
      assert.equal(previewSource.end, '第一段'.length)
      assert.equal(previewSource.segmentId, previewSource.partId, 'The first append owns one immutable revision')
      assert.deepEqual(final.message.content.filter(part => part.type === 'text'), [{ type: 'text', text: body, status: { type: 'complete' },
        providerMetadata: { lingxiloop: {
          activity: { version: 1, id: previewActivity!.id, kind: 'answer', label: '答复', purpose: 'result', requestVersion: 1 },
          answerSegment: { ...previewSource, end: body.length },
        } } }])
      assert.equal((final.message.metadata.custom.harness as RunDisplayState).delivery, 'delivered')
      assert.ok(snapshots.some(snapshot => snapshot.message.status?.type === 'running' && snapshot.message.content.some(part => part.type === 'text' && part.text === '第一段')))
      const snapshotResponse = await fetch(`${origin}/api/im/channels/${conversationId}/agents/${agentId}/runs/${run.runId}`, { headers, signal: timeout })
      assert.equal(snapshotResponse.status, 200)
      const snapshot = await snapshotResponse.json() as AgentRunSnapshot
      assert.deepEqual(snapshot.message.content, final.message.content)
      assert.deepEqual(snapshot.message.metadata, final.message.metadata)
      for (const invalid of [path.replace(companyId, 'other-company'), `${path}?threadId=other-thread`]) {
        const denied = await fetch(origin + invalid, { headers, signal: timeout })
        assert.ok([400, 403, 404].includes(denied.status))
        await denied.body?.cancel()
      }
      await mkdir('.codex-tmp/assistant-transport', { recursive: true })
      await writeFile(`.codex-tmp/assistant-transport/${mode}.json`, JSON.stringify({
        protocol: 'assistant-transport', mode, snapshots: snapshots.length,
        streamedBeforeCompletion: true, deliveredOnce: true, reconnectMatchesSnapshot: true,
        content: final.message.content, status: final.message.status, tenantAndThreadIsolation: true,
      }, null, 2))
      await mkdir('artifacts/native-streaming/protocol', { recursive: true })
      await writeFile(`artifacts/native-streaming/protocol/${mode}.json`, JSON.stringify({
        protocol: 'assistant-transport', runtime: 'published worker', snapshots, final,
        streamedBeforeCompletion: true, deliveredOnce: true, tenantAndThreadIsolation: true,
      }, null, 2))
      const callLedger = () => pool.query(`SELECT status,measured,input_tokens::int AS "inputTokens",output_tokens::int AS "outputTokens",extras->'failure'->>'category' AS category
        FROM llm_calls WHERE company_id=$1 AND run_id=$2 ORDER BY created_at,id`, [companyId, run.runId])
      let calls = await callLedger()
      while (calls.rows.length < requests.length) {
        timeout.throwIfAborted(); await delay(20)
        calls = await callLedger()
      }
      assert.deepEqual(calls.rows, [
        { status: 'failed', measured: true, inputTokens: 100, outputTokens: 10, category: 'protocol' },
        { status: 'succeeded', measured: true, inputTokens: 100, outputTokens: 10, category: null },
      ], 'The native driver rejects invalid business arguments while retaining both complete measured responses')
      const modelFailures = (await pool.query(`SELECT data->'modelDiagnostics' AS diagnostics
        FROM lingxios.agent_run_events WHERE tenant_id=$1 AND run_id=$2 AND kind='model.failed' ORDER BY seq`, [companyId, run.runId])).rows
      assert.deepEqual(modelFailures.map(row => row.diagnostics), [{ kind: 'protocol', category: 'protocol',
        protocolCode: 'tool_identity_invalid', finishReasons: ['tool_calls'],
        usage: { available: true, inputTokens: 100, outputTokens: 10 },
      }], 'Valid envelope framing must reach the business schema gate, not fail as public_text_invalid')
      assert.equal((await pool.query(`SELECT count(*)::int AS count FROM lingxios.agent_run_events
        WHERE tenant_id=$1 AND run_id=$2 AND kind='tool.started'`, [companyId, run.runId])).rows[0].count, 0,
      'The complete invalid tool batch must be rejected before any tool dispatch')
    } finally {
      release(); cancellation.abort(); await reading
      web.closeAllConnections(); await new Promise<void>(resolve => web.close(() => resolve()))
      await worker?.stop(); await stopLingxiOSControl()
      provider.closeAllConnections()
      await new Promise<void>(resolve => provider.close(() => resolve()))
      transport.restore()
    }
    if (streamError) throw streamError
  }
})

// Failures: an invented executor path is delivered, native repair leaks a
// reference before authorization, or a v2-style rewrite appends the bad source
// instead of explicitly replacing the current sealed revision. The full-tool
// repair request must use the provider's real 1M context capability: localhost
// cannot trigger the production hostname-based profile and otherwise defaults
// to 128K, rejecting the repair before a second provider request is admitted.
test('unavailable visualization references are repaired before durable delivery', { timeout: 180000 }, async () => {
  await resetAllTables()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const invalid = '::visualize{"path":"/unauthorized/prediction.html"}'
  const valid = '先预测，再用文字核对结果。'
  let calls = 0, correction = false
  const originalBaseUrl = env.OPENAI_BASE_URL
  const provider = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const request = JSON.parse(raw), usage = { prompt_tokens: 100, completion_tokens: 20 }
    assert.equal(request.enable_thinking, false)
    assert.equal(request.response_format?.type, 'json_object')
    if (!request.stream) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"missing":[]}' }, finish_reason: 'stop' }], usage }))
      return
    }
    if (calls === 0) {
      assert.match(JSON.stringify(request.messages), /Gen UI is available/)
    }
    assert.match(JSON.stringify(request.messages), /Public output wire contract \(purpose-json-v3\)/)
    correction ||= JSON.stringify(request.messages).includes('visualization path is unavailable')
    const replacing = calls > 0
    const sourceContexts = request.messages.flatMap((message: { content?: unknown }) => {
      if (typeof message.content !== 'string') return []
      const match = /Native answer source context \(identities only; not a new task\): (\{[^\n]+\})/.exec(message.content)
      return match ? [JSON.parse(match[1]) as { segmentIds: string[] }] : []
    })
    assert.equal(sourceContexts.length, 1, 'Use exactly the current native source context, never guessed revision IDs')
    assert.equal(sourceContexts[0].segmentIds.length, replacing ? 1 : 0)
    const operation = replacing ? { kind: 'replace', supersedes: sourceContexts[0].segmentIds } : { kind: 'append', supersedes: [] }
    const body = JSON.stringify({ operation, commentary: '', answer: ++calls === 1 ? invalid : valid, outcome: { status: 'satisfied', gaps: [] } })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: body }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`
  process.env.LINGXIOS_SERVICE_TOKEN = 'interactive-repair-integration-service-token'
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const api = await lingxiOSControl()
    const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
    process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
    const conversationId = `ui-repair-${companyId}`, members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','UI repair',$4::jsonb)`,
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const policy = await syncConversationPolicy(api, companyId, conversationId)
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'question', version: 1, author: { id: 'test-owner', kind: 'human' }, text: '请给出可以填写预测的交互讲解。', mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
    worker = createWorker({
      controlPlane: { url: process.env.LINGXIOS_CONTROL_URL, serviceToken: process.env.LINGXIOS_SERVICE_TOKEN },
      policy: new ProductRuntimePolicy(), semanticReview: 'selective', additionalContentCorrections: 3,
      worker: { id: 'unavailable-reference-repair', healthPort: 29094, shutdownGraceMs: 1000 },
      model: { ...runtimeModelConfiguration({ id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, 180_000),
        contextWindowTokens: 1_000_000 },
    })
    await worker.start()
    const timeout = AbortSignal.timeout(120000)
    while ((await api.readRunState(run))?.delivery !== 'delivered') { timeout.throwIfAborted(); await delay(50) }
    assert.equal(calls, 2)
    assert.equal(correction, true)
    assert.equal((await api.readRunState(run))?.run.status, 'succeeded', 'a partial fallback is not a successful reference repair')
    const answers = im.messages.filter(message => message.channelId === conversationId)
    assert.equal(answers.length, 1)
    assert.deepEqual(visualizeReferences(nativeText(answers[0].payload)), [])
    assert.equal(nativeText(answers[0].payload), valid)
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM im_visualize_documents WHERE company_id=$1', [companyId])).rows[0].count, 0)
    await mkdir('artifacts/visualize/runtime', { recursive: true })
    await writeFile('artifacts/visualize/runtime/repaired-reference.json', JSON.stringify({ passed: true, generationCalls: calls,
      correctedToPlainText: true, durableMessages: answers.length, provider: 'scripted native worker', reasoningDisabled: true }, null, 2))
  } finally {
    await worker?.stop(); await stopLingxiOSControl()
    provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
    env.OPENAI_BASE_URL = originalBaseUrl
  }
})
