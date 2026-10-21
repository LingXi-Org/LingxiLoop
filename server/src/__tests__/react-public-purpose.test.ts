import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFileSync } from 'node:fs'
import type { RunEvent, RunState } from '@lyyzka/lingxios/ui'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'

const state = (status: RunState['run']['status'] = 'leased'): RunState => ({
  run: { id: 'run',status,fence: 1,requestVersion: 1,resultId: null,resultFence: null,kind: 'turn',attempts: 1,
    createdAt: '2026-10-21T00:00:00Z',availableAt: '',heartbeatAt: null,lastProgressAt: null,goalOutcome: null,error: null },
  message: null,delivery: null,
})
const identity = (attemptId: string) => ({ version: 1,requestVersion: 1,fence: 1,attemptId,partId: `part-${attemptId}`,partIndex: 0 })
const delta = (attempt: string, seq: number, text: string): RunEvent => ({ runId: 'run',seq,kind: 'public.text.delta',visibility: 'user',stage: 'delta',data: { ...identity(attempt),chunkIndex: 0,text } })
const end = (attempt: string, seq: number, reason: string): RunEvent => ({ runId: 'run',seq,kind: 'public.text.ended',visibility: 'user',stage: 'completed',data: { ...identity(attempt),chunkCount: 1,reason } })
function project(events: RunEvent[], initial = state()) {
  const projection = new RunStreamProjection('run',false)
  projection.apply({ type: 'state',state: initial })
  for (const event of events) projection.apply({ type: 'event',event })
  return projection
}
const texts = (projection: RunStreamProjection, kind: 'answer' | 'commentary') => projection.snapshot.message.content.flatMap(part =>
  part.type === 'text' && activityAnnotation(part)?.kind === kind ? [part.text] : [])
const browserSnapshots: Record<string, RunStreamProjection['snapshot']> = {}
after(() => {
  if (process.env.ISSUE275_SNAPSHOTS) writeFileSync(process.env.ISSUE275_SNAPSHOTS,JSON.stringify(browserSnapshots,null,2)+'\n')
})

test('unresolved public content streams as an answer candidate without classifying its words', () => {
  const text = '首先检查这个等式：1 + 1 = 2。Next, verify the result.'
  const projection = project([delta('answer',1,text)])
  assert.deepEqual(texts(projection,'answer'),[text])
  assert.equal(nativeText(projection.snapshot.message),text)
  assert.equal(projection.snapshot.message.status?.type,'running')
})

test('tool purpose moves only its own prefix into activity while the next answer still streams', () => {
  const events = [delta('before',1,'Identical public text.'),end('before',2,'tool'),delta('answer',3,'Identical public text.')]
  const projection = project(events)
  assert.deepEqual(texts(projection,'commentary'),['Identical public text.'])
  assert.deepEqual(texts(projection,'answer'),['Identical public text.'])
  assert.deepEqual(project(events.concat(events)).snapshot,projection.snapshot,'duplicate event replay remains idempotent')
})

test('same-attempt tool identity establishes commentary even before the ended event arrives', () => {
  const projection = project([delta('tool',1,'Public tool preamble.'),{
    runId: 'run',seq: 2,kind: 'tool.started',visibility: 'user',stage: 'started',
    data: { ...identity('tool'),toolCallId: 'host:read',name: 'documents.read' },
  },delta('answer',3,'Substantive answer.')])
  assert.deepEqual(texts(projection,'commentary'),['Public tool preamble.'])
  assert.deepEqual(texts(projection,'answer'),['Substantive answer.'])
  browserSnapshots.running = projection.snapshot
})

for (const status of ['failed','cancelled'] as const) test(`${status} keeps the current partial answer and replays its terminal status`, () => {
  const events = [delta('before',1,'Public process.'),end('before',2,'tool'),delta('answer',3,'Partial useful answer.'),end('answer',4,status)]
  const projection = project(events)
  projection.apply({ type: 'state',state: state(status) })
  assert.deepEqual(texts(projection,'answer'),['Partial useful answer.'])
  assert.deepEqual(texts(projection,'commentary'),['Public process.'])
  assert.deepEqual(project(events,state(status)).snapshot,projection.snapshot)
  assert.equal(projection.snapshot.message.status?.type,'incomplete')
  browserSnapshots[status] = projection.snapshot
})

test('accepted source is replaced once; old process before and after it stays outside final answer text', () => {
  const body = 'Verified final answer.'
  const events = [delta('before',1,'First public process.'),end('before',2,'tool'),
    delta('answer',3,body),end('answer',4,'completed'),delta('after',5,'Later public process.'),end('after',6,'tool')]
  const completed = state('succeeded')
  const goalOutcome = { status: 'satisfied' as const,verification: 'passed' as const,requestVersion: 1 }
  completed.run = { ...completed.run,resultId: 'result',resultFence: 1,goalOutcome }
  completed.message = { version: 2,runId: 'run',agentId: 'agent',sessionId: 'session',publicTextPartId: 'part-answer',body,
    envelope: { version: 1,requestVersion: 1,body,evidenceSnapshotId: 'evidence',goalOutcome,citations: [],artifacts: [] } }
  completed.delivery = 'delivered'
  const projection = project(events)
  projection.apply({ type: 'state',state: completed })
  assert.deepEqual(texts(projection,'answer'),[body])
  assert.deepEqual(texts(projection,'commentary'),['First public process.','Later public process.'])
  assert.equal(nativeText(projection.snapshot.message),body)
  assert.deepEqual(project(events,completed).snapshot,projection.snapshot)
  browserSnapshots.completed = projection.snapshot
})
