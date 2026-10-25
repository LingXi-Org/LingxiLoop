import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { TerminalFeedback } from '@lyyzka/lingxios'
import { RunStreamProjection, assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import type { Queryable } from '../db/queryable.js'

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

test('successful main answer retains its outcome while a matching failed follow-up becomes a scoped error', async () => {
  const projection = new RunStreamProjection('run', true)
  projection.apply({ type: 'state', state: runState('succeeded') })
  assert.equal(projection.snapshot.message.status?.type, 'complete')
  const feedback: TerminalFeedback = { id: 'feedback', rootWorkId: 'run', requestVersion: 1, reason: 'execution_failed', status: 'failed',
    failedCount: 1, cancelledCount: 0, notStartedCount: 2, notStartedAgentIds: [], createdAt: '2026-10-25T00:00:00Z', suppressAgentWake: true }
  const api = { readTerminal: async () => ({ feedback, delivery: 'pending' as const }) }
  const identity = { tenantId: 'company', agentId: 'agent', sessionId: 'session', principalId: 'human', runId: 'run' }
  await projection.syncTerminal(api,identity)
  const message = projection.snapshot.message
  assert.deepEqual(message.status, { type: 'incomplete', reason: 'error' })
  const harness = message.metadata.custom.harness as { lifecycle: string; goalOutcome: { status: string } }
  assert.equal(harness.lifecycle, 'succeeded')
  assert.equal(harness.goalOutcome.status, 'satisfied')
  assert.ok(message.content.some(part => part.type === 'text' && part.text === '最终正文'))
  const terminal = message.metadata.custom.terminalFeedback as { scope: string; scopeVersion: number; text: string; delivery: string }
  assert.equal(terminal.scope, 'follow_up')
  assert.equal(terminal.scopeVersion, 1)
  assert.equal(terminal.delivery, 'pending', 'this is notification delivery, not answer delivery')
  assert.match(terminal.text, /已有答复已发送.*1 项协作失败.*2 项协作未启动/)
  const main = runState('succeeded')
  const committed = projection.committed(main.message!, { resultId: main.run.resultId!, fence: main.run.resultFence! })
  assert.equal(committed.message.status?.type, 'complete', 'the durable main-result receipt must not inherit successor failure')
  assert.equal(committed.message.metadata.custom.terminalFeedback, undefined)
  assert.deepEqual(projection.snapshot.message.status, { type: 'incomplete', reason: 'error' }, 'read projection retains the aggregate failure')
  await projection.syncTerminal({ readTerminal: async () => ({ feedback: { ...feedback, rootWorkId: 'other' }, delivery: 'delivered' }) }, identity)
  assert.equal(projection.snapshot.message.status?.type, 'complete', 'another root cannot mark this answer failed')
  await projection.syncTerminal({ readTerminal: async () => ({ feedback: { ...feedback, requestVersion: 2 }, delivery: 'delivered' }) }, identity)
  assert.equal(projection.snapshot.message.status?.type, 'complete', 'another request cannot mark this answer failed')
  await projection.syncTerminal(api,identity)
  projection.apply({ type: 'state', state: { ...runState(), run: { ...runState().run, requestVersion: 2, fence: 2 } } })
  await projection.syncTerminal(api,identity)
  assert.equal(projection.snapshot.message.status?.type, 'running')
  assert.equal(projection.snapshot.message.metadata.custom.terminalFeedback, undefined)
})

test('terminal notification cancellation is projected without changing successful root lifecycle', async () => {
  const projection = new RunStreamProjection('run', true)
  projection.apply({ type: 'state', state: runState('succeeded') })
  await projection.syncTerminal({ readTerminal: async () => ({ feedback: { id: 'cancelled-follow-up', rootWorkId: 'run', requestVersion: 1,
    reason: 'cancelled', status: 'cancelled', failedCount: 0, cancelledCount: 1, notStartedCount: 0, notStartedAgentIds: [],
    createdAt: '2026-10-25T00:00:00Z', suppressAgentWake: true }, delivery: 'delivered' }) },
  { tenantId: 'company', agentId: 'agent', sessionId: 'session', principalId: 'human', runId: 'run' })
  assert.deepEqual(projection.snapshot.message.status, { type: 'incomplete', reason: 'cancelled' })
  assert.equal((projection.snapshot.message.metadata.custom.terminalFeedback as { scope: string }).scope, 'follow_up')
})

test('finalization scope requires an accepted echo for this exact result and fence', async () => {
  const projection = new RunStreamProjection('run', true), main = runState('succeeded')
  projection.apply({ type: 'state', state: main })
  const accepted = projection.committed(main.message!, { resultId: 'result', fence: 1 }).message
  const payload = { ...accepted, metadata: { ...accepted.metadata, custom: { ...accepted.metadata.custom, sourceMessageId: 'accepted-message' } } }
  const row = { client_nonce: 'accepted-message', channel_id: 'room', channel_type: 2, payload,
    echo: { messageId: 'wk-message', messageSeq: 1, clientMsgNo: 'accepted-message', channelId: 'room', channelType: 2,
      fromUid: 'agent', timestamp: 1, payload } }
  let rows = [row]
  const database = { query: async (_sql: string, params: unknown[]) => {
    assert.deepEqual(params, ['run','company','agent','human','session',null,'result','1','1'])
    return { rows }
  } } as unknown as Queryable
  const identity = { tenantId: 'company', agentId: 'agent', sessionId: 'session', principalId: 'human', runId: 'run' }
  const api = { readTerminal: async () => ({ feedback: { id: 'feedback', rootWorkId: 'run', requestVersion: 1, reason: 'execution_failed' as const,
    status: 'failed' as const, failedCount: 1, cancelledCount: 0, notStartedCount: 0, notStartedAgentIds: [], createdAt: '', suppressAgentWake: true as const },
  delivery: 'pending' as const }) }
  projection.apply({ type: 'state', state: { ...main, delivery: 'failed' } })
  await projection.syncTerminal(api,identity,undefined,database)
  assert.equal((projection.snapshot.message.metadata.custom.terminalFeedback as { scope: string }).scope, 'finalization')
  rows = [{ ...row, echo: { ...row.echo, fromUid: 'other-agent' } }]
  await projection.syncTerminal(api,identity,undefined,database)
  assert.equal((projection.snapshot.message.metadata.custom.terminalFeedback as { scope: string }).scope, 'delivery')
  const changedPayload = { ...payload, metadata: { ...payload.metadata, custom: { ...payload.metadata.custom,
    harness: { ...(accepted.metadata.custom.harness as object), messageFence: 2 } } } }
  rows = [{ ...row, payload: changedPayload, echo: { ...row.echo, payload: changedPayload } }]
  await projection.syncTerminal(api,identity,undefined,database)
  assert.equal((projection.snapshot.message.metadata.custom.terminalFeedback as { scope: string }).scope, 'delivery')
})
function nativeBody(events: RunStreamEvent[]) {
  const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3))
    controller.close()
  } })
}

test('an authorized prepared snapshot is delivered before an idle upstream emits any event', async () => {
  const projection = new RunStreamProjection('run', true)
  projection.apply({ type: 'state', state: runState('succeeded') })
  let cancelled = false
  const upstream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
  const response = assistantRunResponse(upstream, projection)
  const reader = AssistantStream.fromResponse(response, new AssistantTransportDecoder()).getReader()
  try {
    const first = await Promise.race([reader.read(), delay(100).then(() => { throw new Error('prepared snapshot is blocked by idle upstream') })])
    assert.equal(first.value?.type, 'update-state')
    if (first.value?.type !== 'update-state') return
    const tracker = new AssistantTransportDeltaTracker()
    tracker.append(first.value.operations)
    assert.deepEqual((tracker.state as unknown as AgentRunSnapshot).message.content, projection.snapshot.message.content)
  } finally { await reader.cancel(); reader.releaseLock() }
  await delay(20)
  assert.equal(cancelled, true)
})
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
