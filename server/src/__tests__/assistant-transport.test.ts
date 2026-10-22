import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { RunStreamProjection, assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'

// Failure cases: split UTF-8 frames; stale/duplicate drafts; gaps and retractions;
// leaked memory names/summaries/payloads; lost cancellation, approvals or citations;
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
  assert.ok(states.some(state => state.message.content[0]?.type === 'text' && state.message.content[0].text === '第一段\n\n第二段😀'))
  assert.ok(states.some((state, index) => index > 1 && state.message.content.length === 0))
  assert.deepEqual(states.at(-1)!.message.content, [{ type: 'text', text: '最终正文', providerMetadata: {
    lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } },
  } }])
  assert.equal(states.at(-1)!.message.status?.type, 'complete')
  assert.ok(states.every(state => !('draft' in (state.message.metadata.custom.harness as object)) && !('message' in (state.message.metadata.custom.harness as object))))
})

test('projection owns gaps, cancellation, failures, approvals and filtered tool/memory replay', () => {
  for (const status of ['cancelled', 'failed'] as const) {
    const projection = new RunStreamProjection('run', true)
    projection.apply({ type: 'state', state: runState() })
    projection.apply(draft('未提交正文'))
    const stopped = projection.apply({ type: 'state', state: runState(status) })
    assert.deepEqual(stopped.message.content, [])
    assert.deepEqual(stopped.message.status, { type: 'incomplete', reason: status === 'failed' ? 'error' : 'cancelled' })
  }
  const projection = new RunStreamProjection('run', false)
  projection.apply({ type: 'state', state: runState() })
  projection.apply(draft('正文'))
  projection.apply({ type: 'event', event: { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started', visibility: 'user',
    data: { toolCallId: 'host:memory', name: 'memory.apply', arguments: 'PRIVATE' } } })
  const memory = projection.apply({ type: 'event', event: { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed', visibility: 'user',
    data: { toolCallId: 'host:memory', result: { status: 'completed', value: {
      documents: [{ id: 'm', title: '偏好', description: '喜欢中文', version: 1, status: 'active', body: 'PRIVATE' }], deleted: [],
    } } } } })
  assert.equal(memory.message.metadata.custom.memory, undefined)
  assert.deepEqual(memory.message.content.slice(0, 1), [{ type: 'text', text: '正文', providerMetadata: {
    lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } },
  } }])
  const call = memory.message.content[1]
  assert.ok(call?.type === 'tool-call')
  assert.equal(call.toolName, 'memory.apply')
  assert.deepEqual((call.result as { memory: unknown }).memory, { chips: [{ id: 'm', text: '喜欢中文', version: 1, change: 'added' }] })
  assert.equal(call.providerMetadata?.lingxiloop?.activity && (call.providerMetadata.lingxiloop.activity as { kind: string }).kind, 'tool')
  assert.doesNotMatch(JSON.stringify(memory), /PRIVATE|arguments/)
  const waiting = runState('waiting')
  waiting.run.goalOutcome = { status: 'awaiting_approval', requestVersion: 1, verification: 'not_run', approvalId: 'approval' }
  const result = projection.apply({ type: 'state', state: waiting })
  assert.deepEqual(result.message.status, { type: 'requires-action', reason: 'tool-calls' })
  assert.equal(result.message.metadata.custom.harnessControl, false)
  assert.equal((result.message.metadata.custom.harness as { goalOutcome: { status: string } }).goalOutcome.status, 'awaiting_approval')
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

// Prefetching while the response is backpressured must retain errors until the
// consumer resumes, without a process-level unhandled rejection.
test('prefetched upstream failure survives downstream backpressure', async () => {
  for (const previewCount of [0, 1, 2, 3]) {
    const upstream = new ReadableStream<Uint8Array>({ start(controller) {
      const events: RunStreamEvent[] = [{ type: 'state', state: runState() }]
      for (let seq = 1; seq <= previewCount; seq++) events.push({ type: 'preview', preview: {
        kind: 'snapshot', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', seq, draft: `text-${seq}`,
      } })
      controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')))
      setTimeout(() => controller.error(new Error('upstream fixture disconnected')), 20)
    } })
    const response = assistantRunResponse(upstream, new RunStreamProjection('run', true))
    await delay(60)
    await assert.rejects(response.text(), /upstream fixture disconnected/)
  }
})

