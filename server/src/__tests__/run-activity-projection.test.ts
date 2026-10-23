import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, type RunEvent } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { publicRunEvent, publicToolValue } from '../agent-runtime/public-events.js'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { createNativeMessage, deserializeMessage, nativeText, nativeMessageSchema } from '../../../src/lib/nativeMessage.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'

// Failure inventory: docs/run-activity-contract.md (written before product edits).
const start = (id: string, seq: number, name = 'documents.read'): RunEvent => ({
  runId: 'run', seq, kind: 'tool.started', stage: 'started', visibility: 'user', data: { toolCallId: `host:${id}`, name },
})
const finish = (id: string, seq: number, value: unknown = { body: 'PRIVATE_BODY' }): RunEvent => ({
  runId: 'run', seq, kind: 'tool.completed', stage: 'completed', visibility: 'user',
  data: { toolCallId: `host:${id}`, result: { status: 'completed', value } },
})
const report = (text: string, state: 'running' | 'complete' = 'complete') => ({
  version: 1, id: 'approach', kind: 'reasoning', label: '解题说明', text, state,
})

test('public activity is explicit and replayable while the answer keeps its native part index', () => {
  const events = [start('read', 1), finish('read', 2), start('explain', 3, 'chat.report_progress'), finish('explain', 4, report('依据已读资料核对条件。'))]
  const tools = harnessToolParts('run', events)
  const view = { ...createRunView('run'), lifecycle: 'leased' as const, draft: '最终答案的流式预览' }
  const parts = runMessageParts(view, tools)
  assert.deepEqual(parts.map(part => part.type), ['text', 'tool-call', 'reasoning'])
  assert.equal(activityAnnotation(parts[0])?.kind, 'answer')
  assert.equal(activityAnnotation(parts[1])?.kind, 'tool')
  assert.equal(activityAnnotation(parts[2])?.kind, 'commentary')
  assert.equal(parts[2].type === 'reasoning' && parts[2].text, '依据已读资料核对条件。')
  assert.doesNotMatch(JSON.stringify(parts), /PRIVATE_BODY/)
  const native = createNativeMessage({ id: 'run-run', role: 'assistant', content: parts })
  assert.deepEqual(deserializeMessage(native).content, parts)
  assert.deepEqual(harnessToolParts('run', [...events].reverse(), tools), tools)
})

test('incremental public explanations update one original position; arbitrary results cannot impersonate them', () => {
  const events = [start('one', 1, 'chat.report_progress'), finish('one', 2, report('先核对条件。', 'running')),
    start('read', 3), finish('read', 4), start('two', 5, 'chat.report_progress'), finish('two', 6, report('先核对条件，再对比两个结果。'))]
  const parts = runMessageParts({ ...createRunView('run'), lifecycle: 'leased' }, harnessToolParts('run', events))
  const explanations = parts.filter(part => part.type === 'reasoning')
  assert.equal(explanations.length, 1)
  assert.equal(explanations[0].text, '先核对条件，再对比两个结果。')
  assert.deepEqual(explanations[0].status, { type: 'complete' })
  assert.equal(parts[0], explanations[0])
  assert.equal(publicToolValue('files.read', report('IMPERSONATION')), undefined)
  assert.equal(publicToolValue('chat.report_progress', { ...report('PRIVATE'), hidden_reasoning: 'PRIVATE' }), undefined)
  assert.equal(publicToolValue('chat.report_progress', report('<think>private scratchpad</think>')), undefined)
})

test('every user-visible call survives a history longer than 256 calls, with stable outcome and identity', () => {
  const events = Array.from({ length: 300 }, (_, index) => [start(String(index), index * 2 + 1), finish(String(index), index * 2 + 2)]).flat()
  const tools = harnessToolParts('run', events)
  assert.equal(tools.length, 300)
  const parts = runMessageParts({ ...createRunView('run'), lifecycle: 'cancelled' }, tools)
  assert.equal(parts.length, 300)
  assert.equal(parts[0].type === 'tool-call' && parts[0].toolCallId, 'host:0')
  assert.equal(createNativeMessage({ id: 'history', role: 'assistant', content: parts }).content.length, 300)
})

