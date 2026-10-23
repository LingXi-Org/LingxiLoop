import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, type RunEvent, type RunState } from '@lyyzka/lingxios/ui'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation, isAnswerRevision } from '../../../src/lib/runActivity.js'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'

// Failure inventory written first: docs/evidence/issue-304/CONTRACT-FAILURE-MODEL.md.
const state = (status: RunState['run']['status'] = 'leased', requestVersion = 1): RunState => ({
  run: { id: 'run', status, fence: 1, requestVersion, resultId: null, resultFence: null,
    kind: 'turn', attempts: 1, createdAt: '2026-10-22T00:00:00Z', availableAt: '', heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: null }, message: null, delivery: null,
})
const event = (seq: number, kind: string, data: RunEvent['data']): RunEvent => ({
  runId: 'run', seq, kind, stage: kind.endsWith('delta') ? 'delta' : kind.endsWith('started') ? 'started' : 'completed', visibility: 'user', data,
})
const source = (partId: string, purpose: 'commentary' | 'answer', attemptId = partId) => ({
  version: 2, requestVersion: 1, fence: 1, attemptId, partId, partIndex: 0, purpose,
})
const answer = (projection: RunStreamProjection) => projection.snapshot.message.content.filter(part => activityAnnotation(part)?.kind === 'answer')

export function v2AnswerFirstProjection() {
  const projection = new RunStreamProjection('run', true)
  projection.advance({ type: 'state', state: state() })
  const events: RunEvent[] = []
  const push = (value: RunEvent) => { events.push(value); projection.advance({ type: 'event', event: value }) }
  push(event(1, 'public.text.delta', { ...source('before', 'commentary'), chunkIndex: 0, text: '先查看公开资料。' }))
  push(event(2, 'public.text.ended', { ...source('before', 'commentary'), chunkCount: 1, reason: 'tool' }))
  push(event(3, 'tool.started', { requestVersion: 1, fence: 1, attemptId: 'before', toolCallId: 'host:lookup', name: 'files.list' }))
  push(event(4, 'tool.completed', { toolCallId: 'host:lookup', result: { status: 'completed' } }))
  push(event(5, 'public.text.delta', { ...source('after', 'commentary'), chunkIndex: 0, text: '资料已查看。' }))
  push(event(6, 'public.text.ended', { ...source('after', 'commentary'), chunkCount: 1, reason: 'completed' }))
  push(event(7, 'public.text.delta', { ...source('answer-source', 'answer'), chunkIndex: 0, text: '交' }))
  const firstAnswer = projection.snapshot
  push(event(8, 'public.text.delta', { ...source('answer-source', 'answer'), chunkIndex: 1, text: '换机按处理的网络层区分。' }))
  const liveAnswer = projection.snapshot
  push(event(9, 'public.text.ended', { ...source('answer-source', 'answer'), chunkCount: 2, reason: 'completed' }))
  push(event(10, 'response.committed', { requestVersion: 1, resultId: 'accepted-result', publicTextPartId: 'answer-source' }))
  const acceptedPending = projection.snapshot
  const goalOutcome = { status: 'satisfied' as const, verification: 'passed' as const, requestVersion: 1 }
  const body = '交换机按处理的网络层区分。'
  projection.committed({ version: 2, runId: 'run', agentId: 'agent', sessionId: 'session', body, publicTextPartId: 'answer-source',
    envelope: { version: 1, requestVersion: 1, body, evidenceSnapshotId: 'evidence', citations: [], artifacts: [], goalOutcome } },
  { resultId: 'accepted-result', fence: 1 })
  const accepted = projection.snapshot
  return { projection, events, snapshots: { firstAnswer, liveAnswer, acceptedPending, accepted } }
}

test('v2 accepted source keeps the same answer identity through the commit-read gap and native handoff', () => {
  const { projection, snapshots } = v2AnswerFirstProjection()
  const projected = Object.values(snapshots).map(snapshot => snapshot.message.content.filter(part => activityAnnotation(part)?.kind === 'answer'))
  assert.ok(projected.every(parts => parts.length === 1), 'one current answer is retained in every handoff stage')
  const id = activityAnnotation(projected[0][0])?.id
  assert.ok(id)
  assert.ok(projected.every(parts => activityAnnotation(parts[0])?.id === id), 'explicit accepted source retains display identity')
  assert.equal(answer(projection).length, 1)
  const archive = projection.activityPage(0).message.content.filter(part => part.type === 'text' && part.text === '交换机按处理的网络层区分。')
  assert.equal(archive.length, 1)
  assert.equal(activityAnnotation(archive[0])?.kind, 'commentary')
  assert.ok(activityAnnotation(archive[0])?.id.startsWith('archive:public-text:'))
  assert.notEqual(activityAnnotation(archive[0])?.id, id, 'accepted prefix history is distinct from the current answer')
})