// Failure cases: the ephemeral preview resets after a durable model.delta;
// a rejected delta promotes a stale preview; tool activity restarts the animator.
test('commit handoff and tool activity preserve the live answer part', () => {
  const stale = new RunStreamProjection('run', true)
  stale.apply({ type: 'state', state: runState() })
  stale.apply(draft('未确认的草稿'))
  stale.apply({ type: 'event', event: { runId: 'run', seq: 1, kind: 'model.delta', stage: 'delta', visibility: 'user',
    data: { partType: 'text', delta: '已过期', requestVersion: 0 } } })
  const resetText = stale.apply({ type: 'reset', runId: 'run', reason: 'superseded' }).message.content
  assert.deepEqual(resetText, [])
  assert.doesNotMatch(JSON.stringify(resetText), /未确认的草稿|已过期/)
  const projection = new RunStreamProjection('run', true)
  projection.apply({ type: 'state', state: runState() })
  projection.apply(draft('最终正'))
  const tool = projection.apply({ type: 'event', event: { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started', visibility: 'user',
    data: { toolCallId: 'host:search', name: 'research.search' } } })
  assert.equal(tool.message.content[0]?.type, 'text')
  const durable = projection.apply({ type: 'event', event: { runId: 'run', seq: 2, kind: 'model.delta', stage: 'delta', visibility: 'user',
    data: { partType: 'text', delta: '最终正文', requestVersion: 1 } } })
  const reset = projection.apply({ type: 'reset', runId: 'run', reason: 'superseded' })
  assert.deepEqual(reset.message.content[0], durable.message.content[0])
  const rejected = projection.apply({ type: 'event', event: { runId: 'run', seq: 3, kind: 'model.delta', stage: 'delta', visibility: 'user',
    data: { partType: 'text', delta: '已过期', requestVersion: 0 } } })
  assert.deepEqual(rejected.message.content[0], durable.message.content[0])
  const committed = projection.apply({ type: 'event', event: { runId: 'run', seq: 4, kind: 'response.committed', stage: 'completed', visibility: 'user', data: {} } })
  assert.deepEqual(committed.message.content[0], durable.message.content[0])
  const final = projection.apply({ type: 'state', state: runState('succeeded') })
  assert.equal(final.message.content[0]?.type === 'text' && final.message.content[0].text, '最终正文')
  assert.equal(final.message.status?.type, 'complete')
})

