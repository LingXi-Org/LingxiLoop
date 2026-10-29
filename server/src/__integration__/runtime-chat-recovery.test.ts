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
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
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
