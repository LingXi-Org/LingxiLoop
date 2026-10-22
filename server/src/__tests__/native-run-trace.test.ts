import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunTraceSnapshot, RunTraceSpan } from '@lyyzka/lingxios'
import { buildNativeRunTrace } from '../agent-runtime/run-trace.js'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'

// Failure model: docs/evidence/issue-283-native/FAILURE-MODEL.md (before code).
const origin = 1000
const span = (overrides: Partial<RunTraceSpan>): RunTraceSpan => ({ spanId: 'root',parentSpanId: null,runId: 'run',kind: 'agent',state: 'running',
  startedAt: origin,completedAt: null,timingBasis: 'run-execution',seq: 1,revision: 'span-revision',requestVersion: null,fence: null,attemptId: null,...overrides })
const snapshot = (): RunTraceSnapshot => ({ version: 1,runId: 'run',rootSpanId: 'root',requestVersion: 1,fence: 1,seq: 7,revision: 'snapshot-revision',queuedAt: 900,origin,truncated: false,
  spans: [span({}),span({ spanId: 'child',parentSpanId: 'root',runId: 'child-run',childRunId: 'child-run',startedAt: 1100 }),
    span({ spanId: 'call',parentSpanId: 'child',runId: 'child-run',kind: 'llm',startedAt: 1120,completedAt: 1250,state: 'complete',timingBasis: 'model-invocation',
      callId: 'opaque-call',model: 'synthetic-model',usageAvailable: true,inputTokens: 11,outputTokens: 7,costMicros: null,fence: 1,requestVersion: 1,attemptId: 'opaque-call' }),
    span({ spanId: 'tool',parentSpanId: 'root',kind: 'tool',startedAt: 1300,timingBasis: 'host-action',toolCallId: 'host:tool',name: 'documents.read',state: 'unknown' })] })
const state = (version = 1,fence = 1) => ({ type: 'state' as const,state: { run: { id: 'run',status: 'leased' as const,fence,requestVersion: version,resultId: null,resultFence: null,kind: 'turn',attempts: 1,
  createdAt: new Date(900).toISOString(),availableAt: '',heartbeatAt: null,lastProgressAt: null,goalOutcome: null,error: null },message: null,delivery: null } })
