import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunTraceSnapshot } from '@lyyzka/lingxios'
import { buildNativeRunTrace } from '../agent-runtime/run-trace.js'
import type { HarnessToolPart } from '../agent-runtime/message-projection.js'
import { mkdirSync,writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createNativeMessage } from '../../../src/lib/nativeMessage.js'
import { createRunView } from '@lyyzka/lingxios/ui'
import { harnessToolParts } from '../agent-runtime/message-projection.js'
import { publicRunEvent } from '../agent-runtime/public-events.js'

// Failure inventory: docs/evidence/issue-348/FAILURE-MODEL.md, written first.
const snapshot = (): RunTraceSnapshot => ({ version: 1,seq: 20,revision: 'trace',runId: 'run',requestVersion: 2,fence: 2,
  rootSpanId: 'root',origin: 1000,queuedAt: 900,truncated: false,spans: [
    { spanId: 'root',parentSpanId: null,runId: 'run',kind: 'agent',state: 'complete',startedAt: 1000,completedAt: 2000,
      timingBasis: 'run-execution',seq: 20,revision: 'root',requestVersion: null,fence: null,attemptId: null },
    { spanId: 'model',parentSpanId: 'root',runId: 'run',kind: 'llm',state: 'complete',startedAt: 1100,completedAt: 1200,
      timingBasis: 'model-invocation',seq: 2,revision: 'model',requestVersion: 2,fence: 2,attemptId: 'model',
      callId: 'private-call',model: 'synthetic',usageAvailable: true,inputTokens: 10,outputTokens: 4,costMicros: 12000 },
  ] })
const tool = (id: string,name: string,seq = 8): HarnessToolPart => ({ type: 'tool-call',toolCallId: id,toolName: name,
  argsText: 'PRIVATE_ARGUMENTS',args: { secret: 'PRIVATE_ARGUMENTS' },result: { status: 'completed',value: 'PRIVATE_OUTPUT' },
  startedSeq: seq-1,eventSeq: seq,activityIdentity: { requestVersion: 2,fence: 2,attemptId: `attempt-${id}` },
  timing: { startedAt: 1250,completedAt: 1500 } })
const work = (value: ReturnType<typeof buildNativeRunTrace>) => value.root.children.filter(span => span.kind === 'tool')

test('native model-only snapshots retain exact current public tool intervals and distinct calls', () => {
  const value = buildNativeRunTrace(snapshot(),[tool('host:one','research.search'),tool('host:two','research.search'),tool('host:skill','skills.load')])
  assert.equal(work(value).length,3)
  assert.equal(new Set(work(value).map(span=>span.id)).size,3)
  assert.deepEqual(work(value).map(span=>[span.start,span.end,span.durationMs]),[[250,500,250],[250,500,250],[250,500,250]])
  assert.deepEqual(work(value).map(span=>span.workKind),['retrieval','retrieval','skill'])
  assert.equal(value.root.cost,0.012)
  assert.ok(work(value).every(span=>span.cost === null && span.tokensIn === null && span.tokensOut === null))
  assert.doesNotMatch(JSON.stringify(value),/PRIVATE|private-call|attempt-host/)
  assert.deepEqual(buildNativeRunTrace(snapshot(),JSON.parse(JSON.stringify([tool('host:one','research.search'),tool('host:two','research.search'),tool('host:skill','skills.load')]))),value)
})

test('native tool identity wins once; stale or future public observations never attach', () => {
  const native = snapshot()
  native.spans.push({ ...native.spans[0],spanId: 'native-tool',parentSpanId: 'root',kind: 'tool',name: 'research.search',toolCallId: 'host:one',
    startedAt: 1250,completedAt: 1500,seq: 8,requestVersion: 2,fence: 2,attemptId: 'a',timingBasis: 'host-action' })
  const stale = { ...tool('host:old','documents.read'),activityIdentity: { requestVersion: 1,fence: 1,attemptId: 'old' } }
  const value = buildNativeRunTrace(native,[tool('host:one','research.search'),tool('host:future','files.read',21),stale])
  assert.deepEqual(work(value).map(span=>span.id),['native-tool'])
  assert.equal(work(value)[0].workKind,'retrieval')
})

