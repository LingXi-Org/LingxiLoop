import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { releaseVersions, type RunIdentity } from '@lyyzka/lingxios'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { assistantRunResponse, readRunProjection, RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { readPublicToolActivity } from '../agent-runtime/tool-activity.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure cases were recorded first in docs/presentation-latency-failure-model.md.
// This uses real native events; only optional presentation SQL is fault-injected.
const answer = 'Presentation latency fixture complete.'
const evidence: { scenario: string; elapsedMs: number }[] = []
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
let api: Awaited<ReturnType<typeof lingxiOSControl>>
let worker: ReturnType<typeof createWorker>
let companyId: string, projectId: string, agentId: string
let policyVersion: number, serial = 0, useTool = false, modelCalls = 0
let currentRun: RunIdentity, toolRun: RunIdentity, plainRun: RunIdentity
let leasedState: RunState, toolState: RunState
let toolEvents: Extract<RunStreamEvent, { type: 'event' }>['event'][]
const conversationId = 'presentation-latency-room'

async function enqueue(withTool: boolean): Promise<RunIdentity> {
  useTool = withTool; modelCalls = 0
  const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion,
    messageId: `presentation-${++serial}`, version: 1, author: { id: 'test-owner', kind: 'human' },
    text: withTool ? 'Check the selected attachments.' : 'Reply briefly.', mentions: [agentId] },
  { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
  currentRun = accepted.runs[0]; assert.ok(currentRun)
  await bindProductRun(pool, currentRun, conversationId)
  return currentRun
}

async function next() {
  const deadline = Date.now() + 10_000
  while (!await worker.runNext()) { assert.ok(Date.now() < deadline, 'fixture was not claimed'); await delay(20) }
}

async function timed<T>(scenario: string, operation: () => Promise<T>) {
  const start = performance.now()
  const result = await operation()
  const elapsedMs = Math.round((performance.now() - start) * 100) / 100
  evidence.push({ scenario, elapsedMs })
  return { result, elapsedMs }
}

async function withPresentationLock(operation: () => Promise<void>, lockMs = 1500) {
  const blocker = await pool.connect()
  await blocker.query('BEGIN')
  await blocker.query('LOCK TABLE agent_public_tool_activity IN ACCESS EXCLUSIVE MODE')
  const release = delay(lockMs).then(() => blocker.query('ROLLBACK'))
  try { await operation() } finally { await release; blocker.release() }
}

function body(events: RunStreamEvent[]) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')))
    controller.close()
  } })
}

async function assertNoBlockedPresentation() {
  await delay(150)
  const result = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock'
      AND query LIKE $1`, ['%FROM agent_public_tool_activity%'])
  assert.equal(result.rows[0].count, 0, 'optional timeout must cancel SQL, not leave a blocked pool client')
}

before(async () => {
  await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong()
  ;({ companyId, projectId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["files"]'::jsonb WHERE id=$1`, [agentId])
  const members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group','Presentation fixture',$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  api = await lingxiOSControl()
  policyVersion = (await syncConversationPolicy(api, companyId, conversationId)).version
  worker = createWorker({ controlPlane: api, worker: { id: 'presentation-latency', concurrency: 1, shutdownGraceMs: 1000 },
    model: { modelId: 'presentation-latency-fixture', contextWindowTokens: 200000, async run() {
      const usage = { available: true, inputTokens: 100, outputTokens: 20 }
      if (useTool && modelCalls++ === 0) return { text: '', output: [{ type: 'function_call', callId: 'files-fixture', name: 'files__list', arguments: '{}' }], usage }
      if (useTool) { const state = await api.readRunState(currentRun); assert.ok(state); leasedState = state }
      return { text: answer, output: [{ role: 'assistant', content: answer }], usage }
    }, async structured() { return { value: { missing: [] }, model: 'presentation-latency-fixture', usage: { available: true, inputTokens: 10, outputTokens: 2 } } },
    async compact() { throw new Error('fixture must not compact') } } })
  toolRun = await enqueue(true); await next()
  toolEvents = (await api.readEvents(toolRun, 0)).events
  const final = await api.readRunState(toolRun); assert.ok(final); toolState = final
  assert.equal(leasedState.run.status, 'leased')
  assert.equal(toolState.run.status, 'succeeded')
  plainRun = await enqueue(false); await next()
})

