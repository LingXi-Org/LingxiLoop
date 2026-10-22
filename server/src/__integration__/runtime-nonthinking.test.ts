import { nativeText } from '../im/message-types.js'
import type { RunDisplayState } from '../../../src/lib/agentRunSnapshot.js'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, startLingxiOSWorker, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await teardownAll(); await im?.close() })

test('production workers always expose full tools and disable thinking even with legacy auto configuration and stream only body text before completion', { timeout: 180000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const body = '第一段\n\n第二段 **正文**', privateText = 'private-reasoning-fixture'
  const originalBaseUrl = env.OPENAI_BASE_URL
  for (const mode of ['auto', 'deep']) {
    const requests: Record<string, unknown>[] = []
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const provider = createServer(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const request = JSON.parse(raw)
      assert.equal(request.response_format?.type, 'json_object')
      requests.push(request)
      const usage = { prompt_tokens: 100, completion_tokens: 10 }
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"missing":[]}' }, finish_reason: 'stop' }], usage }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      assert.match(JSON.stringify(request.messages), /Public output wire contract \(purpose-json-v1\)/)
      const send = (delta: unknown, finish_reason: string | null = null) =>
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      assert.ok(!request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'response__upgrade'))
      if(requests.filter(item=>item.stream).length===1){
        send({role:'assistant',reasoning_content:privateText,tool_calls:[{index:0,id:'invalid-question',type:'function',function:{name:'chat__ask',arguments:'{"title":'}}]})
        send({tool_calls:[{index:0,function:{arguments:'"PRIVATE TOOL ARGUMENT"}'}}]},'tool_calls')
        res.end(`data: ${JSON.stringify({choices:[],usage})}\n\ndata: [DONE]\n\n`)
        return
      }
        const framed = JSON.stringify({ commentary: '', answer: body })
        const split = framed.indexOf('第一段') + '第一段'.length
        send({ role: 'assistant', reasoning_content: privateText })
        send({ content: framed.slice(0, split) })
        await gate
        send({ reasoning_content: privateText, content: framed.slice(split) }, 'stop')
      res.end(`data: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
    })
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`
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
      while (!wire.includes('第一段')) { timeout.throwIfAborted(); await delay(20) }
      assert.doesNotMatch(wire, /private-reasoning-fixture/)
      assert.equal((await api.readRunState(run))?.message, null, 'body preview must arrive before provider completion')
      release()
      while ((await api.readRunState(run))?.delivery !== 'delivered') { timeout.throwIfAborted(); await delay(20) }
      assert.equal((await api.readRunState(run))?.message?.body, body)
      assert.deepEqual(im.messages.filter(message => message.channelId === conversationId).map(message => nativeText(message.payload)), [body])
      assert.equal(requests.filter(request => request.stream).length, 2)
      assert.ok(requests.some(request => !request.stream), 'auxiliary content check must also use the native driver')
      for (const request of requests) {
        assert.equal(request.enable_thinking, false)
        assert.equal(request.thinking,undefined)
        assert.equal((request.response_format as {type:string}|undefined)?.type,'json_object')
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
      assert.equal(previewActivity?.kind, 'answer')
      assert.match(previewActivity!.id, /^public-text:[a-f0-9]{64}$/)
      assert.deepEqual(final.message.content.filter(part => part.type === 'text'), [{ type: 'text', text: body,
        providerMetadata: { lingxiloop: { activity: { version: 1, id: previewActivity!.id, kind: 'answer', label: '答复' } } } }])
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
      let calls = await pool.query('SELECT status FROM llm_calls WHERE company_id=$1 AND run_id=$2', [companyId, run.runId])
      while (calls.rows.length < requests.length) {
        timeout.throwIfAborted(); await delay(20)
        calls = await pool.query('SELECT status FROM llm_calls WHERE company_id=$1 AND run_id=$2', [companyId, run.runId])
      }
      assert.deepEqual(calls.rows.map(row => row.status), requests.map(() => 'succeeded'))
    } finally {
      release(); cancellation.abort(); await reading
      web.closeAllConnections(); await new Promise<void>(resolve => web.close(() => resolve()))
      await worker?.stop(); await stopLingxiOSControl()
      provider.closeAllConnections()
      await new Promise<void>(resolve => provider.close(() => resolve()))
      env.OPENAI_BASE_URL = originalBaseUrl
    }
    if (streamError) throw streamError
  }
})

// Failures: an invented executor path is delivered, or native repair leaks a reference before authorization.
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
    assert.match(JSON.stringify(request.messages), /Public output wire contract \(purpose-json-v1\)/)
    correction ||= JSON.stringify(request.messages).includes('visualization path is unavailable')
    const body = JSON.stringify({ commentary: '', answer: ++calls === 1 ? invalid : valid })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: body }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`
  process.env.LINGXIOS_SERVICE_TOKEN = 'interactive-repair-integration-service-token'
  process.env.AGENT_OS_WORKER_PORT = '29094'
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
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
    worker = await startLingxiOSWorker()
    const timeout = AbortSignal.timeout(120000)
    while ((await api.readRunState(run))?.delivery !== 'delivered') { timeout.throwIfAborted(); await delay(50) }
    assert.equal(calls, 2)
    assert.equal(correction, true)
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