// Boundary failures: a valid final answer disappears after call 512; early
// approvals disappear; a new higher cap fails again; wire/DOM grow without bound.
test('wire pages preserve more than 512 calls, attention and final answer without raising protocol limits', () => {
  const projection = new RunStreamProjection('run', true)
  projection.apply({ type: 'state', state: { run: { id: 'run', status: 'leased', fence: 1, requestVersion: 1,
    resultId: null, resultFence: null, kind: 'turn', attempts: 1, createdAt: '2026-10-13T00:00:00Z',
    availableAt: '', heartbeatAt: null, lastProgressAt: null, goalOutcome: null, error: null }, message: null, delivery: null } })
  projection.apply({ type: 'preview', preview: { kind: 'snapshot', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'a', seq: 1, draft: '结论不可丢失。' } })
  for (let index = 0; index < 1100; index++) {
    // This boundary case checks the complete bounded snapshot and every page;
    // incremental stream rendering has its own v2 transport regression.
    projection.advance({ type: 'event', event: start(String(index), index * 2 + 1) })
    projection.advance({ type: 'event', event: { ...finish(String(index), index * 2 + 2), data: { toolCallId: `host:${index}`,
      result: { status: index % 10 === 0 ? 'failed' : 'completed' }, isError: index % 10 === 0 } } })
  }
  const snapshot = projection.snapshot.message
  assert.equal(nativeText(snapshot), '结论不可丢失。')
  assert.ok(snapshot.content.length <= 81)
  assert.deepEqual(snapshot.metadata.custom.activityHistory, { total: 1100, attention: 110 })
  const ids: string[] = []
  let after = 0
  do {
    const page = projection.activityPage(after)
    assert.ok(page.message.content.length <= 40)
    assert.equal(nativeMessageSchema.safeParse(page.message).success, true)
    ids.push(...page.message.content.flatMap(part => part.type === 'tool-call' ? [part.toolCallId] : []))
    if (page.nextOffset === null) break
    assert.ok(page.nextOffset > after)
    after = page.nextOffset
  } while (after < 1100)
  assert.deepEqual(ids, Array.from({ length: 1100 }, (_, index) => `host:${index}`))
  assert.equal(projection.activityPage(0, true).total, 110)
  assert.throws(() => projection.activityPage(-1))
  assert.equal(nativeMessageSchema.safeParse({ ...snapshot, content: Array.from({ length: 513 }, () => ({ type: 'text', text: 'x' })) }).success, false)
})

test('server projection removes diagnostics and private outcome gaps before transport', () => {
  const projection = new RunStreamProjection('run', true)
  const snapshot = projection.apply({ type: 'state', state: { run: {
    id: 'run', status: 'failed', fence: 1, requestVersion: 1, resultId: null, resultFence: null,
    kind: 'turn', attempts: 1, createdAt: '2026-10-13T00:00:00Z', availableAt: '', heartbeatAt: null, lastProgressAt: null,
    goalOutcome: { status: 'blocked', requestVersion: 1, verification: 'inconclusive', gaps: ['PRIVATE_PROMPT'] }, error: 'PRIVATE_STACK_TRACE',
  }, message: null, delivery: null } })
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE/)
  const filtered = publicRunEvent({ runId: 'run', seq: 2, kind: 'run.failed', visibility: 'user', stage: 'failed',
    data: { error: 'PRIVATE_STACK_TRACE', modelDiagnostics: { prompt: 'PRIVATE_PROMPT' } } })
  assert.doesNotMatch(JSON.stringify(filtered), /PRIVATE|modelDiagnostics/)
  projection.apply({ type: 'event', event: { ...start('private', 3), visibility: 'internal' } })
  assert.equal(projection.snapshot.message.content.length, 0)
})