test('superseded candidates and new requests reset the answer identity without reviving the old committed answer', () => {
  const { projection, events, snapshots } = v2AnswerFirstProjection()
  const repaired = new RunStreamProjection('run', true)
  repaired.advance({ type: 'state',state: state() })
  for (const item of events.filter(item => item.seq <= 8)) repaired.advance({ type: 'event',event: item })
  repaired.advance({ type: 'event',event: event(9,'public.text.ended',{ ...source('answer-source','answer'),chunkCount: 2,reason: 'superseded' }) })
  repaired.advance({ type: 'event',event: event(10,'public.text.delta',{ ...source('corrected','answer'),chunkIndex: 0,text: '二层交换机转发以太网帧。' }) })
  const correction = repaired.snapshot
  assert.equal(answer(repaired).length, 1)
  assert.notEqual(activityAnnotation(answer(repaired)[0])?.id, activityAnnotation(answer(projection)[0])?.id)
  assert.equal(correction.message.content.filter(part => isAnswerRevision(part) && part.type === 'text' && part.text === '交换机按处理的网络层区分。').length, 1)
  const next = state('leased', 2); next.run.fence = 2
  projection.advance({ type: 'state',state: next })
  projection.advance({ type: 'event',event: event(100001,'public.text.delta',{ ...source('new-request','answer'),requestVersion: 2,fence: 2,chunkIndex: 0,text: '新的问题答复。' }) })
  const newRequest = projection.snapshot
  assert.equal(answer(projection).length, 1)
  const currentAnswer = answer(projection)[0]
  assert.equal(currentAnswer.type === 'text' && currentAnswer.text, '新的问题答复。')
  if (process.env.ISSUE304_SNAPSHOTS) {
    mkdirSync(dirname(process.env.ISSUE304_SNAPSHOTS), { recursive: true })
    writeFileSync(process.env.ISSUE304_SNAPSHOTS, JSON.stringify({ ...snapshots,correction,newRequest,events }, null, 2))
  }
})

test('validated homework locators remain results while resolved approvals become process receipts', () => {
  const view = { ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: 'succeeded' as const,
    goalOutcome: { status: 'satisfied' as const,requestVersion: 1,verification: 'passed' as const } }
  const tools = harnessToolParts('run', [event(1,'tool.started',{ toolCallId: 'host:homework',name: 'teacher.draft_homework' }),
    event(2,'tool.completed',{ toolCallId: 'host:homework',result: { status: 'completed',value: { result: { homeworkId: 'draft',courseId: 'course',revision: 1 } } } })])
  const result = runMessageParts(view,tools)[0]
  assert.equal(activityAnnotation(result)?.kind, 'result')
  assert.equal(activityAnnotation(result)?.purpose, 'result')
  const receipt = runMessageParts(view,[{ type: 'tool-call',toolCallId: 'host:approved',toolName: 'files.read',args: {},argsText: '',
    approval: { id: 'approval',approved: true },result: { status: 'completed' },purpose: 'process' }])[0]
  assert.equal(activityAnnotation(receipt)?.kind, 'tool')
})

test('activity annotations retain original event order and changing watermarks for replay merges', () => {
  const { projection } = v2AnswerFirstProjection()
  const page = projection.activityPage(0)
  const tool = page.message.content.find(part => part.type === 'tool-call')
  assert.ok(tool)
  const annotation = activityAnnotation(tool) as { order?: number; revision?: number; requestVersion?: number } | undefined
  assert.equal(annotation?.order, 3)
  assert.ok(annotation?.revision && annotation.revision >= 4)
  assert.equal(annotation?.requestVersion, 1)
  const harness = page.message.metadata.custom.harness as { lastSeq: number; requestVersion: number; fence: number }
  assert.equal(page.message.id, 'run-run')
  assert.equal(harness.lastSeq, 10)
  assert.equal(harness.requestVersion, 1)
  assert.equal(harness.fence, 1)
})

