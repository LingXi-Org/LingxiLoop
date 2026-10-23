import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile,mkdtemp,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createLingxiOS,packageResources,skillIndex,type ConversationPolicy } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { AssistantStream,AssistantTransportDecoder,AssistantTransportDeltaTracker } from 'assistant-stream'
import { readRunProjection,assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'

// Failure inventory: docs/evidence/issue-348/FAILURE-MODEL.md. Dedicated local
// database and synthetic native tools; no provider or product data is accessed.
test('real skill/retrieval calls and authorized graph children survive history and SSE replay', { timeout: 30000 },async () => {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/test/)
  const admin = new Pool({ connectionString: url.toString() }),name = `work348_test_${randomUUID().replaceAll('-','')}`
  await admin.query(`CREATE DATABASE "${name}"`);url.pathname = '/'+name
  const database = new Pool({ connectionString: url.toString() }),directory = await mkdtemp(join(tmpdir(),'work348-'))
  await database.query(await readFile(packageResources().schema,'utf8'))
  const skill = { name: 'fixture',version: '1',description: 'Synthetic reference workflow.',body: 'Read the requested synthetic reference.',actions: ['research.search'] }
  const selection = skillIndex(skill)
  const app = await createLingxiOS({ database,homesRoot: directory,background: { role: 'passive' },realtime: { allowPublicText: ()=>true },skills: [skill],
    capabilityResolver: { resolve: async ()=>[{ name: 'skills',methods: ['load'] },{ name: 'research',methods: ['search'] }] },
    tools: [{ name: 'research__search',action: 'research.search',description: 'Read a synthetic fixture.',effect: 'read',approval: false,
      parameters: { type: 'object',properties: {},additionalProperties: false },parse: ()=>({}),authorize: async ()=>{},
      execute: async ()=>({ ok: true,value: { private: 'PRIVATE_TOOL_OUTPUT',result: 'fixture' } }) }] })
  const policy: ConversationPolicy = { tenantId: 'tenant348',conversationId: 'room348',version: 1,kind: 'group',
    owner: { kind: 'organization',id: 'tenant348' },defaultAgentId: 'agent348',participants: [
      { id: 'human348',kind: 'human',capabilities: ['read','execute'] },
      ...['agent348','helper348'].map(id=>({ id,kind: 'agent' as const,capabilities: ['read','execute','speak'] as ('read'|'execute'|'speak')[] })),
    ] }
  let calls = 0
  const usage = { available: true,inputTokens: 10,outputTokens: 4 }
  const worker = createWorker({ controlPlane: app,kernel: { homesRoot: directory },worker: { id: 'worker348',healthPort: 0 },model: {
    modelId: 'synthetic348',previewFormat: 'user-text',contextWindowTokens: 200000,
    run: async ()=>({ text: ++calls === 1 ? '' : '合成任务结果。',output: calls === 1 ? [
      { type: 'function_call' as const,callId: 'load348',name: 'skills__load',arguments: JSON.stringify({ name: selection.name,version: selection.version,hash: selection.hash }) },
      { type: 'function_call' as const,callId: 'search348',name: 'research__search',arguments: '{}' },
    ] : [{ role: 'assistant' as const,content: '合成任务结果。' }],usage }),
    structured: async ()=>({ model: 'synthetic348',value: { missing: [] },usage }),compact: async ()=>{ throw new Error('unexpected compaction') },
  } })
  try {
    await app.conversations.sync(policy)
    const identity = (await app.conversations.ingest({ tenantId: policy.tenantId,conversationId: policy.conversationId,policyVersion: 1,
      messageId: 'source348',version: 1,author: { kind: 'human',id: 'human348' },text: 'Read the synthetic workflow and reference.' },
    { mode: 'execute',codeExecution: 'disabled' })).runs[0]!
    await worker.runNext()
    const native = await app.readRunTrace(identity)
    assert.ok(native)
    const nativeTools = native.spans.filter(span=>span.kind === 'tool')
    assert.equal(nativeTools.length,2)
    assert.ok(nativeTools.every(span=>span.startedAt !== null && span.completedAt !== null && span.completedAt >= span.startedAt))
    const readNative = app.readRunTrace.bind(app)
    app.readRunTrace = async (...args)=>{ const trace = await readNative(...args);return trace ? { ...trace,revision: 'fixture-model-only',spans: trace.spans.filter(span=>span.kind !== 'tool') } : null }
    const rescued = (await readRunProjection(app,identity,false,undefined,undefined,undefined,true)).snapshot
    const rescuedTools = runTraceSchema.parse(rescued.message.metadata.custom.runTrace).root.children.filter(span=>span.kind === 'tool')
    assert.equal(rescuedTools.length,2,'public real tool events survive a model-only native collector')
    for (const span of rescuedTools) {
      const original = nativeTools.find(item=>item.name === (span.workKind === 'skill' ? 'skills.load' : 'research.search'))!
      assert.equal(span.start,original.startedAt!-native.origin!);assert.equal(span.end,original.completedAt!-native.origin!)
    }
    app.readRunTrace = readNative
    const projection = await readRunProjection(app,identity,false,undefined,undefined,undefined,true)
    const history = projection.snapshot
    const work = runTraceSchema.parse(history.message.metadata.custom.runTrace).root.children.filter(span=>span.kind === 'tool')
    assert.deepEqual(new Set(work.map(span=>span.workKind)),new Set(['skill','retrieval']))
    assert.ok(work.every(span=>span.cost === null && span.tokensIn === null))
    const upstream = await app.streamRun(identity,{ trace: true })
    const response = assistantRunResponse(upstream.body!,projection),tracker = new AssistantTransportDeltaTracker()
    for await (const chunk of AssistantStream.fromResponse(response,new AssistantTransportDecoder())) if (chunk.type === 'update-state') tracker.append(chunk.operations)
    const replay = tracker.state as unknown as AgentRunSnapshot
    assert.deepEqual(replay.message.metadata.custom.runTrace,history.message.metadata.custom.runTrace)
    const reload = (await readRunProjection(app,identity,false,undefined,undefined,undefined,true)).snapshot
    assert.deepEqual(reload.message.metadata.custom.runTrace,history.message.metadata.custom.runTrace)
    assert.doesNotMatch(JSON.stringify(replay),/PRIVATE_TOOL_OUTPUT|arguments|leaseToken|instructionsSha256/)

    const parent = (await app.conversations.ingest({ tenantId: policy.tenantId,conversationId: policy.conversationId,policyVersion: 1,
      messageId: 'parent348',version: 1,author: { kind: 'human',id: 'human348' },text: 'Delegate a synthetic child.' })).runs[0]!
    const host = app.connectWorker({ workerId: 'graph348',workKinds: ['turn'] }),leased = (await host.claimWork())!
    assert.equal(leased.id,parent.runId)
    await host.emitEvent(leased,{ runId: leased.id,seq: 1,kind: 'run.started',stage: 'started',visibility: 'user',data: {} })
    const sessionKey = JSON.stringify([leased.tenantId,leased.agentId,leased.sessionId,leased.threadId ?? null])
    const priorSession = await host.loadSession(leased,sessionKey)
    await host.saveSession(leased,{ key: sessionKey,
      tenantId: leased.tenantId,agentId: leased.agentId,sessionId: leased.sessionId,...(leased.threadId ? { threadId: leased.threadId } : {}),
      history: [],appliedWorkIds: [leased.id],revision: priorSession?.revision ?? 0,compactionEpoch: priorSession?.compactionEpoch ?? 0,request: { version: 1,workId: leased.id,tenantId: leased.tenantId,
        sessionId: leased.sessionId,authorId: leased.principalId!,sourceRef: leased.triggerRef,originalText: 'Delegate a synthetic child.',revisions: [],attachments: [],
        ...(leased.conversation ? { conversation: leased.conversation } : {}),
        evidence: { version: 1,id: 'graph348-evidence',items: [] } } })
    await host.reserveModelCall(leased,'graph348-admission',{ maxModelCalls: 128,maxTokens: 1000000,maxCostMicros: 10000000,
      deadlineAt: new Date(Date.now()+60000).toISOString(),reservedTokens: 20,reservedInputTokens: 10,reservedOutputTokens: 10,
      childAdmission: { inputTokens: 10,outputTokens: 10,executionMs: 1000 } })
    const graph = await app.graphs.enqueue(parent,{ id: 'graph348',nodes: [{ id: 'child348',agentId: 'helper348',text: 'Read the authorized synthetic child.' }] })
    const child = graph.nodes[0]!
    // A real authorized public status keeps this still-running parent's message
    // visible. No model generation or inferred child execution is manufactured.
    const status = { version: 2,requestVersion: 1,fence: leased.fence,attemptId: 'graph348-status',partId: 'graph348-status',partIndex: 0,purpose: 'commentary' }
    await host.emitEvent(leased,{ runId: leased.id,seq: 2,kind: 'public.text.delta',stage: 'delta',visibility: 'user',data: { ...status,chunkIndex: 0,text: '合成子任务已排队。' } })
    await host.emitEvent(leased,{ runId: leased.id,seq: 3,kind: 'public.text.ended',stage: 'completed',visibility: 'user',data: { ...status,chunkCount: 1,reason: 'completed' } })
    const tree = (await readRunProjection(app,parent,false,undefined,undefined,undefined,true)).snapshot
    const childSpan = runTraceSchema.parse(tree.message.metadata.custom.runTrace).root.children.find(span=>span.workKind === 'subtask')
    assert.ok(childSpan);assert.equal(childSpan.start,null);assert.equal(childSpan.end,null)
    assert.ok((await app.readRunTrace(parent))!.spans.some(span=>span.childRunId === child.workId))
    assert.equal(await app.readRunTrace({ ...parent,tenantId: 'other-tenant' }),null)
    if (process.env.ISSUE348_REAL_SNAPSHOTS) await writeFile(process.env.ISSUE348_REAL_SNAPSHOTS,JSON.stringify({ history,replay,reload,rescued,child: tree }))
  } finally {
    await worker.stop();await app.stop();await database.end()
    await admin.query(`DROP DATABASE "${name}"`);await admin.end();await rm(directory,{ recursive: true,force: true })
  }
})