after(async () => {
  try { await worker?.stop(); await teardownAll(); await recording?.close() }
  finally {
    await mkdir('artifacts/memory-latency', { recursive: true })
    const label = process.env.PRESENTATION_LATENCY_LABEL === 'candidate' ? 'candidate' : 'baseline'
    await writeFile(`artifacts/memory-latency/presentation-${label}.json`, JSON.stringify({
      at: new Date().toISOString(), runtime: releaseVersions.runtime,
      environment: 'isolated PostgreSQL; deterministic worker; recording WuKong; no live provider',
      lockMs: 1500, evidence,
    }, null, 2) + '\n')
  }
})

test('healthy presentation preserves measured boundaries and rechecks tenant/principal', async () => {
  const message = (await readRunProjection(api, toolRun, true)).snapshot.message
  const call = message.content.find(part => part.type === 'tool-call' && part.toolName === 'files.list')
  assert.ok(call?.type === 'tool-call' && call.timing)
  assert.ok(call.timing.completedAt! >= call.timing.startedAt)
  assert.equal(Reflect.get(Reflect.get(call.result as object, 'display'), 'summary'), '已检查本次请求的附件，共 0 个。')
  assert.deepEqual(await readPublicToolActivity({ ...toolRun, tenantId: 'outside-company' }), [])
  assert.deepEqual(await readPublicToolActivity({ ...toolRun, principalId: 'outside-person' }), [])
  assert.equal(nativeText(message), answer)
})

test('completed tool and final state remain timely while optional presentation is locked', async () => {
  const started = toolEvents.find(event => event.kind === 'tool.started' && event.data.name === 'files.list')
  const completed = toolEvents.find(event => event.kind === 'tool.completed' && event.data.toolCallId === started?.data.toolCallId)
  assert.ok(started && completed)
  const projection = new RunStreamProjection(toolRun.runId, true, toolRun)
  projection.apply({ type: 'state', state: leasedState }); projection.apply({ type: 'event', event: started })
  await withPresentationLock(async () => {
    const tracker = new AssistantTransportDeltaTracker(), snapshots: AgentRunSnapshot[] = []
    const startedAt = performance.now()
    let toolVisible = false, terminalVisible = false
    const measured = await timed('tool-completed-and-final', async () => {
      const response = assistantRunResponse(body([{ type: 'event', event: completed }, { type: 'state', state: toolState }]), projection, { api, identity: toolRun })
      for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
        if (chunk.type !== 'update-state' || !chunk.operations.length) continue
        tracker.append(chunk.operations)
        const snapshot = structuredClone(tracker.state) as unknown as AgentRunSnapshot
        snapshots.push(snapshot)
        if (!toolVisible && snapshot.message.content.some(part => part.type === 'tool-call' && part.toolName === 'files.list'
          && part.result && Reflect.get(part.result as object, 'status') === 'completed')) {
          toolVisible = true
          evidence.push({ scenario: 'tool-completed-visible', elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100 })
        }
        if (!terminalVisible && snapshot.message.status?.type === 'complete') {
          terminalVisible = true
          evidence.push({ scenario: 'terminal-visible', elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100 })
        }
      }
    })
    assert.ok(snapshots.some(snapshot => snapshot.message.content.some(part => part.type === 'tool-call'
      && part.toolName === 'files.list' && part.result && Reflect.get(part.result as object, 'status') === 'completed')))
    assert.equal(snapshots.at(-1)?.message.status?.type, 'complete')
    assert.equal(nativeText(snapshots.at(-1)!.message), answer)
    assert.ok(measured.elapsedMs < 250, `authoritative events waited ${measured.elapsedMs}ms for optional presentation`)
    await assertNoBlockedPresentation()
  })
})

