import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions, type WorkItem } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { nativeText } from '../im/message-types.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { readRunTrace } from '../../../src/lib/runTrace.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure inventory precedes this fixture: docs/evidence/issue-326/recovery-failure-model.md.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await stopLingxiOSControl(); await teardownAll(); await recording?.close() })

async function until(check: () => Promise<boolean>) {
  const deadline = AbortSignal.timeout(5000)
  while (!await check()) { deadline.throwIfAborted(); await delay(20) }
}

for (const scenario of [
  { name: 'transient', status: 503, failures: 1, category: 'unavailable', outcome: 'succeeded' },
  { name: 'exhausted', status: 503, failures: 3, category: 'unavailable', outcome: 'failed' },
  { name: 'quota', status: 402, failures: 1, category: 'quota', outcome: 'failed' },
] as const) test(`new model ${scenario.name}: bounded attempts, independent identical messages and replay identities`, { timeout: 30000 }, async () => {
  const model = 'deepseek-ai/DeepSeek-V4.1-Flash', issued: number[] = [], claimed = new Map<string, WorkItem>()
  let healthy = false
  const provider = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk
    const input = JSON.parse(raw)
    assert.equal(input.model, model)
    assert.equal(input.enable_thinking, false)
    const failing = !healthy && (scenario.name !== 'transient' || issued.length === 0)
    issued.push(failing ? scenario.status : 200)
    if (failing) {
      response.writeHead(scenario.status, { 'content-type': 'application/json', 'retry-after': '0', 'x-request-id': `synthetic-${scenario.name}` })
      response.end(JSON.stringify({ error: { message: 'PRIVATE_SYNTHETIC_BODY', ...(scenario.status === 402 ? { code: 'insufficient_quota' } : {}) } }))
      return
    }
    // The production model exposes public_answer; ordinary content is private.
    assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer'))
    assert.equal(input.tool_choice, 'auto')
    const call = { id: `recovery-answer-${scenario.name}-${issued.length}`, type: 'function',
      function: { name: 'public_answer', arguments: JSON.stringify({ operation: { kind: 'append', supersedes: [] }, commentary: '',
        answer: 'Flow control protects a receiver; congestion control protects a network.', outcome: { status: 'satisfied', gaps: [] } }) } }
    const usage = { prompt_tokens: 10, completion_tokens: 12 }
    response.writeHead(200, { 'content-type': input.stream ? 'text/event-stream' : 'application/json' })
    response.end(input.stream
      ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, ...call }] }, finish_reason: 'tool_calls' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`
      : JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls: [call] }, finish_reason: 'tool_calls' }], usage }))
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    const principalId = `recovery-${scenario.name}`, room = `recovery-room-${scenario.name}`, members = [principalId, agentId]
    await seedUserMembership(principalId, companyId, { role: 'STUDENT', isAdmin: false })
    await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')", [projectId, companyId, principalId])
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic recovery',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
    const ingest = (messageId: string) => api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
      messageId, version: 1, author: { id: principalId, kind: 'human' }, text: 'Explain flow control and congestion control briefly.', mentions: [agentId] },
    { mode: 'chat', codeExecution: 'disabled', executionClass: 'conversation' })
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: { connectWorker(input) {
      const host = api.connectWorker(input)
      return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed.set(work.id, work); return work } }
    } }, model: {
      ...runtimeModelConfiguration({ id: model, apiKey: 'synthetic-recovery-key', baseUrl: 'https://api.siliconflow.cn/v1' }, 90_000),
      baseUrl: `http://127.0.0.1:${address.port}/v1`, circuitResetMs: 30,
    }, worker: { id: `recovery-${scenario.name}`, concurrency: 1 } })
    const first = await ingest('first'), run = first.runs[0]; assert.ok(run)
    assert.equal(first.deduplicated, false)
    await bindProductRun(pool, run, room)
    assert.equal(await worker.runNext(), true)
    assert.equal((await api.readRun(run))?.status, scenario.outcome)
    assert.equal(issued.filter(status => status !== 200).length, scenario.failures)
    if (scenario.outcome === 'failed') assert.equal(issued.length, scenario.failures, 'permanent failure and exhaustion cannot issue another model call')
    const readCalls = async () => (await pool.query('SELECT id,status,extras FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id', [run.runId])).rows
    await until(async () => (await readCalls()).length === issued.length)
    const calls = await readCalls(), failures = calls.filter(call => call.status === 'failed').sort((a, b) => a.extras.attempt - b.extras.attempt)
    assert.equal(new Set(calls.map(call => call.id)).size, issued.length)
    assert.deepEqual(failures.map(call => call.extras.attempt), Array.from({ length: scenario.failures }, (_, index) => index + 1))
    for (const failure of failures) {
      assert.equal(failure.extras.failure.category, scenario.category)
      assert.equal(failure.extras.failure.status, scenario.status)
      assert.equal(failure.extras.failure.requestId, `synthetic-${scenario.name}`)
      assert.equal(failure.extras.failure.retryable, scenario.status === 503)
    }
    if (scenario.status === 402) assert.equal(failures[0].extras.failure.providerCode, 'insufficient_quota')
    const settlements = (await pool.query('SELECT call_id,input_tokens,observation FROM lingxios.agent_model_budget_calls WHERE root_work_id=$1', [run.runId])).rows
    assert.deepEqual(settlements.map(row => `lingxios-${row.call_id}`).sort(), calls.map(row => row.id).sort())
    assert.ok(settlements.every(row => row.input_tokens !== null))
    assert.doesNotMatch(JSON.stringify({ calls, settlements }), /PRIVATE_SYNTHETIC_BODY|synthetic-recovery-key/)
    const messages = () => recording.messages.filter(message => message.channelId === room)
    if (scenario.outcome === 'failed') {
      assert.equal((await api.readRun(run))?.resultId, null)
      await until(async () => (await api.readTerminal(run))?.delivery === 'delivered')
      const terminal = (await api.readTerminal(run))!
      const projection = (await readRunProjection(api, run, true)).snapshot.message
      const notices = messages().filter(message => message.payload.role === 'system')
      assert.equal(notices.length, 1)
      assert.deepEqual(projection.metadata.custom.terminalFeedback, { id: terminal.feedback.id, requestVersion: terminal.feedback.requestVersion,
        reason: terminal.feedback.reason, status: 'failed', delivery: 'delivered', scopeVersion: 1, scope: 'response',
        text: nativeText(notices[0].payload) })
      assert.equal(notices[0].payload.metadata.custom.terminalScopeVersion, 1)
      assert.equal(notices[0].payload.metadata.custom.terminalScope, 'response')
      await createProductDelivery(lingxiOSControl).deliverTerminal!(claimed.get(run.runId)!, terminal.feedback,
        { signal: AbortSignal.timeout(5000), deadlineAt: new Date(Date.now() + 5000).toISOString() })
      assert.equal(messages().filter(message => message.payload.role === 'system').length, 1, 'terminal replay must not send again')
      assert.equal((await api.readRun(run))?.status, 'failed')
    } else await until(async () => (await api.readRunState(run))?.delivery === 'delivered')
    const replay = await ingest('first')
    assert.equal(replay.deduplicated, true)
    assert.equal(replay.runs[0]?.runId, run.runId)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM lingxios.agent_work_items WHERE tenant_id=$1', [companyId])).rows[0].n, 1)
    const previousRequests = issued.length
    assert.equal(await worker.runNext(), false)
    assert.equal(issued.length, previousRequests, 'ingress replay must not issue a new call')
    healthy = true; await delay(40)
    const next = (await ingest('next')).runs[0]; assert.ok(next)
    assert.notEqual(next.runId, run.runId, 'same text with a new message identity must have a new run')
    await bindProductRun(pool, next, room)
    assert.equal(await worker.runNext(), true)
    assert.equal((await api.readRun(next))?.status, 'succeeded')
    await until(async () => (await api.readRunState(next))?.delivery === 'delivered')
    const nextReplay = await ingest('next')
    assert.equal(nextReplay.deduplicated, true); assert.equal(nextReplay.runs[0]?.runId, next.runId)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM lingxios.agent_work_items WHERE tenant_id=$1', [companyId])).rows[0].n, 2)
    assert.equal(messages().filter(message => message.payload.role === 'system').length, scenario.outcome === 'failed' ? 1 : 0)
    assert.equal(messages().filter(message => message.payload.role === 'assistant').length, scenario.outcome === 'failed' ? 1 : 2)
    const output = process.env.RUNTIME_ACCEPTANCE_OUTPUT_DIR || `artifacts/runtime-acceptance/${Date.now()}-${process.pid}`
    await mkdir(output, { recursive: true })
    await writeFile(`${output}/chat-recovery-${scenario.name}.json`, JSON.stringify({ scenario: scenario.name, runtime: releaseVersions.runtime, model,
      syntheticProvider: true, firstStatus: scenario.outcome, providerFailureCalls: scenario.failures, failureCategory: scenario.category,
      firstRunSettlements: settlements.length, ingressReplayExtraRuns: 0, ingressReplayExtraModelCalls: 0, terminalReplayExtraMessages: 0,
      nextStatus: 'succeeded', sameTextDistinctRuns: true, systemMessages: scenario.outcome === 'failed' ? 1 : 0 }, null, 2) + '\n', { flag: 'wx' })
  } finally {
    await worker?.stop(); provider.closeAllConnections()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})

