import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { assistantRunResponse, readRunProjection, RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model is documented before implementation in docs/memory-latency-failure-model.md.
type Span = { kind: string; ms: number }
const samples = new AsyncLocalStorage<Span[]>()
const rounded = (n: number) => Math.round(n * 100) / 100
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
const evidence: Record<string, unknown>[] = []
const queryKind = (sql: string) => /agent_evolution_benchmarks/.test(sql) ? 'evolution_registration'
  : /FROM lingxios.agent_memories/.test(sql) ? 'memory_query'
  : /agent_run_bindings|project_memberships|company_memberships|participants|im_channel_bindings|conversation_policies/.test(sql) ? 'authorization'
  : /agent_run_events|agent_action_|agent_steps/.test(sql) ? 'event_and_receipt'
  : 'other_sql'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong()
  pool.on('connect', client => {
    client.query = new Proxy(client.query, { apply(target, receiver, args) {
      const rows = samples.getStore(), began = performance.now()
      const result = Reflect.apply(target, receiver, args)
      if (rows && result instanceof Promise) return result.finally(() => rows.push({ kind: queryKind(typeof args[0] === 'string' ? args[0] : args[0]?.text ?? ''), ms: performance.now() - began }))
      return result
    } })
  })
  // Attach the same observer to existing idle clients by closing them before measurement.
  const clients = await Promise.all(Array.from({ length: pool.totalCount }, () => pool.connect()))
  clients.forEach(client => { client.release(true) })
  pool.connect = new Proxy(pool.connect, { apply(target, receiver, args) {
    const rows = samples.getStore(), began = performance.now(), result = Reflect.apply(target, receiver, args)
    if (rows && result instanceof Promise) return result.finally(() => rows.push({ kind: 'pool_acquire', ms: performance.now() - began }))
    return result
  } })
})
after(async () => {
  await worker?.stop(); await stopLingxiOSControl(); await teardownAll(); await recording?.close()
  const label = process.env.MEMORY_LATENCY_LABEL === 'candidate' ? 'candidate'
    : process.env.MEMORY_LATENCY_LABEL === 'main-baseline' ? 'main-baseline' : 'baseline'
  await mkdir('artifacts/memory-latency', { recursive: true })
  await writeFile(`artifacts/memory-latency/${label}.json`, JSON.stringify({ at: new Date().toISOString(), runtime: releaseVersions.runtime, node: process.version,
    environment: 'isolated PostgreSQL; deterministic model; recording IM; no live provider',
    percentilePolicy: 'individual samples and min/median/max only; no P95/P99 with fewer than 100 samples per cell', evidence }, null, 2) + '\n')
})
async function measured<T>(label: string, operation: () => Promise<T>) {
  const spans: Span[] = [], start = performance.now()
  const value = await samples.run(spans, operation)
  const totals: Record<string, { calls: number; ms: number }> = {}
  for (const span of spans) { const cell = totals[span.kind] ??= { calls: 0, ms: 0 }; cell.calls++; cell.ms += span.ms }
  for (const cell of Object.values(totals)) cell.ms = rounded(cell.ms)
  evidence.push({ label, elapsedMs: rounded(performance.now() - start), spans: totals })
  return value
}

