import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, type RunEvent } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { publicRunEvent, publicToolValue } from '../agent-runtime/public-events.js'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { createNativeMessage, deserializeMessage } from '../../../src/lib/nativeMessage.js'
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

test('public activity is explicit, stable, ordered before the authoritative answer and replayable', () => {
  const events = [start('read', 1), finish('read', 2), start('explain', 3, 'chat.report_progress'), finish('explain', 4, report('依据已读资料核对条件。'))]
  const tools = harnessToolParts('run', events)
  const view = { ...createRunView('run'), lifecycle: 'leased' as const, draft: '最终答案的流式预览' }
  const parts = runMessageParts(view, tools)
  assert.deepEqual(parts.map(part => part.type), ['tool-call', 'reasoning', 'text'])
  assert.equal(activityAnnotation(parts[0])?.kind, 'tool')
  assert.equal(activityAnnotation(parts[1])?.kind, 'commentary')
  assert.equal(activityAnnotation(parts[2])?.kind, 'answer')
  assert.equal(parts[1].type === 'reasoning' && parts[1].text, '依据已读资料核对条件。')
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