// #515/#518: a complete answer must stop, a correction must not retain its
// failed draft, and a null final answer must reuse the sealed source. Exercise
// the published native-v2 parser, worker, ledger, IM delivery and replay reader.
for (const scenario of ['complete', 'correction', 'finalize', 'fail-all'] as const) test(`public answer ${scenario}: one effective body after native worker and replay`, { timeout: 30000 }, async () => {
  const body = 'Flow control protects the receiver.'
  const draft = 'SYNTHETIC_FAILED_DRAFT_MUST_NOT_REAPPEAR'
  let calls = 0
  const provider = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk
    const input = JSON.parse(raw)
    assert.equal(input.stream, true)
    assert.equal(input.enable_thinking, false)
    assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer'))
    calls++
    assert.ok(calls <= (scenario === 'complete' ? 1 : scenario === 'fail-all' ? 3 : 2), 'no unrequested third generation')
    let operation = { kind: 'append', supersedes: [] as string[] }
    if ((scenario === 'correction' || scenario === 'fail-all') && calls > 1) {
      const corrections = (input.messages as { content?: unknown }[])
        .map(message => message.content)
        .filter((content): content is string => typeof content === 'string' && content.startsWith('This generation repairs the explicitly selected candidate sources.'))
      assert.equal(corrections.length, 1, 'each repair must receive its current explicit candidate target')
      const selected = /using exactly this operation: (\{.*?\})\. Do not append/.exec(corrections[0])
      assert.ok(selected, 'the repair request must supply an exact operation')
      operation = JSON.parse(selected[1])
      assert.equal(operation.kind, 'replace')
      assert.equal(operation.supersedes.length, 1)
      assert.equal(typeof operation.supersedes[0], 'string')
      assert.ok(operation.supersedes[0].length > 0)
    }
    const value = { operation, commentary: '',
      answer: scenario === 'fail-all' ? `${draft}-${calls}` : scenario === 'correction' && calls === 1 ? draft : scenario === 'finalize' && calls === 2 ? null : body,
      outcome: scenario === 'finalize' && calls === 1 ? null : { status: scenario === 'fail-all' || scenario === 'correction' && calls === 1 ? 'invalid' : 'satisfied', gaps: [] } }
    const args = JSON.stringify(value)
    // Deliberately split a JSON null token as well as the public text. This is
    // the formal3.8.16 regression; packet boundaries have no protocol meaning.
    const nullAt = args.indexOf('null')
    const cut = scenario === 'correction' && calls === 1 ? args.indexOf(',"outcome"')
      : nullAt >= 0 ? nullAt + 2 : Math.floor(args.length / 2)
    const chunks = [args.slice(0, cut), args.slice(cut)]
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const [index, argumentsText] of chunks.entries()) {
      response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0,
        ...(index === 0 ? { id: `synthetic-${scenario}-${calls}`, type: 'function', function: { name: 'public_answer', arguments: argumentsText } }
          : { function: { arguments: argumentsText } }) }] }, finish_reason: index === chunks.length - 1 ? 'tool_calls' : null }] })}\n\n`)
    }
    response.end(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 12 } })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    const principalId = `public-answer-${scenario}`, room = `public-answer-room-${scenario}`, members = [principalId, agentId]
    await seedUserMembership(principalId, companyId, { role: 'STUDENT', isAdmin: false })
    await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')", [projectId, companyId, principalId])
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic public answer',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: api, model: {
      ...runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: 'synthetic-public-answer-key', baseUrl: 'https://api.siliconflow.cn/v1' }, 90_000),
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
    }, worker: { id: `public-answer-${scenario}`, concurrency: 1 } })
    const input = { tenantId: companyId, conversationId: room, policyVersion: policy.version,
      messageId: 'question', version: 1, author: { id: principalId, kind: 'human' as const }, text: 'Explain flow control briefly.', mentions: [agentId] }
    const run = (await api.conversations.ingest(input, { mode: 'chat', codeExecution: 'disabled', executionClass: 'conversation' })).runs[0]
    assert.ok(run)
    await bindProductRun(pool, run, room)
    assert.equal(await worker.runNext(), true)
    if(scenario==='fail-all'){
      assert.equal(calls,3);assert.equal((await api.readRun(run))?.status,'failed')
      await until(async()=>(await api.readTerminal(run))?.delivery==='delivered')
      const notice=recording.messages.find(message=>message.channelId===room&&message.payload.role==='system')!
      const feedback=(await api.readTerminal(run))!.feedback
      assert.deepEqual(notice.payload.metadata.custom.runTraceReference,{version:1,runId:run.runId,requestVersion:1,fence:1,feedbackId:feedback.id})
      await until(async()=>(await pool.query('SELECT count(*)::int AS n FROM llm_calls WHERE run_id=$1',[run.runId])).rows[0].n===3)
      const replay=(await readRunProjection(api,run,true,undefined,undefined,undefined,true)).snapshot.message
      assert.doesNotMatch(JSON.stringify(replay.content),new RegExp(draft))
      const trace=readRunTrace(replay.metadata.custom.runTrace)!
      const flatten=(span:typeof trace.root):typeof trace.root[]=>[span,...span.children.flatMap(flatten)]
      const models=flatten(trace.root).filter(span=>span.kind==='llm')
      assert.equal(models.length,3);assert.ok(models.every(span=>span.status==='error'&&span.durationMs!==null))
      const failures=(await pool.query("SELECT data->'modelDiagnostics' AS diagnostic FROM lingxios.agent_run_events WHERE run_id=$1 AND kind='model.failed'",[run.runId])).rows
      assert.equal(failures.length,3);assert.ok(failures.every(row=>row.diagnostic.protocolCode==='public_text_invalid'&&row.diagnostic.protocolDetail==='outcome_invalid'))
      const httpServer=createServer(await buildApiTestApp(principalId));await new Promise<void>(resolve=>httpServer.listen(0,'127.0.0.1',resolve))
      try{
        const address=httpServer.address();assert.ok(address&&typeof address!=='string')
        const url=`http://127.0.0.1:${address.port}/api/im/channels/${room}/agents/${agentId}/runs/${encodeURIComponent(run.runId)}`
        const query=new URLSearchParams({terminalFeedbackId:feedback.id,traceRequestVersion:'1',traceFence:'1'})
        const request=(query:URLSearchParams,company=companyId)=>fetch(`${url}?${query}`,{headers:{'x-company-id':company,'x-project-id':projectId}})
        const fresh=await request(query);assert.equal(fresh.status,200)
        const restored=await fresh.json() as {message:typeof replay}
        assert.deepEqual(restored.message.content,replay.content)
        assert.equal(readRunTrace(restored.message.metadata.custom.runTrace)?.root.status,'error')
        query.set('traceFence','2');assert.equal((await request(query)).status,409)
        query.set('traceFence','1');query.set('traceRequestVersion','2');assert.equal((await request(query)).status,409)
        query.set('traceRequestVersion','1');assert.notEqual((await request(query,'other-company')).status,200)
        query.set('terminalFeedbackId','other-feedback');assert.equal((await request(query)).status,409)
      }finally{httpServer.closeAllConnections();await new Promise<void>(resolve=>httpServer.close(()=>resolve()))}
      assert.equal(await worker.runNext(),false);assert.equal(calls,3)
      return
    }
    assert.equal((await api.readRun(run))?.status, 'succeeded')
    await until(async () => (await api.readRunState(run))?.delivery === 'delivered')
    const expectedCalls = scenario === 'complete' ? 1 : 2
    assert.equal(calls, expectedCalls)
    await until(async () => (await pool.query('SELECT 1 FROM llm_calls WHERE run_id=$1', [run.runId])).rowCount === expectedCalls)
    const ledger = (await pool.query('SELECT status,extras FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id', [run.runId])).rows
    assert.deepEqual(ledger.map(call => call.status), scenario === 'correction' ? ['failed', 'succeeded'] : Array(expectedCalls).fill('succeeded'))
    if (scenario === 'correction') {
      assert.equal(ledger[0].extras.failure.category, 'protocol')
      assert.equal(ledger[1].extras.operation, 'correction')
      const audit = (await pool.query('SELECT kind,data FROM lingxios.agent_run_events WHERE run_id=$1 ORDER BY seq', [run.runId])).rows
      assert.ok(audit.some(event => event.kind === 'public.text.delta' && event.data.text === draft), 'the failed candidate remains auditable')
      assert.equal(audit.find(event => event.kind === 'model.failed')?.data.modelDiagnostics.protocolCode, 'public_text_invalid')
    }
    const sent = recording.messages.filter(message => message.channelId === room && message.payload.role === 'assistant')
    assert.equal(sent.length, 1)
    assert.equal(nativeText(sent[0].payload), body)
    const replay = await readRunProjection(api, run, true)
    assert.equal(nativeText(replay.snapshot.message), body)
    assert.equal(JSON.stringify(replay.snapshot.message.content).includes(draft), false)
    assert.equal(JSON.stringify(replay.activityPage(0).message.content).includes(draft), false)
    const deduplicated = await api.conversations.ingest(input, { mode: 'chat', codeExecution: 'disabled', executionClass: 'conversation' })
    assert.equal(deduplicated.deduplicated, true)
    assert.equal(deduplicated.runs[0]?.runId, run.runId)
    assert.equal(await worker.runNext(), false)
    assert.equal(calls, expectedCalls)
    const output = process.env.RUNTIME_ACCEPTANCE_OUTPUT_DIR || `artifacts/runtime-acceptance/${Date.now()}-${process.pid}`
    await mkdir(output, { recursive: true })
    await writeFile(`${output}/public-answer-${scenario}.json`, JSON.stringify({ scenario, runtime: releaseVersions.runtime,
      syntheticProvider: true, calls, ledgerStatuses: ledger.map(call => call.status), deliveredBodies: sent.length,
      body, failedDraftInDeliveryOrReplay: false, replayExtraCalls: 0 }, null, 2) + '\n', { flag: 'wx' })
  } finally {
    await worker?.stop(); provider.closeAllConnections()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