test('measure native memory list separately from model continuation and projection', { timeout: 180000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const app = await lingxiOSControl(), memory = app.memory; assert.ok(memory)
  let serial = 0, call = 0, activeScope: Awaited<ReturnType<typeof memory.scopes>>[number]
  worker = createWorker({ controlPlane: app, worker: { id: 'memory-latency' }, model: {
    modelId: 'memory-latency-fixture', contextWindowTokens: 200000,
    async run() {
      const usage = { available: true as const, inputTokens: 100, outputTokens: 20 }
      if (++call % 2 === 1) return { output: [{ type: 'function_call' as const, callId: `list-${serial}`, name: 'memory__list',
        arguments: JSON.stringify({ scopeType: activeScope.scopeType, scopeId: activeScope.scopeId }) }], text: '', model: 'memory-latency-fixture', usage }
      await delay(150)
      return { output: [{ role: 'assistant' as const, content: 'Fixture complete.' }], text: 'Fixture complete.', model: 'memory-latency-fixture', usage }
    },
    async structured() { return { value: { missing: [] }, model: 'memory-latency-fixture', usage: { available: true as const, inputTokens: 10, outputTokens: 2 } } },
    async compact() { throw new Error('fixture must not compact') },
  } })
  for (const count of [0, 8, 1024]) {
    const conversationId = `memory-latency-${count}`, members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Fixture',$4::jsonb)", [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const policy = await syncConversationPolicy(app, companyId, conversationId)
    async function enqueue() {
      const accepted = await app.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `sample-${++serial}`, version: 1, author: { id: 'test-owner', kind: 'human' }, text: 'List available memory.', mentions: [agentId] }, { mode: 'execute', executionClass: 'operation' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId); return run
    }
    const run = await enqueue(), identity = { tenantId: companyId, principalId: 'test-owner', agentId, sessionId: run.sessionId, workId: run.runId }
    activeScope = (await measured(`scopes-${count}-first`, () => memory.scopes(identity)))[0]
    assert.ok(activeScope)
    if (count) await pool.query(`INSERT INTO lingxios.agent_memories(tenant_id,scope_type,scope_id,id,path,title,description,body,layer,kind,origin,pinned,version,status,source_refs,search_text)
      SELECT $1,$2,$3,'fixture-'||$4::text||'-'||n,lpad(n::text,6,'0')||'.md','Fixture','Synthetic summary',repeat('x',12000),'reference','fact','explicit',false,1,'active','[{"sourceRef":"fixture","authorId":"test-owner","actionId":"seed","observedAt":"2026-10-19T00:00:00Z"}]'::jsonb,'fixture'
      FROM generate_series(1,$4::int) n`, [companyId, activeScope.scopeType, activeScope.scopeId, count])
    for (let i = 0; i < 20; i++) {
      const page: Awaited<ReturnType<typeof memory.list>> = await measured(`list-${count}-${i === 0 ? 'first' : 'warm'}-${i}`, () => memory.list(identity, activeScope))
      assert.equal(page.items.length, Math.min(count, 32))
    }
    await measured(`list-${count}-concurrent-4`, () => Promise.all(Array.from({ length: 4 }, () => memory.list(identity, activeScope))))
    await measured(`native-run-${count}`, () => worker!.runNext())
    const events = (await app.readEvents(run, 0)).events
    const start = events.find(event => event.kind === 'tool.started' && event.data.name === 'memory.list')
    const end = events.find(event => event.kind === 'tool.completed' && event.data.toolCallId === start?.data.toolCallId)
    assert.ok(start && end)
    assert.equal((end.data.result as { status: string }).status, 'completed')
    const timings = (await pool.query('SELECT seq,recorded_at FROM lingxios.agent_run_events WHERE run_id=$1 AND seq=ANY($2::bigint[]) ORDER BY seq', [run.runId, [start.seq, end.seq]])).rows
    evidence.push({ label: `native-events-${count}`, startedSeq: start.seq, completedSeq: end.seq, timings })
    const projection = await measured(`projection-${count}`, () => readRunProjection(app, run, true))
    assert.ok(projection.snapshot.message.content.some(part => part.type === 'tool-call' && part.toolName === 'memory.list' && part.result !== undefined))
    if (count === 8) {
      const blocker = await pool.connect()
      async function locked<T>(table: 'agent_public_tool_activity' | 'lingxios.agent_evolution_benchmarks', operation: () => Promise<T>) {
        await blocker.query('BEGIN')
        await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`)
        const release = delay(1200).then(() => blocker.query('ROLLBACK'))
        try { return await operation() } finally { await release }
      }
      try {
        await locked('lingxios.agent_evolution_benchmarks', () => measured('list-unrelated-evolution-lock-1200ms', () => memory.list(identity, activeScope)))
        const state = await app.readRunState(run); assert.ok(state)
        const streamProjection = new RunStreamProjection(run.runId, true, run)
        streamProjection.apply({ type: 'state', state })
        const body = new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(new TextEncoder().encode([start, end].map(event => `data: ${JSON.stringify({ type: 'event', event })}\n\n`).join('')))
          controller.close()
        } })
        await locked('agent_public_tool_activity', () => measured('stream-unrelated-presentation-lock-1200ms', async () => {
          const response = assistantRunResponse(body, streamProjection, { api: app, identity: run })
          assert.match(await response.text(), /completed/)
        }))
      } finally { blocker.release() }
    }
  }
})