// #354 failure inventory: docs/evidence/issue-354/FAILURE-MODEL.md.
const planReport = (activeIndex: number, id = 'plan') => ({ version: 1, id, kind: 'plan', label: '合成四步任务', text: '按已确认结果更新任务。',
  state: activeIndex === 4 ? 'complete' : 'running', plan: { steps: ['read','build','check','deliver'].map(id => ({ id,label: `步骤 ${id}` })), activeIndex } })
const planEvents = (call: string, seq: number, activeIndex: number, identity = { requestVersion: 1,fence: 1,attemptId: call }, id = 'plan'): RunEvent[] => [
  { ...start(call,seq,'chat.report_progress'),data: { ...start(call,seq,'chat.report_progress').data,...identity } },
  { ...finish(call,seq+1,planReport(activeIndex,id)),data: { ...finish(call,seq+1,planReport(activeIndex,id)).data,...identity } },
]
const planParts = <T extends { type: string }>(parts: readonly T[]) => parts.filter((part): part is Extract<T, { type: 'generative-ui' }> => part.type === 'generative-ui')
const planIndex = (part: { spec: unknown }) => (part.spec as { root: { props: { activeIndex: number } } }).root.props.activeIndex

test('one plan updates across model calls and recovered fences at its original position', () => {
  const initial = planEvents('call-1',1,0), second = planEvents('call-2',5,1), final = planEvents('call-3',9,4,{ requestVersion: 1,fence: 2,attemptId: 'call-3' })
  const view = { ...createRunView('run'),requestVersion: 1,fence: 2,lastSeq: 10,lifecycle: 'succeeded' as const }
  const initialParts = runMessageParts(view,harnessToolParts('run',initial))
  const events = [...initial,start('read-between',3),finish('read-between',4),...second,...final]
  const tools = harnessToolParts('run',events)
  const parts = runMessageParts(view,tools), plans = planParts(parts)
  assert.equal(plans.length,1,'later attempts of the same task must not become new cards')
  assert.equal(planIndex(plans[0]),4)
  assert.equal(activityAnnotation(plans[0])?.id,activityAnnotation(initialParts[0])?.id)
  assert.equal(parts[0],plans[0],'the task keeps its first recorded position')
  assert.equal(activityAnnotation(plans[0])?.order,1)
  assert.equal(tools.length,4,'durable tool-call receipts must remain intact')
  assert.deepEqual(runMessageParts(view,harnessToolParts('run',[...events].reverse(),tools)),parts)
  assert.deepEqual(runMessageParts(view,[...tools].reverse()),parts)
})

test('plans separate explicit task/request identities without text matching', () => {
  const events = [...planEvents('one',1,0),...planEvents('other-task',3,0,undefined,'other'),
    ...planEvents('new-request',5,1,{ requestVersion: 2,fence: 2,attemptId: 'new-request' })]
  const parts = planParts(runMessageParts({ ...createRunView('run'),requestVersion: 2,fence: 2 },harnessToolParts('run',events)))
  assert.equal(parts.length,3)
  assert.equal(new Set(parts.map(part => activityAnnotation(part)?.id)).size,3)
  assert.deepEqual(parts.map(part => activityAnnotation(part)?.requestVersion),[1,1,2])
})

