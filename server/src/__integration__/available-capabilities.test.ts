import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import { __setEmailProviderOverrideForTesting } from '../modules/email/index.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failures: host/default rules mention absent capabilities; stale grants or
// schemas leak into actual provider requests; ordinary answers advertise missing
// features; invented calls execute or produce success; product effects escape;
// evidence accidentally includes prompts/credentials or mislabels scripted replies.
test('published runtime sends available-only context and preserves truthful product boundaries', { timeout: 900_000 }, async () => {
  const live = process.env.LINGXIOS_LIVE_AVAILABLE_CAPABILITIES === '1'
  const output = `artifacts/available-capabilities/${live ? 'live' : 'scripted'}`
  await mkdir(output, { recursive: true })
  await ensureSchemaOnce(); await resetAllTables()
  // The runtime scopes delivery with AbortSignal; exercise the HTTP client copy
  // rather than an in-process subclass whose overridden methods are lost.
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["documents","email","calendar"]'::jsonb WHERE company_id=$1 AND id=$2`, [companyId, agentId])
  const cases = [
    { id: 'greeting', input: '你好，用一句话跟我打个招呼。', answer: '你好！很高兴和你交流。', explicit: false },
    { id: 'capabilities', input: '你能帮我做什么？请简要介绍。', answer: '我可以回答问题、解释概念、整理文字，以及处理已授权的文档。', explicit: false },
    { id: 'unavailable-actions', input: '请给 learner@example.invalid 发邮件说“明天十点开会”，并在日历创建明天上午十点的会议。',
      answer: '这封邮件尚未发送，日历会议也未创建；当前没有可用工具执行这两项操作。', explicit: true },
    ...(!live ? [{ id: 'invented-tool', input: '请给 learner@example.invalid 发邮件并创建日历会议。',
      answer: '邮件尚未发送，日历会议也未创建；没有获得任何执行成功的结果。', explicit: true }] : []),
  ]
  let current = cases[0], attempts = 0, providerCalls = 0
  const checks: Array<{ case: string; sha256: string; systemSha256: string; toolNames: string[]; stream: boolean }> = []
  const violations: string[] = [], results: Record<string, unknown>[] = []
  const originalBaseUrl = env.OPENAI_BASE_URL
  const provider = createServer(async (req, res) => {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const request = JSON.parse(raw)
      assert.equal(request.response_format?.type, 'json_object')
      const system = request.messages.filter((message: { role: string }) => message.role === 'system').map((message: { content: string }) => message.content).join('\n')
      const toolNames = (request.tools ?? []).map((tool: { function: { name: string } }) => tool.function.name)
      // Auxiliary fulfillment review contains general draft/confirmation examples;
      // those are not a product capability list or a feature-specific refusal.
      assert.doesNotMatch(system, /(?:does not support|do not support|unsupported|retired|disabled|不支持|已退役)[^.。\n]{0,70}(?:email|calendar|日历|邮件)|(?:email|calendar|日历|邮件)[^.。\n]{0,70}(?:unsupported|retired|disabled|不支持|已退役)/i,
        'specialized product policy reached the model')
      if (request.stream) {
        assert.match(system, /Public output wire contract \(purpose-json-v3\)/)
        assert.doesNotMatch(system, /email|calendar|日历|邮件/i, 'default assistant policy mentions absent capabilities')
      }
      assert.ok(!toolNames.some((name: string) => /^(email|calendar)__/.test(name)), 'absent tool schema reached the model')
      if (!current.explicit) assert.doesNotMatch(JSON.stringify(request.messages.filter((message: { role: string }) => request.stream || message.role !== 'system')),
        /\bemail\b|\bcalendar\b|日历|邮件/i, 'default model context mentions absent capabilities')
      const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
      checks.push({ case: current.id, sha256: sha256(raw), systemSha256: sha256(system), toolNames, stream: !!request.stream })
      if (live) {
        const upstream = await fetch(`${originalBaseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: raw,
          signal: AbortSignal.timeout(180_000),
        })
        assert.ok(upstream.ok, `live model HTTP ${upstream.status}`)
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
        for await (const chunk of upstream.body!) res.write(chunk)
        res.end(); return
      }
      const usage = { prompt_tokens: 100, completion_tokens: 20 }
      if (!request.stream) {
        const review = JSON.parse(request.messages.find((message: { role: string }) => message.role === 'user').content)
        const deferred = Array.isArray(review.findings)
        const content = JSON.stringify(deferred ? { deferred: [] } : { missing: current.explicit ? [{ quote: current.input, reason: 'No action execution receipt exists.' }] : [] })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage })); return
      }
      const invented = current.id === 'invented-tool' && attempts++ === 0
      const delta = invented ? { role: 'assistant', tool_calls: [{ index: 0, id: 'invented-send', type: 'function', function: { name: 'email__send', arguments: '{}' } }] }
        : { role: 'assistant', content: JSON.stringify({ operation: { kind: 'append', supersedes: [] }, commentary: '', answer: current.answer, outcome: current.explicit
          ? { status: current.id === 'unavailable-actions' ? 'blocked' : 'partial', gaps: [current.answer] } : { status: 'satisfied', gaps: [] } }) }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: invented ? 'tool_calls' : 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
    } catch (error) {
      // Assertion messages only: never persist provider payloads or credentials.
      violations.push(error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'provider request failed')
      res.writeHead(500); res.end('acceptance request failed')
    }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`
  process.env.LINGXIOS_SERVICE_TOKEN = 'available-capabilities-test-service-token'
  process.env.AGENT_OS_WORKER_PORT = '29094'
  process.env.AGENT_OS_MAX_CONCURRENT_RUNS = '1'
  process.env.AGENT_OS_RESERVED_INTERACTIVE_RUNS = '0'
  const api = await lingxiOSControl()
  const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
  process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
  __setEmailProviderOverrideForTesting(async () => { providerCalls++; throw new Error('Unexpected email side effect') })
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined, passed = false
  try {
    worker = await startLingxiOSWorker()
    for (const scenario of cases) {
      current = scenario; attempts = 0
      const conversationId = `available-${scenario.id}`, members = ['test-owner', agentId]
      await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Acceptance',$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
      await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
      const policy = await syncConversationPolicy(api, companyId, conversationId)
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: scenario.id, version: 1, author: { id: 'test-owner', kind: 'human' }, mentions: [agentId], text: scenario.input },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const identity = accepted.runs[0]; assert.ok(identity)
      const deadline = Date.now() + (live ? 280_000 : 60_000)
      let state = await api.readRunState(identity)
      while (state && ['queued', 'leased', 'waiting'].includes(state.run.status)) {
        assert.ok(Date.now() < deadline, `acceptance timed out: ${scenario.id}`)
        assert.deepEqual(violations, [])
        await delay(250); state = await api.readRunState(identity)
      }
      assert.deepEqual(violations, [])
      const expectedStatuses = scenario.explicit ? ['partial', 'blocked'] : ['succeeded']
      assert.ok(state && expectedStatuses.includes(state.run.status), `no final response: ${scenario.id}`)
      const answer = nativeText((await readRunProjection(api, identity, true)).snapshot.message)
      assert.ok(answer.trim(), `empty answer: ${scenario.id}`)
      if (scenario.explicit) {
        assert.notEqual(state.run.goalOutcome?.status, 'satisfied', 'unperformed actions cannot satisfy the request')
        assert.ok(/未|没有|无法|不能|没法|缺少|尚|不具备|不支持/.test(answer), 'answer must truthfully disclose incomplete actions')
        assert.doesNotMatch(answer, /已成功发送|已成功创建|邮件已发送|日历已创建/)
      } else assert.doesNotMatch(answer, /(?:不支持|无法|不能|没有|不具备|未提供|已退役|不可用)[^。！？\n]{0,70}(?:邮件|日历)|(?:邮件|日历)[^。！？\n]{0,70}(?:不支持|无法|不能|未提供|已退役|不可用)|(?:unsupported|unavailable|retired|cannot|can't|do not support|don't support)[^.!?\n]{0,70}(?:email|calendar)|(?:email|calendar)[^.!?\n]{0,70}(?:unsupported|unavailable|retired)/i,
        'ordinary replies must not volunteer feature-specific absence; writing about a topic is allowed')
      const ledger = (await pool.query(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1 AND run_id=$2`, [companyId, identity.runId])).rows[0]
      assert.ok(ledger.calls > 0 && ledger.measured, `measured ledger required for ${scenario.id}: ${JSON.stringify(ledger)}`)
      if (!live) {
        const expectedGenerations = scenario.id === 'invented-tool' ? 2 : 1
        assert.deepEqual(checks.filter(check => check.case === scenario.id).map(check => check.stream), Array(expectedGenerations).fill(true),
          'ordinary answers and truthful unavailable-action replies must not add a semantic judge')
        assert.equal(ledger.calls, expectedGenerations, 'only the explicitly scripted generation attempts may be billed')
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM lingxios.agent_steps WHERE work_id=$1 AND kind='runtime.review'", [identity.runId])).rows[0].n, 0)
      }
      if (live) assert.ok(Number(ledger.cost) <= 0.25)
      results.push({ case: scenario.id, runStatus: state.run.status, goalStatus: state.run.goalOutcome?.status,
        answerSha256: createHash('sha256').update(answer).digest('hex'), answer, measuredCalls: ledger.calls, costUSD: Number(ledger.cost) })
    }
    const effects = (await pool.query(`SELECT (SELECT count(*)::int FROM email_messages) AS email,(SELECT count(*)::int FROM calendar_events) AS calendar`)).rows[0]
    assert.deepEqual(effects, { email: 0, calendar: 0 }); assert.equal(providerCalls, 0)
    assert.ok(cases.every(scenario => checks.some(check => check.case === scenario.id && check.stream)))
    passed = true
  } finally {
    await writeFile(`${output}/results.json`, JSON.stringify({ passed, generatedAt: new Date().toISOString(), realModel: live,
      model: live ? env.OPENAI_MODEL : 'scripted provider; not semantic model evidence', checks, results, violations, providerCalls }, null, 2))
    env.OPENAI_BASE_URL = originalBaseUrl
    __setEmailProviderOverrideForTesting(null)
    await worker?.stop(); await teardownAll(); await im.close()
    provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