test('no-tool final snapshot does not depend on the presentation table', async () => {
  await withPresentationLock(async () => {
    const measured = await timed('no-tool-snapshot', () => readRunProjection(api, plainRun, true))
    assert.equal(nativeText(measured.result.snapshot.message), answer)
    assert.equal(measured.result.snapshot.message.status?.type, 'complete')
    assert.ok(measured.elapsedMs < 250, `no-tool snapshot waited ${measured.elapsedMs}ms for optional presentation`)
    await assertNoBlockedPresentation()
  })
})

test('no-tool final answer reaches durable IM while presentation is locked', async () => {
  const run = await enqueue(false)
  await withPresentationLock(async () => {
    const completed = next()
    const committedDeadline = Date.now() + 3000
    while ((await api.readRunState(run))?.run.status !== 'succeeded') {
      assert.ok(Date.now() < committedDeadline, 'fixture did not commit'); await delay(5)
    }
    const measured = await timed('no-tool-durable-after-terminal', async () => {
      const deadline = Date.now() + 3000
      while (!recording.messages.some(message => message.payload.metadata.custom.runId === run.runId)) {
        assert.ok(Date.now() < deadline, 'committed result was not delivered'); await delay(10)
      }
    })
    await completed
    const messages = recording.messages.filter(message => message.payload.metadata.custom.runId === run.runId)
    assert.equal(messages.length, 1); assert.equal(nativeText(messages[0].payload), answer)
    assert.equal(messages[0].payload.status?.type, 'complete')
    assert.ok(measured.elapsedMs < 600, `durable answer waited ${measured.elapsedMs}ms for optional presentation`)
    await assertNoBlockedPresentation()
  })
})

test('cancelled state and mandatory terminal lookup errors cannot become successful fallback', async () => {
  const run = await enqueue(false)
  assert.equal(await api.cancel(run), true)
  await withPresentationLock(async () => {
    const measured = await timed('cancelled-state', () => readRunProjection(api, run, true))
    assert.deepEqual(measured.result.snapshot.message.status, { type: 'incomplete', reason: 'cancelled' })
    assert.equal(nativeText(measured.result.snapshot.message), '')
    assert.ok(measured.elapsedMs < 250, `cancelled state waited ${measured.elapsedMs}ms for optional presentation`)
  })
  const denied = new Error('mandatory-terminal-lookup-denied')
  const requiredLookupFailure = new Proxy(api, { get(target, key, receiver) {
    return key === 'readTerminal' ? async () => { throw denied } : Reflect.get(target, key, receiver)
  } })
  await assert.rejects(readRunProjection(requiredLookupFailure, plainRun, true), error => error === denied)
})

