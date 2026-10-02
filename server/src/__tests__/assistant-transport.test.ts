import assert from 'node:assert/strict'
import test from 'node:test'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { RunStreamProjection, assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'

// Failure cases: split UTF-8 frames; stale/duplicate drafts; gaps and retractions;
// leaked tool payloads; lost cancellation, approvals, citations or replayed memory;
// a protocol wrapper that still sends native events or repeats full growing text.
export function runState(status: RunState['run']['status'] = 'leased'): RunState {
  const goalOutcome = { status: 'satisfied' as const, verification: 'passed' as const, requestVersion: 1 }
  const body = '最终正文'
  return {
    run: { id: 'run', status, fence: 1, requestVersion: 1, resultId: status === 'succeeded' ? 'result' : null,
      resultFence: status === 'succeeded' ? 1 : null, kind: 'turn', attempts: 1, createdAt: '2026-10-02T00:00:00Z',
      availableAt: '', heartbeatAt: null, lastProgressAt: null, goalOutcome: status === 'succeeded' ? goalOutcome : null, error: null },
    message: status === 'succeeded' ? { version: 2, runId: 'run', agentId: 'agent', sessionId: 'session', body,
      envelope: { version: 1, requestVersion: 1, body, evidenceSnapshotId: 'evidence', goalOutcome, citations: [], artifacts: [] } } : null,
    delivery: status === 'succeeded' ? 'delivered' : null,
  }
}
const draft = (text: string): RunStreamEvent => ({ type: 'preview', preview: {
  kind: 'snapshot', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', seq: 1, draft: text,
} })
function nativeBody(events: RunStreamEvent[]) {
  const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3))
    controller.close()
  } })
}
test('native state operations stream text once, retract it, and end with canonical content', async () => {
  const delta: RunStreamEvent = { type: 'preview', preview: { kind: 'delta', runId: 'run', fence: 1,
    requestVersion: 1, attemptId: 'attempt', fromSeq: 1, seq: 2, delta: '\n\n第二段😀' } }
  const response = assistantRunResponse(nativeBody([
    { type: 'state', state: runState() }, draft('第一段'), delta, delta,
    { type: 'reset', runId: 'run', reason: 'superseded' },
    { type: 'state', state: runState('succeeded') }, draft('过期正文'),
  ]), new RunStreamProjection('run', true))
  assert.match(response.headers.get('content-type')!, /^text\/event-stream/)
  const bytes = await response.text()
  assert.match(bytes, /"append-text"/)
  assert.match(bytes, /data: \[DONE\]/)
  assert.doesNotMatch(bytes, /event: preview|"type":"preview"|"type":"state"|过期正文/)
  const tracker = new AssistantTransportDeltaTracker()
  const states: AgentRunSnapshot[] = []
  for await (const chunk of AssistantStream.fromResponse(new Response(bytes), new AssistantTransportDecoder())) {
    assert.equal(chunk.type, 'update-state')
    if (chunk.type !== 'update-state') continue
    tracker.append(chunk.operations)
    states.push(tracker.state as unknown as AgentRunSnapshot)
  }
  assert.ok(states.some(state => state.content[0]?.type === 'text' && state.content[0].text === '第一段\n\n第二段😀'))
  assert.ok(states.some((state, index) => index > 1 && !state.content.length))
  assert.deepEqual(states.at(-1)!.content, [{ type: 'text', text: '最终正文' }])
  assert.equal(states.at(-1)!.status.type, 'complete')
  assert.ok(states.every(state => state.view.draft === '' && !state.view.preview))
})

test('projection owns gaps, cancellation, failures, approvals and filtered tool/memory replay', () => {
  for (const status of ['cancelled', 'failed'] as const) {
    const projection = new RunStreamProjection('run', true)
    projection.apply({ type: 'state', state: runState() })
    projection.apply(draft('未提交正文'))
    const stopped = projection.apply({ type: 'state', state: runState(status) })
    assert.deepEqual(stopped.content, [])
    assert.deepEqual(stopped.status, { type: 'incomplete', reason: status === 'failed' ? 'error' : 'cancelled' })
  }
  const projection = new RunStreamProjection('run', false)
  projection.apply({ type: 'state', state: runState() })
  projection.apply(draft('正文'))
  projection.apply({ type: 'event', event: { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started', visibility: 'user',
    data: { toolCallId: 'host:memory', name: 'memory.apply', arguments: 'PRIVATE' } } })
  const memory = projection.apply({ type: 'event', event: { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed', visibility: 'user',
    data: { toolCallId: 'host:memory', result: { status: 'completed', value: {
      documents: [{ id: 'm', description: '喜欢中文', status: 'active', body: 'PRIVATE' }], deleted: [],
    } } } } })
  assert.deepEqual(memory.memory?.chips, [{ id: 'm', text: '喜欢中文' }])
  assert.doesNotMatch(JSON.stringify(memory), /PRIVATE|arguments/)
  const waiting = runState('waiting')
  waiting.run.goalOutcome = { status: 'awaiting_approval', requestVersion: 1, verification: 'not_run', approvalId: 'approval' }
  const result = projection.apply({ type: 'state', state: waiting })
  assert.deepEqual(result.status, { type: 'requires-action', reason: 'tool-calls' })
  assert.equal(result.canControl, false)
  assert.equal(result.view.goalOutcome?.status, 'awaiting_approval')
})

test('truncated native frames and old browser wire format fail instead of falling back', async () => {
  const response = assistantRunResponse(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {')); controller.close()
  } }), new RunStreamProjection('run', true))
  await assert.rejects(response.text(), /inside a frame/)
  await assert.rejects(async () => {
    for await (const _ of AssistantStream.fromResponse(new Response('event: preview\ndata: {}\n\n'), new AssistantTransportDecoder())) { /* consume */ }
  }, /Unknown SSE event type/)
})
