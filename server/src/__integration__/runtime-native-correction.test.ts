import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { nativeText } from '../im/message-types.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await stopLingxiOSControl(); await teardownAll(); await recording?.close() })

async function until(check: () => Promise<boolean>) {
  const deadline = AbortSignal.timeout(5000)
  while (!await check()) { deadline.throwIfAborted(); await delay(20) }
}

// #515/#518/#579 and LingxiOS#83/#88: a supplier can ignore required tool
// choice. Never publish its unbound content, re-generate an already sealed
// answer, or hide bounded protocol failures from the ledger and replay reader.
for (const scenario of ['missing-call', 'sealed-then-missing-call', 'missing-call-exhaustion'] as const) {
  test(`native-v3 ${scenario}: required calls, bounded correction and durable body identity`, { timeout: 30_000 }, async () => {
    const body = '流量控制保护接收方；拥塞控制保护网络。'
    const privateText = 'SYNTHETIC_UNBOUND_PROVIDER_CONTENT'
    const exhausted = scenario === 'missing-call-exhaustion', sealed = scenario === 'sealed-then-missing-call'
    const expectedCalls = sealed || exhausted ? 3 : 2
    const api = await lingxiOSControl()
    let calls = 0, run: Awaited<ReturnType<typeof api.conversations.ingest>>['runs'][number] | undefined
    let handlerError: unknown
    const choices: unknown[] = []
    const provider = createServer(async (request, response) => {
      try {
        let raw = ''; for await (const chunk of request) raw += chunk
        const input = JSON.parse(raw)
        calls++; assert.ok(calls <= expectedCalls, 'correction cannot issue an extra generation')
        assert.equal(input.stream, true); assert.equal(input.enable_thinking, false)
        assert.equal(input.tool_choice, 'required', 'ordinary and correction rounds must use the same native-v3 contract')
        assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer'))
        choices.push(input.tool_choice)
        const missing = exhausted || calls === (sealed ? 2 : 1)
        if (calls > (sealed ? 2 : 1)) {
          const instructions = input.messages.map((message: { content?: unknown }) => typeof message.content === 'string' ? message.content : '').join('\n')
          assert.match(instructions, /public_answer/)
          assert.match(instructions, /native.*call|call.*native/i, 'correction must identify the missing native channel')
          if (sealed) {
            const current = (await readRunProjection(api, run!, true)).snapshot.message
            assert.equal(nativeText(current), body, 'an unrelated failed generation cannot erase the sealed answer')
          }
        }
        const delta = missing ? { content: privateText } : { tool_calls: [{ index: 0, id: `answer-${scenario}-${calls}`, type: 'function',
          function: { name: 'public_answer', arguments: JSON.stringify({ operation: { kind: 'append', supersedes: [] }, commentary: '',
            answer: sealed && calls === 3 ? null : body,
            outcome: sealed && calls === 1 ? null : { status: 'satisfied', gaps: [] } }) } }] }
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: missing ? 'stop' : 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 12 } })}\n\ndata: [DONE]\n\n`)
      } catch (error) { handlerError ??= error; response.writeHead(500); response.end('{}') }
    })
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    let worker: ReturnType<typeof createWorker> | undefined
    try {
      const { companyId, projectId, agentId } = await seedCompanyWithAgent()
      const principalId = `native-${scenario}`, room = `native-room-${scenario}`, members = [principalId, agentId]
      await seedUserMembership(principalId, companyId, { role: 'STUDENT', isAdmin: false })
      await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')", [projectId, companyId, principalId])
      await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic native correction',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
      const policy = await syncConversationPolicy(api, companyId, room)
      const address = provider.address(); assert.ok(address && typeof address !== 'string')
      worker = createWorker({ controlPlane: api, model: {
        ...runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: 'synthetic-native-key', baseUrl: 'https://api.siliconflow.cn/v1' }, 90_000),
        publicAnswerTool: 'native-v3', baseUrl: `http://127.0.0.1:${address.port}/v1`,
      }, worker: { id: `native-${scenario}`, concurrency: 1 } })
      const input = { tenantId: companyId, conversationId: room, policyVersion: policy.version, messageId: 'question', version: 1,
        author: { id: principalId, kind: 'human' as const }, text: '简要解释流量控制与拥塞控制。', mentions: [agentId] }
      const options = { mode: 'chat' as const, codeExecution: 'disabled' as const, executionClass: 'conversation' as const }
      run = (await api.conversations.ingest(input, options)).runs[0]; assert.ok(run)
      await bindProductRun(pool, run, room); assert.equal(await worker.runNext(), true)
      assert.equal(handlerError, undefined); assert.equal(calls, expectedCalls)
      assert.equal((await api.readRun(run))?.status, exhausted ? 'failed' : 'succeeded')
      await until(async () => exhausted ? (await api.readTerminal(run!))?.delivery === 'delivered' : (await api.readRunState(run!))?.delivery === 'delivered')
      await until(async () => (await pool.query('SELECT 1 FROM llm_calls WHERE run_id=$1', [run!.runId])).rowCount === expectedCalls)
      const ledger = (await pool.query('SELECT status,input_tokens,output_tokens,extras FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id', [run.runId])).rows
      assert.deepEqual(ledger.map(call => call.status), exhausted ? ['failed', 'failed', 'failed'] : sealed ? ['succeeded', 'failed', 'succeeded'] : ['failed', 'succeeded'])
      assert.deepEqual(ledger.map(call => call.extras.operation), sealed ? ['generation', 'generation', 'correction'] : exhausted ? ['generation', 'correction', 'correction'] : ['generation', 'correction'])
      assert.ok(ledger.every(call => call.input_tokens === 10 && call.output_tokens === 12), 'failed calls retain measured provider usage')
      const events = (await pool.query('SELECT kind,data FROM lingxios.agent_run_events WHERE run_id=$1 ORDER BY seq', [run.runId])).rows
      const failures = events.filter(event => event.kind === 'model.failed')
      assert.equal(failures.length, exhausted ? 3 : 1)
      for (const failure of failures) {
        assert.equal(failure.data.modelDiagnostics.protocolCode, 'public_text_answer_required')
        assert.equal(failure.data.modelDiagnostics.protocolDetail, 'native_call_missing')
      }
      const projection = await readRunProjection(api, run, true)
      const message = projection.snapshot.message
      const sent = recording.messages.filter(message => message.channelId === room && message.payload.role === 'assistant')
      assert.equal(sent.length, exhausted ? 0 : 1)
      if (exhausted) assert.equal((await api.readRun(run))?.resultId, null)
      else { assert.equal(nativeText(sent[0].payload), body); assert.equal(nativeText(message), body) }
      assert.doesNotMatch(JSON.stringify({ message, activity: projection.activityPage(0).message.content, ledger, events }), /SYNTHETIC_UNBOUND_PROVIDER_CONTENT|synthetic-native-key/)
      const httpServer = createServer(await buildApiTestApp(principalId))
      await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
      try {
        const address = httpServer.address(); assert.ok(address && typeof address !== 'string')
        const url = `http://127.0.0.1:${address.port}/api/im/channels/${room}/agents/${agentId}/runs/${encodeURIComponent(run.runId)}`
        const response = await fetch(url, { headers: { 'x-company-id': companyId, 'x-project-id': projectId } })
        assert.equal(response.status, 200)
        const restored = await response.json() as { message: typeof message }
        assert.deepEqual(restored.message.content, message.content)
        assert.notEqual((await fetch(url, { headers: { 'x-company-id': 'other-company', 'x-project-id': projectId } })).status, 200)
      } finally { httpServer.closeAllConnections(); await new Promise<void>(resolve => httpServer.close(() => resolve())) }
      assert.equal((await api.conversations.ingest(input, options)).deduplicated, true)
      assert.equal(await worker.runNext(), false); assert.equal(calls, expectedCalls)
      if (process.env.RUNTIME_ACCEPTANCE_OUTPUT_DIR) {
        await mkdir(process.env.RUNTIME_ACCEPTANCE_OUTPUT_DIR, { recursive: true })
        await writeFile(`${process.env.RUNTIME_ACCEPTANCE_OUTPUT_DIR}/native-v3-${scenario}.json`, JSON.stringify({ scenario, runtime: releaseVersions.runtime,
          syntheticProvider: true, calls, toolChoices: choices, status: exhausted ? 'failed' : 'succeeded', protocolCode: 'public_text_answer_required', protocolDetail: 'native_call_missing',
          ledgerStatuses: ledger.map(call => call.status), operations: ledger.map(call => call.extras.operation), deliveredBodies: sent.length,
          sealedBodyPreserved: sealed, authenticatedReplayMatched: true, crossTenantRejected: true, replayExtraCalls: 0 }, null, 2) + '\n', { flag: 'wx' })
      }
    } finally { await worker?.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())) }
  })
}
