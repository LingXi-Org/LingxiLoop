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
      requests.push(request)
      const usage = { prompt_tokens: 100, completion_tokens: 10 }
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"missing":[]}' }, finish_reason: 'stop' }], usage }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (delta: unknown, finish_reason: string | null = null) =>
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      assert.ok(!request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'response__upgrade'))
      if(requests.filter(item=>item.stream).length===1){
        send({role:'assistant',reasoning_content:privateText,tool_calls:[{index:0,id:'invalid-question',type:'function',function:{name:'chat__ask',arguments:'{"title":'}}]})
        send({tool_calls:[{index:0,function:{arguments:'"PRIVATE TOOL ARGUMENT"}'}}]},'tool_calls')
        res.end(`data: ${JSON.stringify({choices:[],usage})}\n\ndata: [DONE]\n\n`)
        return
      }
        send({ role: 'assistant', reasoning_content: privateText })
        send({ content: '第一段' })
        await gate
        send({ reasoning_content: privateText, content: '\n\n第二段 **正文**' }, 'stop')
      res.end(`data: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
    })
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`
    process.env.AGENT_OS_RESPONSE_POLICY = mode === 'deep' ? 'deep' : 'auto'
    process.env.LINGXIOS_SERVICE_TOKEN = 'nonthinking-integration-service-token'
    process.env.AGENT_OS_WORKER_PORT = '52993'
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
      assert.deepEqual(im.messages.filter(message => message.channelId === conversationId).map(message => message.payload.body), [body])
      assert.equal(requests.filter(request => request.stream).length, 2)
      assert.ok(requests.some(request => !request.stream), 'auxiliary content check must also use the native driver')
      for (const request of requests) {
        assert.equal(request.enable_thinking, false)
        assert.equal(request.thinking,undefined)
        assert.equal((request.response_format as {type:string}|undefined)?.type,request.stream ? undefined : 'json_object')
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
      assert.deepEqual(final.content.filter(part => part.type === 'text'), [{ type: 'text', text: body }])
      assert.equal(final.view.delivery, 'delivered')
      assert.ok(snapshots.some(snapshot => snapshot.status.type === 'running' && snapshot.content.some(part => part.type === 'text' && part.text === '第一段')))
      const snapshotResponse = await fetch(`${origin}/api/im/channels/${conversationId}/agents/${agentId}/runs/${run.runId}`, { headers, signal: timeout })
      assert.equal(snapshotResponse.status, 200)
      const snapshot = await snapshotResponse.json() as AgentRunSnapshot
      assert.deepEqual(snapshot.content, final.content)
      assert.deepEqual(snapshot.tools, final.tools)
      for (const invalid of [path.replace(companyId, 'other-company'), `${path}?threadId=other-thread`]) {
        const denied = await fetch(origin + invalid, { headers, signal: timeout })
        assert.ok([400, 403, 404].includes(denied.status))
        await denied.body?.cancel()
      }
      await mkdir('.codex-tmp/assistant-transport', { recursive: true })
      await writeFile(`.codex-tmp/assistant-transport/${mode}.json`, JSON.stringify({
        protocol: 'assistant-transport', mode, snapshots: snapshots.length,
        streamedBeforeCompletion: true, deliveredOnce: true, reconnectMatchesSnapshot: true,
        content: final.content, status: final.status, tenantAndThreadIsolation: true,
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
