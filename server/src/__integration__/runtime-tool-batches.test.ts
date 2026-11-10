// #627: published SDK, product authorization, real PostgreSQL and public transport.
// The local provider and bounded tool delays are deterministic; no production calls.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { NoEffectError, releaseVersions, type ToolDefinition } from '@lingxi-org/lingxios'
import { createWorker } from '@lingxi-org/lingxios/worker'
import { pool } from '../db/pool.js'
import { fileTools } from '../agent-runtime/file-tools.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

before(async () => { await ensureSchemaOnce() })
after(async () => { await stopLingxiOSControl(); await teardownAll() })
async function until(check: () => Promise<boolean>) {
  const deadline = AbortSignal.timeout(8000)
  while (!await check()) { deadline.throwIfAborted(); await delay(15) }
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }

for (const scenario of ['partial-retry', 'ordered', 'cancel'] as const) test(`#627 ${scenario}: actual tool scheduling and stable public receipts`, { timeout: 30000 }, async () => {
  await stopLingxiOSControl(); await resetAllTables()
  const recording = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const room = `tool-batch-${scenario}`, principalId = 'test-owner', members = [principalId, agentId]
  await seedUserMembership(principalId, companyId)
  await pool.query(`UPDATE participants SET capabilities='["files","chat"]'::jsonb WHERE id=$1`, [agentId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [room,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room,companyId,JSON.stringify({ channelType: 2,members })])
  const list = fileTools.find(tool => tool.action === 'files.list')! as ToolDefinition
  const execute = list.execute, bothStarted = deferred(), peer = deferred()
  const intervals: { key: string; startedAt: number; completedAt?: number; aborted?: boolean; callId?: string }[] = []
  list.execute = async (context, input) => {
    const interval = { key: `host:${context.action.idempotencyKey}`, startedAt: performance.now() } as typeof intervals[number]
    const index = intervals.push(interval)
    interval.callId = (await pool.query<{ call_id: string }>("SELECT input->>'callId' AS call_id FROM lingxios.agent_steps WHERE work_id=$1 AND step_id=$2", [context.work.id,context.action.cellId])).rows[0]?.call_id
    if (index === 2) bothStarted.resolve()
    try {
      if (scenario === 'ordered') await delay(35, undefined, { signal: context.signal })
      else if (index <= 2) {
        await Promise.race([bothStarted.promise, delay(4000, undefined, { signal: context.signal }).then(() => { throw Error('independent tools did not overlap') })])
        if (scenario === 'partial-retry' && interval.callId === 'tool-1-0') throw new NoEffectError('PRIVATE_SYNTHETIC_FAILURE', 'unavailable')
        if (scenario === 'partial-retry' || index === 2) await Promise.race([peer.promise, delay(10000, undefined, { signal: context.signal })])
      }
      context.signal.throwIfAborted()
      return await execute(context, input)
    } finally { interval.completedAt = performance.now(); interval.aborted = context.signal.aborted }
  }
  let generations = 0, providerError: unknown
  const provider = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw)
      assert.equal(input.parallel_tool_calls, true)
      assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === 'files__list'))
      generations++
      const first = generations === 1, retry = scenario === 'partial-retry' && generations === 2
      assert.ok(generations <= (scenario === 'partial-retry' ? 3 : 2))
      const business = first ? scenario === 'ordered'
        ? [{ name: 'files__list', args: {} }, { name: 'chat__history', args: { limit: 10 } }, { name: 'files__list', args: {} }]
        : [{ name: 'files__list', args: {} }, { name: 'files__list', args: {} }]
        : retry ? [{ name: 'files__list', args: {} }] : []
      if (!first) assert.ok(intervals.slice(0, 2).every(interval => interval.completedAt !== undefined), 'dependent generation waits for all observations')
      const answer = first ? '我会检查本次请求的附件。' : retry ? '\n首次一项检查未完成，另一项已完成；现在重试未完成项。'
        : scenario === 'partial-retry' ? '\n后续检查已完成，未发现附件。首次失败记录保留。' : '\n附件和对话检查已完成。'
      const content = JSON.stringify({ operation: { kind: 'append',supersedes: [] },commentary: '',answer,outcome: business.length ? null : { status: 'satisfied',gaps: [] } })
      const toolCalls = business.map((call, index) => ({ index,id: `tool-${generations}-${index}`,type: 'function',function: { name: call.name,arguments: JSON.stringify(call.args) } }))
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }],usage: { prompt_tokens: 50,completion_tokens: 50 } })}\n\ndata: [DONE]\n\n`)
    } catch (error) { providerError ??= error; response.writeHead(500); response.end('{}') }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, room)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: api, model: { ...runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash',apiKey: 'synthetic-only',baseUrl: 'https://api.siliconflow.cn/v1' },90000),baseUrl: `http://127.0.0.1:${address.port}/v1` },
      worker: { id: `tool-batch-${scenario}`,concurrency: 1 } })
    const ingest = () => api.conversations.ingest({ tenantId: companyId,conversationId: room,policyVersion: policy.version,messageId: 'batch-request',version: 1,author: { id: principalId,kind: 'human' },text: '检查本次请求的附件和对话。',mentions: [agentId] },
      { mode: 'execute',codeExecution: 'disabled',executionClass: 'conversation',deliveryMode: 'auto' })
    const accepted = await ingest(), run = accepted.runs[0]; assert.ok(run)
    await bindProductRun(pool, run, room)
    const running = worker.runNext()
    const snapshots: unknown[] = []
    if (scenario !== 'ordered') {
      await Promise.race([bothStarted.promise, delay(5000).then(() => { throw Error('two tools were not admitted') })])
      if (scenario === 'partial-retry') {
        await until(async () => (await readRunProjection(api, run, true)).snapshot.message.content.some(part => part.type === 'tool-call' && part.isError))
        const snapshot = (await readRunProjection(api, run, true)).snapshot.message
        const tools = snapshot.content.filter(part => part.type === 'tool-call')
        assert.equal(tools.length, 2)
        assert.ok(tools.some(part => part.isError) && tools.some(part => part.result === undefined))
        assert.ok(tools.every(part => activityAnnotation(part)?.kind === 'tool'))
        snapshots.push({ stage: 'partial-running',message: snapshot })
        peer.resolve()
      } else {
        await until(async () => intervals[0].completedAt !== undefined)
        assert.equal(await api.cancel(run), true)
      }
    }
    assert.equal(await running, true)
    if (providerError) {
      const failures = (await pool.query("SELECT data->'modelDiagnostics'->>'protocolCode' AS code,data->'modelDiagnostics'->>'protocolDetail' AS detail FROM lingxios.agent_run_events WHERE run_id=$1 AND kind='model.failed' ORDER BY seq", [run.runId])).rows
      console.info(JSON.stringify({ qualification: 'synthetic-tool-batch-protocol', failures }))
    }
    assert.equal(providerError, undefined)
    assert.equal((await api.readRun(run))?.status, scenario === 'cancel' ? 'cancelled' : 'succeeded')
    if (scenario !== 'cancel') await until(async () => (await api.readRunState(run))?.delivery === 'delivered')
    const projection = await readRunProjection(api, run, true), snapshot = projection.snapshot.message
    const calls = snapshot.content.filter(part => part.type === 'tool-call')
    assert.equal(calls.length, scenario === 'partial-retry' || scenario === 'ordered' ? 3 : 2)
    assert.equal(new Set(calls.map(call => call.toolCallId)).size, calls.length)
    assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_SYNTHETIC_FAILURE|synthetic-only/)
    if (scenario === 'partial-retry') {
      assert.equal(calls[0].toolCallId, intervals.find(interval => interval.callId === 'tool-1-0')!.key)
      assert.equal(calls[0].isError, true)
      assert.ok(calls.slice(1).every(call => !call.isError && Reflect.get(call.result as object, 'status') === 'completed'))
      assert.ok(calls.every(call => activityAnnotation(call)?.kind === 'tool'))
      assert.match(nativeText(snapshot), /首次一项检查未完成/)
      assert.ok(recording.messages.some(message => message.channelId === room && nativeText(message.payload).includes('首次一项检查未完成')))
    }
    if (scenario === 'ordered') {
      assert.deepEqual(calls.map(call => call.toolName), ['files.list', 'chat.history', 'files.list'])
      assert.ok(calls.every(call => call.timing?.completedAt !== undefined))
      assert.ok(calls[0].timing!.completedAt! <= calls[1].timing!.startedAt)
      assert.ok(calls[1].timing!.completedAt! <= calls[2].timing!.startedAt, 'transaction batch keeps native execution order')
    } else {
      assert.ok(Math.max(intervals[0].startedAt, intervals[1].startedAt) < Math.min(intervals[0].completedAt!, intervals[1].completedAt!), 'real execute intervals overlap')
      if (scenario === 'cancel') {
        assert.ok(intervals[1].aborted, 'active read receives cancellation')
        assert.ok(calls.some(call => Reflect.get(call.result as object, 'status') === 'cancelled'))
        assert.equal(generations, 1)
      }
    }
    const replay = await readRunProjection(api, run, true)
    assert.deepEqual(replay.snapshot.message.content, snapshot.content)
    const history = projection.activityPage(0).message
    assert.deepEqual(history.content.filter(part => part.type === 'tool-call').map(call => call.toolCallId), calls.map(call => call.toolCallId))
    assert.equal((await ingest()).deduplicated, true)
    assert.equal(await worker.runNext(), false)
    assert.equal(intervals.length, scenario === 'partial-retry' ? 3 : 2, 'ingress replay never repeats effects')
    const server = createServer(await buildApiTestApp(principalId))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const endpoint = server.address(); assert.ok(endpoint && typeof endpoint !== 'string')
      const response = await fetch(`http://127.0.0.1:${endpoint.port}/api/im/channels/${room}/agents/${agentId}/runs/${run.runId}?activityOffset=0`, { headers: { 'x-company-id': companyId,'x-project-id': projectId } })
      assert.equal(response.status, 200)
      const page = await response.json() as { message: { content: { type: string; toolCallId?: string }[] } }
      assert.deepEqual(page.message.content.filter(part => part.type === 'tool-call').map(call => call.toolCallId), calls.map(call => call.toolCallId))
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
    snapshots.push({ stage: scenario,message: snapshot })
    await mkdir('perf/issue-627/evidence', { recursive: true })
    await writeFile(`perf/issue-627/evidence/${scenario}.json`, JSON.stringify({ runtime: releaseVersions.runtime,scenario,intervals,snapshots,passed: true },null,2)+'\n')
  } finally {
    peer.resolve(); bothStarted.resolve()
    await worker?.stop(); await stopLingxiOSControl(); list.execute = execute
    await recording.close(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