test('a newer execution fence cannot reuse an older accepted answer identity or suppress the current v2 answer', () => {
  for (const mode of ['public', 'preview'] as const) {
    const { projection } = v2AnswerFirstProjection()
    const previousId = activityAnnotation(answer(projection)[0])?.id
    const next = state(); next.run.fence = 2
    projection.advance({ type: 'state',state: next })
    if (mode === 'public') projection.advance({ type: 'event',event: event(100001,'public.text.delta',{
      ...source('next-execution','answer'),fence: 2,chunkIndex: 0,text: '新的执行答复。',
    }) })
    else projection.advance({ type: 'preview',preview: { kind: 'snapshot',runId: 'run',fence: 2,requestVersion: 1,
      attemptId: 'next-execution',seq: 1,draft: '新的执行答复。' } })
    const parts = answer(projection)
    assert.equal(parts.length, 1)
    assert.notEqual(activityAnnotation(parts[0])?.id, previousId)
  }
})

test('unknown side effects remain current attention in a bounded satisfied run', () => {
  const projection = new RunStreamProjection('run', true)
  projection.advance({ type: 'state', state: state() })
  for (let index = 0; index < 90; index++) {
    projection.advance({ type: 'event', event: event(index * 2 + 1, 'tool.started', { toolCallId: `host:${index}`,name: 'files.read' }) })
    projection.advance({ type: 'event', event: event(index * 2 + 2, 'tool.completed', { toolCallId: `host:${index}`,result: { status: index === 0 ? 'unknown' : 'completed' } }) })
  }
  const body = '已经完成已确认的部分。', goalOutcome = { status: 'satisfied' as const,requestVersion: 1,verification: 'passed' as const }
  projection.committed({ version: 2,runId: 'run',agentId: 'agent',sessionId: 'session',body,
    envelope: { version: 1,requestVersion: 1,body,goalOutcome,evidenceSnapshotId: 'evidence',citations: [],artifacts: [] } }, { resultId: 'result',fence: 1 })
  const uncertain = projection.snapshot.message.content.find(part => part.type === 'tool-call' && part.toolCallId === 'host:0')
  assert.ok(uncertain, 'bounded snapshot retains the unresolved effect without loading a history page')
  assert.equal(activityAnnotation(uncertain)?.kind, 'attention')
})

test('rehydrating old rich tool events does not invent a display purpose', () => {
  const projection = new RunStreamProjection('run', true)
  projection.advance({ type: 'state', state: state() })
  for (const [index, name] of ['research.search', 'memory.read'].entries()) {
    projection.advance({ type: 'event', event: event(index * 2 + 1, 'tool.started', { toolCallId: `host:legacy-${index}`,name }) })
    const value = name === 'research.search' ? { results: [] }
      : { document: { id: 'memory',title: '公开记忆',description: '公开摘要',version: 1,status: 'active' } }
    projection.advance({ type: 'event', event: event(index * 2 + 2, 'tool.completed', { toolCallId: `host:legacy-${index}`,result: { status: 'completed',value } }) })
  }
  for (const part of projection.snapshot.message.content) assert.equal(activityAnnotation(part)?.purpose, undefined)
})

test('committed citation data stays valid on the strict wire and different source versions remain distinct', () => {
  const projection = new RunStreamProjection('run', true)
  projection.advance({ type: 'state',state: state() })
  const body = '甲乙丙', goalOutcome = { status: 'satisfied' as const,requestVersion: 1,verification: 'passed' as const }
  const citations = [...body].map((text, index) => ({ start: index,end: index + 1,text,markers: [`S${index}`],support: 'not_assessed' as const,
    sources: [{ sourceId: 'document',sourceVersion: index === 1 ? 'v2' : 'v1',chunkIds: [`chunk-${index}`] }] }))
  const snapshot = projection.committed({ version: 2,runId: 'run',agentId: 'agent',sessionId: 'session',body,
    envelope: { version: 1,requestVersion: 1,body,goalOutcome,evidenceSnapshotId: 'evidence',citations,artifacts: [] } }, { resultId: 'result',fence: 1 })
  const claims = snapshot.message.content.find(part => part.type === 'data' && part.name === 'citation-claims')
  assert.ok(claims)
  assert.equal('providerMetadata' in claims, false, 'data parts retain the existing strict wire shape')
  const sources = snapshot.message.content.filter(part => part.type === 'source')
  assert.equal(sources.length, 2)
  assert.notEqual(sources[0].id, sources[1].id)
  assert.deepEqual(sources[0].providerMetadata?.lingxiloop?.chunkIds, ['chunk-0', 'chunk-2'])
  assert.deepEqual(sources.map(part => part.providerMetadata?.lingxiloop?.sourceVersion), ['v1', 'v2'])
})