// Performance guardrails written before optimization: every public state must
// survive encoding, not merely the final answer. Includes duplicate/retracted
// Unicode text, tool args/result structure changes and terminal metadata.
test('every changing public snapshot round-trips through the actual stream decoder', async () => {
  const events: RunStreamEvent[] = [
    { type: 'state', state: runState() }, draft('中😀文'), draft('中😀文'),
    { type: 'preview', preview: { kind: 'delta', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', fromSeq: 1, seq: 2, delta: '\n第二段' } },
    { type: 'event', event: { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started', visibility: 'user', data: { toolCallId: 'host:search', name: 'research.search', arguments: 'PRIVATE' } } },
    { type: 'event', event: { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed', visibility: 'user', data: { toolCallId: 'host:search', result: { status: 'completed', sources: [] } } } },
    { type: 'reset', runId: 'run', reason: 'superseded' },
    { type: 'state', state: runState('succeeded') },
  ]
  const reference = new RunStreamProjection('run', false)
  const expected: AgentRunSnapshot[] = []
  for (const event of events) {
    const value = JSON.parse(JSON.stringify(reference.apply(event))) as AgentRunSnapshot
    if (JSON.stringify(value) !== JSON.stringify(expected.at(-1))) expected.push(value)
  }
  const tracker = new AssistantTransportDeltaTracker(), actual: AgentRunSnapshot[] = []
  for await (const chunk of AssistantStream.fromResponse(assistantRunResponse(nativeBody(events), new RunStreamProjection('run', false)), new AssistantTransportDecoder())) {
    if (chunk.type !== 'update-state') continue
    tracker.append(chunk.operations)
    actual.push(JSON.parse(JSON.stringify(tracker.state)))
  }
  assert.deepEqual(actual, expected)
  assert.doesNotMatch(JSON.stringify(actual), /PRIVATE/)
})

test('concurrent protocol responses retain separate prior state and control permissions', async () => {
  const consume = async (canControl: boolean, text: string) => {
    const tracker = new AssistantTransportDeltaTracker()
    for await (const chunk of AssistantStream.fromResponse(assistantRunResponse(nativeBody([
      { type: 'state', state: runState() }, draft(text),
    ]), new RunStreamProjection('run', canControl)), new AssistantTransportDecoder())) {
      if (chunk.type === 'update-state') tracker.append(chunk.operations)
    }
    return tracker.state as unknown as AgentRunSnapshot
  }
  const [owner, reader] = await Promise.all([consume(true, 'owner only'), consume(false, 'reader only')])
  assert.equal(owner.message.metadata.custom.harnessControl, true)
  assert.equal(reader.message.metadata.custom.harnessControl, false)
  assert.doesNotMatch(JSON.stringify(owner), /reader only/)
  assert.doesNotMatch(JSON.stringify(reader), /owner only/)
})

test('JSON normalization, structural replacements and append paths keep every wire state exact', async () => {
  // Exercise the transport with the same JSON-shaped public boundary, including
  // legal optional metadata and property order changes, without database access.
  const inputs = [
    { text: 'A😀', argsText: '{', other: 'A', nested: { optional: undefined, missing: null }, list: [1, undefined, NaN] },
    { text: 'A😀中', argsText: '{}', other: 'AB', nested: { missing: null }, list: [1, undefined, NaN] },
    { text: 'replacement', argsText: '', other: 'AB', nested: { added: true, missing: null }, list: [2, null] },
    { text: '', argsText: '', other: 'AB', nested: { missing: null, added: true }, list: { '0': 2, '1': null } },
    { text: '', argsText: '', other: 'AB', nested: { missing: null, added: true }, list: { '0': 2, '1': null } },
    { text: '', argsText: '', other: null, nested: { '中/~': { text: 'quoted " \\ \n' } }, list: [] },
  ]
  let cursor = -1
  const projection = new RunStreamProjection('run', true)
  const advance = () => { cursor++; return inputs[cursor] as unknown as AgentRunSnapshot }
  // Both names deliberately let this guard run on main and the candidate.
  projection.apply = advance
  Object.assign(projection, { advance })
  Object.defineProperty(projection, 'snapshot', { get: () => inputs[cursor] })
  const operations: unknown[] = [], actual: unknown[] = [], tracker = new AssistantTransportDeltaTracker()
  for await (const chunk of AssistantStream.fromResponse(assistantRunResponse(nativeBody(inputs.map(() => ({ type: 'state', state: runState() }))), projection), new AssistantTransportDecoder())) {
    if (chunk.type !== 'update-state') continue
    tracker.append(chunk.operations); operations.push(...chunk.operations)
    actual.push(JSON.parse(JSON.stringify(tracker.state)))
  }
  assert.deepEqual(actual, [inputs[0], inputs[1], inputs[2], inputs[3], inputs[5]].map(value => JSON.parse(JSON.stringify(value))))
  assert.ok(operations.some(value => (value as { type: string }).type === 'append-text'))
  assert.ok(!operations.some(value => {
    const op = value as { type: string; path: string[] }
    return op.type === 'append-text' && op.path.at(-1) === 'other'
  }))
})
