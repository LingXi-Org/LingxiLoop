import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAssistantStreamChunks, runningAgentIds, StreamSequenceTracker } from './stream'

test('rejects duplicate and out-of-order stream sequences independently per message', () => {
  const tracker = new StreamSequenceTracker()
  assert.equal(tracker.accept('a', 1), true)
  assert.equal(tracker.accept('a', 1), false)
  assert.equal(tracker.accept('a', 0), false)
  assert.equal(tracker.accept('b', 1), true)
  assert.equal(tracker.accept('a', 2), true)
  assert.throws(() => tracker.accept('c', -1), /Invalid assistant stream sequence/)
})

test('reports all concurrently running agents once', () => {
  assert.deepEqual(runningAgentIds({
    first: { id: 'run-1', agentId: 'agent-a', messageId: 'first', lastSequence: 1, state: 'running' },
    second: { id: 'run-2', agentId: 'agent-b', messageId: 'second', lastSequence: 3, state: 'queued' },
    third: { id: 'run-3', agentId: 'agent-a', messageId: 'third', lastSequence: 9, state: 'running' },
    done: { id: 'run-4', agentId: 'agent-c', messageId: 'done', lastSequence: 2, state: 'complete' },
  }), ['agent-a', 'agent-b'])
})

test('applies native assistant-ui part lifecycle without flattening Markdown', () => {
  const streaming = applyAssistantStreamChunks([], [
    { type: 'step-start', path: [], messageId: 'preview-1' },
    { type: 'part-start', path: [0], part: { type: 'reasoning' } },
    { type: 'text-delta', path: [0], textDelta: 'Inspecting' },
    { type: 'part-finish', path: [0] },
    { type: 'part-start', path: [1], part: { type: 'text' } },
    { type: 'text-delta', path: [1], textDelta: '**Done**\n' },
    { type: 'text-delta', path: [1], textDelta: '- item' },
  ])
  const closed = applyAssistantStreamChunks(streaming, [
    { type: 'part-finish', path: [1] },
    { type: 'message-finish', path: [], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } },
  ])
  assert.deepEqual(closed, [
    { type: 'reasoning', text: 'Inspecting', status: { type: 'complete' } },
    { type: 'text', text: '**Done**\n- item', status: { type: 'complete' } },
  ])
})

test('keeps prior parts across model steps and rejects a delta without part-start', () => {
  const opened = applyAssistantStreamChunks([], [{ type: 'step-start', path: [], messageId: 'preview-1' }])
  assert.throws(() => applyAssistantStreamChunks(opened, [
    { type: 'text-delta', path: [0], textDelta: 'invalid' },
  ]), /no text or tool part/)

  assert.deepEqual(opened, [])
})

test('applies the native assistant-ui tool-call lifecycle', () => {
  const running = applyAssistantStreamChunks([], [
    { type: 'step-start', path: [], messageId: 'preview-1' },
    { type: 'part-start', path: [0], part: { type: 'tool-call', toolCallId: 'call-1', toolName: 'ipython' } },
    { type: 'text-delta', path: [0], textDelta: '{"codePreview":"print(1)"}' },
    { type: 'tool-call-args-text-finish', path: [0] },
  ])
  const completed = applyAssistantStreamChunks(running, [
    { type: 'result', path: [0], result: { status: 'completed', durationMs: 12 }, isError: false },
    { type: 'part-finish', path: [0] },
  ])
  assert.deepEqual(completed, [{
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'ipython',
    args: { codePreview: 'print(1)' },
    argsText: '{"codePreview":"print(1)"}',
    result: { status: 'completed', durationMs: 12 },
    isError: false,
  }])
})