const trace = (projection: RunStreamProjection) => runTraceSchema.parse(projection.snapshot.message.metadata.custom.runTrace)
test('public native hierarchy, actual origin and measured usage survive DTO replay without private payloads', () => {
  const value = buildNativeRunTrace(snapshot(),[{ type: 'tool-call',toolCallId: 'host:tool',toolName: 'documents.read',eventSeq: 1,argsText: 'PRIVATE_ARGS',args: { private: true },
    result: { private: 'PRIVATE_RESULT' },display: { title: '阅读文档',purpose: '读取授权内容。',summary: '已读取。' } }])
  assert.equal(value.startedAt,1000); assert.equal(value.queuedAt,900); assert.equal(value.timingBasis,'execution')
  const child = value.root.children.find(item=>item.kind === 'agent')!
  assert.equal(child.start,100); assert.equal(child.children[0]!.start,120); assert.equal(child.children[0]!.end,250)
  assert.equal(child.children[0]!.durationMs,130); assert.equal(child.tokensIn,11); assert.equal(value.root.tokensOut,7); assert.equal(value.root.cost,null)
  assert.equal(value.root.children.find(item=>item.kind === 'tool')!.end,null)
  assert.doesNotMatch(JSON.stringify(value),/PRIVATE|principal|session|opaque-call/)
  assert.deepEqual(runTraceSchema.parse(JSON.parse(JSON.stringify(value))),JSON.parse(JSON.stringify(value)))
  const replay = snapshot()
  replay.spans.push({ ...replay.spans.find(item=>item.kind === 'tool')!,spanId: 'later-tool',fence: 2,seq: 8,state: 'complete',completedAt: 1400 })
  const receipts = buildNativeRunTrace(replay,[{ type: 'tool-call',toolCallId: 'host:tool',toolName: 'documents.read',eventSeq: 8,argsText: '{}',args: {},display: { title: '阅读文档',purpose: '读取授权内容。',summary: '最新回执已完成。' } }])
  assert.equal(receipts.root.children.find(item=>item.id === 'tool')!.output,undefined)
  assert.equal(receipts.root.children.find(item=>item.id === 'later-tool')!.output,'最新回执已完成。')
})
test('trace frames replace metadata, clear unavailable descendants and totals, and reject a superseded request', () => {
  const projection = new RunStreamProjection('run',false)
  projection.apply(state())
  const body = projection.snapshot.message.content
  projection.apply({ type: 'trace',runId: 'run',trace: snapshot() })
  assert.equal(trace(projection).root.tokensIn,11)
  assert.deepEqual(projection.snapshot.message.content,body)
  projection.apply({ type: 'trace',runId: 'run',trace: snapshot() })
  assert.equal(trace(projection).root.children.length,2)
  projection.apply({ type: 'trace',runId: 'run',trace: null })
  assert.equal(trace(projection).root.tokensIn,null); assert.equal(trace(projection).root.children.length,0)
  projection.apply({ type: 'trace',runId: 'run',trace: snapshot() })
  projection.apply(state(2,1))
  projection.apply({ type: 'trace',runId: 'run',trace: snapshot() })
  assert.equal(trace(projection).root.children.length,0)
  assert.throws(()=>projection.apply({ type: 'trace',runId: 'other',trace: snapshot() }),/身份/)
  const current = { ...snapshot(),requestVersion: 2 }
  projection.apply({ type: 'trace',runId: 'run',trace: current })
  const cancelled = state(2)
  projection.apply({ ...cancelled,state: { ...cancelled.state,run: { ...cancelled.state.run,status: 'cancelled' } } })
  projection.apply({ type: 'trace',runId: 'run',trace: current })
  assert.equal(trace(projection).root.status,'cancelled'); assert.equal(trace(projection).root.children.length,0,'old running clocks stop until a current receipt is available')
})
test('new events downgrade coverage until a full current replacement; truncation and unknown fields never become zero', () => {
  const projection = new RunStreamProjection('run',false)
  projection.apply(state()); projection.apply({ type: 'trace',runId: 'run',trace: snapshot() })
  projection.apply({ type: 'event',event: { runId: 'run',seq: 8,kind: 'model.request.started',stage: 'started',visibility: 'user',data: {} } })
  assert.equal(trace(projection).root.tokensIn,null); assert.ok(trace(projection).limitations.includes('presentation-unavailable'))
  projection.apply({ type: 'trace',runId: 'run',trace: { ...snapshot(),seq: 8,revision: 'current' } })
  assert.equal(trace(projection).root.tokensIn,11)
  const incomplete = buildNativeRunTrace({ ...snapshot(),truncated: true,origin: null })
  assert.equal(incomplete.root.start,null); assert.equal(incomplete.root.tokensIn,null); assert.equal(incomplete.root.cost,null)
  assert.equal(incomplete.root.children[0]!.start,null)
})
test('scoped ledger costs and embedding identities overlay exact native calls without duplicate spans', () => {
  const current = snapshot()
  current.spans = current.spans.filter(item=>item.runId === 'run')
  current.spans.push(span({ spanId: 'embedding',parentSpanId: 'root',kind: 'llm',startedAt: 1050,completedAt: 1184,
    state: 'complete',callId: 'embedding-call',model: 'Pro/BAAI/bge-m3',usageAvailable: true,inputTokens: 10,outputTokens: 0,costMicros: 0 }))
  const value = buildNativeRunTrace(current,[],[{ id: 'ledger',callId: 'embedding-call',model: 'Pro/BAAI/bge-m3',apiKind: 'embedding',
    status: 'complete',durationMs: 134,tokensIn: 10,tokensOut: 0,cost: 0.0000001,costEstimated: true }])
  assert.equal(value.root.children.filter(item=>item.kind === 'embedding').length,1)
  const embedding = value.root.children.find(item=>item.kind === 'embedding')!
  assert.deepEqual([embedding.start,embedding.end,embedding.durationMs],[50,184,134])
  assert.equal(embedding.cost,0.0000001); assert.equal(embedding.costEstimated,true)
  assert.equal(value.root.cost,0.0000001)
  assert.doesNotMatch(JSON.stringify(value),/embedding-call|ledger/)
})
test('a registered child embedding never inherits the chat model budget price',()=>{
  for(const model of ['Pro/BAAI/bge-m3','BAAI/bge-m3','Qwen/Qwen3-Embedding-8B']) {
    const current = snapshot()
    const call = current.spans.find(item=>item.kind === 'llm')!
    call.model = model;call.costMicros = 99000000
    const trace = buildNativeRunTrace(current)
    const child = trace.root.children.find(item=>item.kind === 'agent')!
    assert.equal(child.children[0]!.kind,'embedding')
    assert.equal(child.children[0]!.cost,null)
    assert.equal(trace.root.cost,null)
  }
})
