import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, startLingxiOSWorker, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await teardownAll(); await im?.close() })

test('production workers disable thinking for fast, upgraded and deep calls and stream only body text before completion', { timeout: 90000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const body = '第一段\n\n第二段 **正文**', privateText = 'private-reasoning-fixture'
  const originalBaseUrl = env.OPENAI_BASE_URL
  for (const mode of ['auto', 'upgrade', 'deep']) {
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
      if (mode === 'upgrade' && request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'response__upgrade')) {
        send({ tool_calls: [{ index: 0, id: 'upgrade', type: 'function', function: { name: 'response__upgrade', arguments: '{}' } }] }, 'tool_calls')
      } else {
        send({ reasoning_content: privateText })
        send({ content: '第一段' })
        await gate
        send({ reasoning_content: privateText, content: '\n\n第二段 **正文**' }, 'stop')
      }
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
    const cancellation = new AbortController(), timeout = AbortSignal.timeout(20000)
    const stream = await api.streamRun(run, { signal: AbortSignal.any([cancellation.signal, timeout]) })
    let wire = ''
    const reading = (async () => {
      for await (const chunk of stream.body!.pipeThrough(new TextDecoderStream())) wire += chunk
    })().catch(error => { if (!cancellation.signal.aborted) throw error })
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
      assert.equal(requests.filter(request => request.stream).length, mode === 'upgrade' ? 2 : 1)
      assert.ok(requests.some(request => !request.stream), 'auxiliary content check must also use the native driver')
      for (const request of requests) {
        assert.equal(request.enable_thinking, false)
        assert.equal(request.reasoning_effort, undefined)
        assert.equal(request.thinking_budget, undefined)
      }
      assert.doesNotMatch(wire, /private-reasoning-fixture/)
      const calls = await pool.query('SELECT status FROM llm_calls WHERE company_id=$1 AND run_id=$2', [companyId, run.runId])
      assert.deepEqual(calls.rows.map(row => row.status), requests.map(() => 'succeeded'))
    } finally {
      release(); cancellation.abort(); await reading
      await worker?.stop(); await stopLingxiOSControl()
      provider.closeAllConnections()
      await new Promise<void>(resolve => provider.close(() => resolve()))
      env.OPENAI_BASE_URL = originalBaseUrl
    }
  }
})
