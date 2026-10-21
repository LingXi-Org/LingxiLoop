import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildRunTrace } from '../agent-runtime/run-trace.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { runState } from './assistant-transport.test.js'

const origin = Date.parse('2026-10-02T00:00:00Z')
const tool = { type: 'tool-call' as const, toolCallId: 'host:read', toolName: 'documents.read',args: { secret: 'PRIVATE_SECRET' },argsText: 'PRIVATE_SECRET',
  timing: { startedAt: origin+100,completedAt: origin+600 },result: { status: 'completed',value: 'PRIVATE_OUTPUT' },
  display: { title: '阅读文档',purpose: '读取已授权资料。',input: [{ label: '文档',value: '公开文档名' }],summary: '已阅读文档内容。' } }
test('relative timing, measured usage, unknown cost and safe public details survive JSON replay', () => {
  const trace = buildRunTrace({ runId: 'run',createdAt: new Date(origin).toISOString(),lifecycle: 'succeeded',tools: [tool],llm: [
    { id: 'llm-a',model: 'model-a',status: 'complete',durationMs: 900,tokensIn: 100,tokensOut: 20,cost: null,costEstimated: false },
  ] })
  assert.equal(trace.root.start,0)
  assert.equal(trace.root.end,null,'terminal timestamp is unavailable')
  const call = trace.root.children.find(span => span.kind === 'tool')!
  assert.equal(call.start,100); assert.equal(call.end,600)
  assert.equal(call.durationMs,500)
  assert.deepEqual(call.input,[{ label: '文档',value: '公开文档名' }])
  assert.equal(call.output,'已阅读文档内容。')
  assert.equal(trace.root.children.find(span => span.kind === 'llm')!.start,null)
  assert.equal(trace.root.tokensIn,100); assert.equal(trace.root.cost,null)
  assert.doesNotMatch(JSON.stringify(trace),/PRIVATE|arguments|reasoning|principal/)
  assert.deepEqual(runTraceSchema.parse(JSON.parse(JSON.stringify(trace))),trace)
})
test('cancellation/failure stops incomplete tool clocks without manufacturing end times', () => {
  for (const lifecycle of ['cancelled','failed','waiting'] as const) {
    const trace = buildRunTrace({ runId: 'run',createdAt: new Date(origin).toISOString(),lifecycle,
      tools: [{ ...tool,result: undefined,timing: { startedAt: origin+100 } }],llm: [] })
    assert.equal(trace.root.children[0]!.status,lifecycle === 'failed' ? 'error' : lifecycle === 'waiting' ? 'waiting' : 'cancelled')
    assert.equal(trace.root.children[0]!.end,null)
    assert.equal(trace.root.children[0]!.durationMs,null)
    assert.equal(trace.root.cost,null)
  }
})
test('invalid/negative timestamps stay unknown, and duplicate IDs do not duplicate spans', () => {
  const trace = buildRunTrace({ runId: 'run',createdAt: 'bad',lifecycle: 'leased',tools: [tool,tool],llm: [] })
  assert.equal(trace.startedAt,null); assert.equal(trace.root.start,null)
  assert.equal(trace.root.children.length,1); assert.equal(trace.root.children[0]!.start,null)
  assert.equal(trace.root.children[0]!.durationMs,500)
})
test('native state/event projection carries an honest root trace without body pollution', () => {
  const projection = new RunStreamProjection('run',false)
  const running = projection.apply({ type: 'state',state: runState() })
  const stopped = projection.apply({ type: 'state',state: runState('cancelled') })
  const completed = projection.apply({ type: 'state',state: runState('succeeded') })
  assert.equal(runTraceSchema.parse(running.message.metadata.custom.runTrace).root.status,'running')
  assert.equal(runTraceSchema.parse(stopped.message.metadata.custom.runTrace).root.status,'cancelled')
  assert.equal(runTraceSchema.parse(completed.message.metadata.custom.runTrace).root.end,null)
  assert.equal(completed.message.content.filter(p => p.type === 'text' && p.text === '最终正文').length,1)
  if (process.env.ISSUE283_SNAPSHOTS) {
    const trace = buildRunTrace({ runId: 'run',createdAt: new Date(origin).toISOString(),lifecycle: 'leased',tools: [tool],llm: [
      { id: 'llm-a',model: 'model-a',status: 'complete',durationMs: 900,tokensIn: 100,tokensOut: 20,cost: null,costEstimated: false },
    ] })
    // Renderer-only child: no claim that runtime 3.6.0 publishes child discovery.
    trace.root.children.push({ ...trace.root,id: 'synthetic-child',name: '合成子任务',start: 200,end: 1000,durationMs: 800,status: 'complete',children: [
      { ...trace.root.children[0]!,id: 'synthetic-child-tool',name: '子任务工具',start: 300,end: 800,durationMs: 500 },
    ] })
    const snapshot = (status: 'running'|'cancelled'|'error'|'complete') => ({ ...completed,message: { ...completed.message,
      status: status === 'running' ? { type: 'running' } : status === 'complete' ? { type: 'complete',reason: 'stop' } : { type: 'incomplete',reason: status === 'cancelled' ? 'cancelled' : 'error' },
      metadata: { ...completed.message.metadata,custom: { ...completed.message.metadata.custom,runTrace: { ...trace,startedAt: Date.now()-2000,
        root: { ...trace.root,status } } } } } })
    const destination = process.env.ISSUE283_SNAPSHOTS
    mkdirSync(destination.slice(0,destination.lastIndexOf('/')),{recursive: true})
    writeFileSync(destination,JSON.stringify({ running: snapshot('running'),cancelled: snapshot('cancelled'),failed: snapshot('error'),completed: snapshot('complete') }))
  }
})