test('revoked HTTP authorization is not replaced by a cached presentation answer', async () => {
  const server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/api/im/channels/${conversationId}/agents/${agentId}/runs/${plainRun.runId}`
  const headers = { 'x-company-id': companyId, 'x-project-id': projectId }
  try {
    assert.equal((await fetch(url, { headers })).status, 200)
    await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [companyId, 'test-owner'])
    await withPresentationLock(async () => {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(1000) })
      assert.equal(response.status, 403)
      assert.doesNotMatch(await response.text(), /Presentation latency fixture complete/)
    })
  } finally {
    await pool.query("UPDATE company_memberships SET status='ACTIVE' WHERE company_id=$1 AND user_id=$2", [companyId, 'test-owner'])
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('healthy streamed completion retains optional summary and timing', async () => {
  const projection = new RunStreamProjection(toolRun.runId, true, toolRun)
  projection.apply({ type: 'state', state: leasedState })
  const tracker = new AssistantTransportDeltaTracker()
  const response = assistantRunResponse(body([...toolEvents.map(event => ({ type: 'event' as const, event })), { type: 'state', state: toolState }]), projection, { api, identity: toolRun })
  for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
    if (chunk.type === 'update-state') tracker.append(chunk.operations)
  }
  const snapshot = tracker.state as unknown as AgentRunSnapshot
  const call = snapshot.message.content.find(part => part.type === 'tool-call' && part.toolName === 'files.list')
  assert.ok(call?.type === 'tool-call' && call.timing?.completedAt)
  assert.equal(Reflect.get(Reflect.get(call.result as object, 'display'), 'summary'), '已检查本次请求的附件，共 0 个。')
  assert.equal(nativeText(snapshot.message), answer)
})

test('state-before-event replay retains healthy presentation across non-tool events', async () => {
  const started = toolEvents.find(event => event.kind === 'tool.started' && event.data.name === 'files.list')
  const completed = toolEvents.find(event => event.kind === 'tool.completed' && event.data.toolCallId === started?.data.toolCallId)
  assert.ok(started && completed)
  const projection = new RunStreamProjection(toolRun.runId, true, toolRun)
  projection.apply({ type: 'state', state: leasedState })
  projection.apply({ type: 'event', event: started })
  projection.apply({ type: 'event', event: completed })
  const afterTool = toolEvents.filter(event => event.seq > completed.seq)
  assert.ok(afterTool.some(event => event.kind === 'response.committed'))
  await withPresentationLock(async () => {
    const tracker = new AssistantTransportDeltaTracker()
    const response = assistantRunResponse(body([{ type: 'state', state: toolState }, ...afterTool.map(event => ({ type: 'event' as const, event }))]), projection, { api, identity: toolRun })
    for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
      if (chunk.type === 'update-state') tracker.append(chunk.operations)
    }
    const snapshot = tracker.state as unknown as AgentRunSnapshot
    const call = snapshot.message.content.find(part => part.type === 'tool-call' && part.toolName === 'files.list')
    assert.ok(call?.type === 'tool-call' && call.timing?.completedAt)
    assert.equal(Reflect.get(Reflect.get(call.result as object, 'display'), 'summary'), '已检查本次请求的附件，共 0 个。')
    assert.equal(nativeText(snapshot.message), answer)
  }, 40)
})

test('concurrent optional reads have a bounded wait and release real SQL clients', async () => {
  await withPresentationLock(async () => {
    const measured = await timed('concurrent-tool-snapshots', () => Promise.all(Array.from({ length: 12 }, () => readRunProjection(api, toolRun, true))))
    assert.ok(measured.result.every(projection => nativeText(projection.snapshot.message) === answer))
    assert.ok(measured.elapsedMs < 400, `concurrent snapshots waited ${measured.elapsedMs}ms`)
    await assertNoBlockedPresentation()
  })
})

test('aborting an optional read cancels its SQL and does not apply late metadata', async () => {
  const projection = new RunStreamProjection(toolRun.runId, true, toolRun)
  projection.apply({ type: 'state', state: toolState })
  for (const event of toolEvents) projection.apply({ type: 'event', event })
  const before = structuredClone(projection.snapshot)
  await withPresentationLock(async () => {
    const cancellation = new AbortController()
    const abort = setTimeout(() => cancellation.abort(), 30)
    try {
      const measured = await timed('abort-optional-read', () => projection.syncPresentation(toolRun, cancellation.signal))
      assert.ok(measured.elapsedMs < 150, `cancelled optional read waited ${measured.elapsedMs}ms`)
      await assertNoBlockedPresentation()
      assert.deepEqual(projection.snapshot, before)
    } finally { clearTimeout(abort) }
  })
  assert.deepEqual(projection.snapshot, before)
})

test('cancelling assistant transport cancels a pending upstream read', async () => {
  let cancelled = false
  let close: ReturnType<typeof setTimeout>
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'state', state: toolState })}\n\n`))
      close = setTimeout(() => controller.close(), 500)
    },
    cancel() { cancelled = true; clearTimeout(close) },
  })
  const projection = new RunStreamProjection(toolRun.runId, true, toolRun)
  const response = assistantRunResponse(upstream, projection, { api, identity: toolRun })
  const reader = response.body!.getReader()
  assert.equal((await reader.read()).done, false)
  // Let transport prefetch its next native frame before disconnecting.
  await delay(20)
  const measured = await timed('cancel-pending-upstream', async () => {
    await reader.cancel()
    const deadline = Date.now() + 200
    while (!cancelled && Date.now() < deadline) await delay(5)
  })
  assert.ok(measured.elapsedMs < 150, `transport cancellation waited ${measured.elapsedMs}ms`)
  assert.equal(cancelled, true)
})
