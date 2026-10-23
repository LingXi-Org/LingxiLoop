import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RunEvent, RunState } from '@lyyzka/lingxios/ui'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation, isAnswerRevision } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'

// Failure model: docs/evidence/issue-341/projection-failure-model.md (written first).
const state = (status: RunState['run']['status'] = 'leased'): RunState => ({
  run: { id: 'run', status, fence: 1, requestVersion: 1, resultId: null, resultFence: null,
    kind: 'turn', attempts: 1, createdAt: '2026-10-23T00:00:00Z', availableAt: '', heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: null }, message: null, delivery: null,
})
const source = (partId: string, purpose: 'answer' | 'commentary' = 'answer') => ({ version: 2, requestVersion: 1, fence: 1,
  attemptId: partId, partId, partIndex: 0, purpose })
const event = (seq: number, kind: string, data: RunEvent['data']): RunEvent => ({ runId: 'run', seq, kind,
  stage: kind.endsWith('delta') ? 'delta' : kind.endsWith('started') ? 'started' : 'completed', visibility: 'user', data })
const revision = isAnswerRevision
const answer = (projection: RunStreamProjection) => projection.snapshot.message.content.filter(part => activityAnnotation(part)?.kind === 'answer')
function scenario() {
  const projection = new RunStreamProjection('run', true)
  projection.advance({ type: 'state', state: state() })
  const events: RunEvent[] = []
  const push = (seq: number, kind: string, data: RunEvent['data']) => {
    const item = event(seq, kind, data); events.push(item); projection.advance({ type: 'event', event: item })
  }
  const text = '合成答复：交换机转发网络帧。'
  push(1, 'public.text.delta', { ...source('first'), chunkIndex: 0, text })
  const first = projection.snapshot
  push(2, 'public.text.ended', { ...source('first'), chunkCount: 1, reason: 'superseded' })
  push(3, 'public.text.delta', { ...source('real-progress', 'commentary'), chunkIndex: 0, text: '正在核对公开资料。' })
  push(4, 'public.text.ended', { ...source('real-progress', 'commentary'), chunkCount: 1, reason: 'tool' })
  push(5, 'tool.started', { requestVersion: 1, fence: 1, attemptId: 'real-progress', toolCallId: 'host:failed', name: 'chat.report_progress' })
  push(6, 'tool.completed', { toolCallId: 'host:failed', result: { status: 'failed' }, isError: true })
  push(7, 'public.text.delta', { ...source('replacement'), chunkIndex: 0, text })
  const replaced = projection.snapshot
  push(8, 'public.text.ended', { ...source('replacement'), chunkCount: 1, reason: 'completed' })
  push(9, 'response.committed', { requestVersion: 1, resultId: 'accepted', publicTextPartId: 'replacement' })
  const pending = projection.snapshot
  const goalOutcome = { status: 'partial' as const, verification: 'inconclusive' as const, requestVersion: 1 }
  projection.committed({ version: 2, runId: 'run', agentId: 'agent', sessionId: 'session', body: text, publicTextPartId: 'replacement',
    envelope: { version: 1, requestVersion: 1, body: text, evidenceSnapshotId: 'synthetic', citations: [], artifacts: [], goalOutcome } },
  { resultId: 'accepted', fence: 1 })
  const committed = projection.snapshot, page = projection.activityPage(0)
  for (const item of events) projection.advance({ type: 'event', event: item })
  return { projection, events, text, frames: { first, replaced, pending, committed, replay: projection.snapshot }, page }
}

test('replaced answer drafts have an explicit transcript identity; acceptance retains the current answer until commit', () => {
  const { projection, text, frames, page } = scenario()
  for (const frame of Object.values(frames)) {
    assert.equal(frame.message.content.filter(part => activityAnnotation(part)?.kind === 'answer').length, 1)
    assert.equal(nativeText(frame.message), text, 'copy answer excludes old drafts')
  }
  const revisions = frames.replaced.message.content.filter(part => revision(part))
  assert.equal(revisions.length, 1)
  assert.equal(activityAnnotation(revisions[0])?.id, activityAnnotation(frames.first.message.content[0])?.id, 'supersession preserves the source identity for history reconciliation')
  assert.equal(revisions[0].type === 'text' && revisions[0].text, text)
  assert.equal(activityAnnotation(revisions[0])?.label, '已替换的答复草稿')
  assert.equal(frames.replaced.message.content.filter(part => activityAnnotation(part)?.kind === 'commentary' && !revision(part)).length, 1)
  assert.equal(page.message.content.filter(part => revision(part)).length, 2)
  assert.equal(page.message.content.filter(part => part.type === 'tool-call' && part.isError).length, 1)
  assert.equal(new Set(page.message.content.map(part => activityAnnotation(part)?.id)).size, page.message.content.length)
  assert.deepEqual(frames.replay.message.content, frames.committed.message.content)
  assert.equal(answer(projection).length, 1)
  if (process.env.ISSUE341_SNAPSHOTS) {
    mkdirSync(dirname(process.env.ISSUE341_SNAPSHOTS), { recursive: true })
    writeFileSync(process.env.ISSUE341_SNAPSHOTS, JSON.stringify({ ...frames, page }, null, 2))
  }
})

test('failure and cancellation retain the latest partial answer and factual status', () => {
  for (const reason of ['failed', 'cancelled'] as const) {
    const projection = new RunStreamProjection('run', true)
    projection.advance({ type: 'state', state: state() })
    projection.advance({ type: 'event', event: event(1, 'public.text.delta', { ...source('partial'), chunkIndex: 0, text: '已确认的部分。' }) })
    projection.advance({ type: 'event', event: event(2, 'public.text.ended', { ...source('partial'), chunkCount: 1, reason }) })
    projection.advance({ type: 'state', state: state(reason) })
    assert.equal(answer(projection).length, 1)
    assert.equal(nativeText(projection.snapshot.message), '已确认的部分。')
    assert.deepEqual(projection.snapshot.message.status, { type: 'incomplete', reason: reason === 'failed' ? 'error' : 'cancelled' })
  }
})