test('supplemental historical timing stays absent while failures and child hierarchy remain factual', () => {
  const native = snapshot()
  native.spans.push({ ...native.spans[0],spanId: 'child',parentSpanId: 'root',runId: 'child-run',childRunId: 'child-run',state: 'cancelled',completedAt: null })
  const value = buildNativeRunTrace(native,[{ ...tool('host:failed','documents.edit'),timing: undefined,isError: true,result: { status: 'failed' } }])
  assert.deepEqual([work(value)[0].start,work(value)[0].end,work(value)[0].durationMs],[null,null,null])
  assert.equal(work(value)[0].status,'error')
  assert.equal(value.root.children.find(span=>span.id === 'child')?.workKind,'subtask')
})

test('browser fixtures retain the same actual tool tree through final replay', () => {
  const native = snapshot()
  native.spans.push({ ...native.spans[0],spanId: 'child',parentSpanId: 'root',runId: 'child-run',childRunId: 'child-run',startedAt: 1300,completedAt: 1800 },
    { ...native.spans[0],spanId: 'child-tool',parentSpanId: 'child',runId: 'child-run',kind: 'tool',name: 'documents.edit',
      toolCallId: 'host:child',startedAt: 1400,completedAt: 1700,timingBasis: 'host-action' })
  const tools = [tool('host:one','research.search'),tool('host:two','research.search'),tool('host:skill','skills.load')]
  const complete = buildNativeRunTrace(native,tools)
  const live = buildNativeRunTrace({ ...native,spans: native.spans.map(span=>({ ...span,state: 'running',completedAt: null })) },
    tools.map(tool=>({ ...tool,result: undefined,timing: { startedAt: 1250 } })))
  const frame = (runTrace: typeof complete) => ({ message: createNativeMessage({ id: 'run-run',role: 'assistant',createdAt: new Date(900).toISOString(),
    content: [{ type: 'text',text: '合成任务结果。',providerMetadata: { lingxiloop: { activity: { version: 1,id: 'answer:2:0',kind: 'answer',label: '答复' } } } }],
    status: { type: 'complete',reason: 'stop' },custom: { runId: 'run',activityPresentation: { version: 1 },
      harness: { ...createRunView('run'),requestVersion: 2,fence: 2,lifecycle: 'succeeded',artifacts: [] },runTrace } }) })
  assert.equal(complete.root.children.length,5)
  if (process.env.ISSUE348_SNAPSHOTS) {
    mkdirSync(dirname(process.env.ISSUE348_SNAPSHOTS),{ recursive: true })
    writeFileSync(process.env.ISSUE348_SNAPSHOTS,JSON.stringify({ running: frame(live),completed: frame(complete),replay: frame(JSON.parse(JSON.stringify(complete))) }))
  }
})

test('public tool projection retains only the trusted CP timing tuple without private metadata', () => {
  const source = (seq: number,kind: 'tool.started'|'tool.completed',at: number) => ({ runId: 'run',seq,kind,
    stage: kind === 'tool.started' ? 'started' as const : 'completed' as const,visibility: 'user' as const,data: {
      requestVersion: 2,fence: 2,attemptId: 'attempt',toolCallId: 'host:actual',name: 'skills.load',result: { status: 'completed' },
      _executionTrace: { version: 1,at,requestVersion: 2,fence: 2,attemptId: 'PRIVATE_ATTEMPT',private: 'PRIVATE_METADATA' },
    } })
  let parts = harnessToolParts('run',[publicRunEvent(source(7,'tool.started',1250))])
  assert.deepEqual(parts[0].timing,{ startedAt: 1250 })
  parts = harnessToolParts('run',[publicRunEvent(source(8,'tool.completed',1500),'skills.load')],parts)
  assert.deepEqual(parts[0].timing,{ startedAt: 1250,completedAt: 1500 })
  assert.doesNotMatch(JSON.stringify(publicRunEvent(source(7,'tool.started',1250))),/PRIVATE/)
  const invalid = source(7,'tool.started',1250);invalid.data._executionTrace.requestVersion = 1
  assert.equal(harnessToolParts('run',[publicRunEvent(invalid)])[0].timing,undefined)
})
