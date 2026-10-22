import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile,mkdtemp,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { createLingxiOS,packageResources,type ConversationPolicy } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { AssistantStream,AssistantTransportDecoder,AssistantTransportDeltaTracker } from 'assistant-stream'
import { RunStreamProjection,readRunProjection,assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'

// Failure model: docs/evidence/issue-283-native/FAILURE-MODEL.md.
// One real public Worker/control/PostgreSQL/SSE path; no provider, private table
// reads, production data or product migration. Only this fixture installs schema.
test('native persisted execution trace crosses product history/SSE with exact replay and revoked access denied', { timeout: 20000 }, async () => {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname),'dedicated local/CI database only')
  assert.match(url.pathname,/test/i)
  const admin = new Pool({ connectionString: url.toString() }),name = 'trace_bridge_test_'+randomUUID().replaceAll('-','')
  await admin.query(`CREATE DATABASE "${name}"`)
  url.pathname = '/'+name
  const db = new Pool({ connectionString: url.toString() }),directory = await mkdtemp(join(tmpdir(),'trace-bridge-'))
  await db.query(await readFile(packageResources().schema,'utf8'))
  const app = await createLingxiOS({ database: db,homesRoot: directory,background: { role: 'passive' },realtime: { allowPublicText: ()=>true },tools: [{
    action: 'probe.read',name: 'probe__read',description: 'Read a synthetic record',parameters: { type: 'object',properties: {},additionalProperties: false },
    effect: 'read',approval: false,parse: ()=>({}),authorize: async ()=>{},execute: async ()=>({ ok: true,value: { private: 'PRIVATE_TOOL_RESULT',answer: 42 } }),
  }] })
  const policy: ConversationPolicy = { tenantId: 'trace-tenant',conversationId: 'trace-room',version: 1,kind: 'group',owner: { kind: 'organization',id: 'trace-tenant' },defaultAgentId: 'trace-agent',participants: [
    { id: 'trace-human',kind: 'human',capabilities: ['read','execute'] },{ id: 'trace-agent',kind: 'agent',capabilities: ['read','execute','speak'] },
  ] }
  let calls = 0
  let entered!: () => void,release!: () => void
  const enteredModel = new Promise<void>(resolve=>{ entered=resolve })
  const modelGate = new Promise<void>(resolve=>{ release=resolve })
  const usage = { available: true,inputTokens: 11,outputTokens: 7 }
  const worker = createWorker({ controlPlane: app,kernel: { homesRoot: directory },worker: { id: 'trace-bridge-worker',healthPort: 0 },model: {
    modelId: 'synthetic-trace-model',previewFormat: 'user-text',publicTextProtocol: 'purpose-json-v1',contextWindowTokens: 200000,
    async run(request) {
      const first = ++calls === 1
      await request.onTextDelta?.(first ? '检查合成记录。' : '合成结果是42。',{ purpose: first ? 'commentary' : 'answer' })
      if(first) { entered();await modelGate }
      return { text: first ? '' : '合成结果是42。',output: first ? [{ type: 'function_call' as const,callId: 'trace-probe',name: 'probe__read',arguments: '{}' }]
        : [{ role: 'assistant' as const,content: '合成结果是42。' }],usage }
    },
    async structured() { return { model: 'synthetic-trace-model',value: { missing: [] },usage } },
    async compact() { throw new Error('short fixture must not compact') },
  } })
  try {
    await app.conversations.sync(policy)
    const identity = (await app.conversations.ingest({ tenantId: policy.tenantId,conversationId: policy.conversationId,policyVersion: 1,messageId: 'trace-source',version: 1,
      author: { kind: 'human',id: 'trace-human' },text: 'Read the synthetic record and answer.' },{ mode: 'execute',codeExecution: 'disabled' })).runs[0]!
    const running = worker.runNext()
    await enteredModel
    const liveNative = await app.readRunTrace(identity)
    assert.ok(liveNative?.origin)
    const live = (await readRunProjection(app,identity,false,undefined,undefined,undefined,true)).snapshot
    const liveTrace = runTraceSchema.parse(live.message.metadata.custom.runTrace)
    const liveCall = liveTrace.root.children.find(span=>span.kind === 'llm')!
    assert.ok(liveCall.start !== null)
    assert.equal(liveTrace.root.end,null);assert.equal(liveTrace.root.durationMs,null);assert.equal(liveCall.end,null)
    assert.equal(liveTrace.root.start,0)
    release();await running
    assert.equal(calls,2)
    const native = await app.readRunTrace(identity)
    assert.ok(native?.origin)
    assert.ok(native.spans.some(span=>span.kind === 'llm' && span.startedAt !== null && span.completedAt !== null && span.usageAvailable))
    assert.ok(native.spans.some(span=>span.kind === 'tool' && span.state === 'complete' && span.completedAt !== null))
    const readTrace = app.readRunTrace
    let viewerReads = 0
    app.readRunTrace = (...args: Parameters<typeof readTrace>) => { viewerReads++; return readTrace(...args) }
    const deliveryProjection = await readRunProjection(app,identity,false)
    assert.equal(viewerReads,0,'default/shared delivery projection does not read or persist viewer-only native descendants')
    assert.equal(runTraceSchema.parse(deliveryProjection.snapshot.message.metadata.custom.runTrace).revision,undefined)
    const history = (await readRunProjection(app,identity,false,undefined,undefined,undefined,true)).snapshot
    assert.equal(viewerReads,1)
    const trace = runTraceSchema.parse(history.message.metadata.custom.runTrace)
    assert.equal(trace.startedAt,liveTrace.startedAt)
    const completedCall = trace.root.children.find(span=>span.id === liveCall.id)!
    assert.equal(completedCall.start,liveCall.start);assert.ok(completedCall.end !== null)
    assert.equal(trace.startedAt,native.origin); assert.equal(trace.revision,native.revision)
    assert.equal(trace.timingBasis,'execution'); assert.ok(trace.root.children.some(span=>span.kind === 'llm' && span.start !== null && span.end !== null))
    const nativeRoot = native.spans.find(span=>span.spanId === native.rootSpanId)!
    assert.equal(trace.root.start,0)
    assert.equal(trace.root.end,nativeRoot.completedAt!-native.origin!)
    assert.equal(trace.root.durationMs,nativeRoot.completedAt!-nativeRoot.startedAt!)
    for (const item of native.spans.filter(span=>span.runId === identity.runId)) {
      const mapped = trace.root.id === item.spanId ? trace.root : trace.root.children.find(span=>span.id === item.spanId)
      assert.ok(mapped)
      assert.equal(mapped.start,item.startedAt === null ? null : item.startedAt-native.origin!)
      assert.equal(mapped.end,item.completedAt === null ? null : item.completedAt-native.origin!)
    }
    assert.equal(nativeText(history.message),'合成结果是42。')
    const upstream = await app.streamRun(identity,{ trace: true,lastEventId: '99999' })
    const projection = new RunStreamProjection(identity.runId,false,identity)
    const response = assistantRunResponse(upstream.body!,projection)
    const reader = AssistantStream.fromResponse(response,new AssistantTransportDecoder()).getReader(),tracker = new AssistantTransportDeltaTracker()
    try { for (;;) { const item = await reader.read(); if (item.done) break; if (item.value.type === 'update-state') tracker.append(item.value.operations) } }
    finally { await reader.cancel() }
    const replay = tracker.state as unknown as AgentRunSnapshot
    assert.deepEqual(replay.message.metadata.custom.runTrace,history.message.metadata.custom.runTrace)
    const reload = (await readRunProjection(app,identity,false,undefined,undefined,undefined,true)).snapshot
    assert.deepEqual(reload.message.metadata.custom.runTrace,history.message.metadata.custom.runTrace)
    if (process.env.ISSUE296_SNAPSHOTS) await writeFile(process.env.ISSUE296_SNAPSHOTS,JSON.stringify({ running: live,initial: history,replay,reload }))
    assert.equal(nativeText(replay.message),'合成结果是42。')
    assert.doesNotMatch(JSON.stringify(replay),/PRIVATE_TOOL_RESULT|model\.request|leaseToken|instructionsSha256/)
    await assert.rejects(readRunProjection(app,{ ...identity,tenantId: 'other' },false),/not found/)
    await app.conversations.sync({ ...policy,version: 2,participants: policy.participants.filter(item=>item.id !== 'trace-human') })
    await assert.rejects(readRunProjection(app,identity,false),/participant|forbidden|capability/)
    await assert.rejects(app.streamRun(identity,{ trace: true }),/participant|forbidden|capability/)
  } finally {
    release();await worker.stop(); await app.stop(); await db.end()
    // Pool.end resolves when client sockets have been closed locally; PostgreSQL
    // can still be consuming their final frames. Wait for this fixture's own
    // sessions to leave before dropping it, instead of killing open readers.
    for (let attempt = 0; attempt < 40; attempt++) {
      const active = await admin.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pg_stat_activity WHERE datname=$1',[name])
      if (active.rows[0]?.count === '0') break
      await delay(25)
    }
    await admin.query(`DROP DATABASE "${name}"`);await admin.end();await rm(directory,{ recursive: true,force: true })
  }
})