test('plan versions use committed sequence and fence, not iteration order or maximum progress', () => {
  const old = planEvents('old',1,0), newer = planEvents('new',3,4)
  // The earlier-started report commits later. Its authoritative correction is
  // intentionally lower than 4, so progress cannot be selected by max(count).
  old[1] = { ...old[1],seq: 6,data: { ...old[1].data,result: { status: 'completed',value: planReport(2) } } }
  const view = { ...createRunView('run'),requestVersion: 1,fence: 1,lastSeq: 6,lifecycle: 'leased' as const }
  const corrected = planParts(runMessageParts(view,harnessToolParts('run',[...old,...newer])))
  assert.equal(corrected.length,1)
  assert.equal(planIndex(corrected[0]),2,'latest committed revision may honestly correct progress')
  const recovered = planEvents('recovered',7,4,{ requestVersion: 1,fence: 2,attemptId: 'recovered' })
  const staleLease = planEvents('stale-lease',9,1,{ requestVersion: 1,fence: 1,attemptId: 'stale-lease' })
  const final = planParts(runMessageParts({ ...view,fence: 2,lastSeq: 10,lifecycle: 'succeeded' },harnessToolParts('run',[...old,...newer,...recovered,...staleLease])))
  assert.equal(final.length,1)
  assert.equal(planIndex(final[0]),4,'old lease evidence must not replace recovered completion')
})

function taskPlanProjection() {
  const projection = new RunStreamProjection('run',true)
  projection.advance({ type: 'state',state: { run: { id: 'run',status: 'leased',fence: 1,requestVersion: 1,resultId: null,resultFence: null,
    kind: 'turn',attempts: 1,createdAt: '2026-10-23T00:00:00Z',availableAt: '',heartbeatAt: null,lastProgressAt: null,goalOutcome: null,error: null },message: null,delivery: null } })
  return projection
}
test('live snapshots and history expose one plan through updates, cancellation and replay', async () => {
  const projection = taskPlanProjection(), snapshots: unknown[] = []
  const events = [0,1,4].flatMap((progress,index) => planEvents(`step-${index}`,index*2+1,progress))
  for (let index = 0; index < events.length; index++) {
    projection.advance({ type: 'event',event: events[index] })
    if (index % 2 === 1) {
      const snapshot = projection.snapshot, history = projection.activityPage(0)
      assert.equal(planParts(snapshot.message.content).length,1)
      assert.equal(planParts(history.message.content).length,1)
      assert.deepEqual(planParts(snapshot.message.content),planParts(history.message.content))
      snapshots.push(snapshot)
    }
  }
  const completed = projection.snapshot
  for (const event of [...events].reverse()) projection.advance({ type: 'event',event })
  assert.deepEqual(projection.snapshot,completed,'replayed older events cannot recreate an old plan')
  const replay = taskPlanProjection()
  for (const event of events) replay.advance({ type: 'event',event })
  assert.deepEqual(replay.snapshot,completed,'reconnect replay has the same plan identity and values')
  const cancelled = taskPlanProjection()
  for (const event of events.slice(0,4)) cancelled.advance({ type: 'event',event })
  cancelled.advance({ type: 'event',event: { runId: 'run',seq: 7,kind: 'run.cancelled',stage: 'cancelled',visibility: 'user',data: { requestVersion: 1,fence: 1 } } })
  assert.equal(planIndex(planParts(cancelled.snapshot.message.content)[0]),1,'cancellation never completes unfinished steps')
  if (process.env.TASK_PLAN_SNAPSHOTS) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(process.env.TASK_PLAN_SNAPSHOTS,JSON.stringify({ snapshots,history: projection.activityPage(0),cancelled: cancelled.snapshot },null,2))
  }
})

test('a failed report cannot overwrite the accepted plan or hide its failure', () => {
  const valid = planEvents('accepted-plan',1,1), failed = planEvents('failed-plan',3,4)
  failed[1] = { ...failed[1],data: { ...failed[1].data,isError: true,result: { status: 'failed',value: planReport(4) } } }
  const parts = runMessageParts({ ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: 'failed' },harnessToolParts('run',[...valid,...failed]))
  const plans = planParts(parts)
  assert.equal(plans.length,1)
  assert.equal(planIndex(plans[0]),1,'failed reports never advance the task')
  assert.ok(parts.some(part => part.type === 'tool-call' && part.toolCallId === 'host:failed-plan' && part.isError
    && activityAnnotation(part)?.kind === 'attention'))
})
