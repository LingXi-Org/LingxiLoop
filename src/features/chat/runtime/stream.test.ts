import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeStreamParts, StreamSequenceTracker, runningAgentIds } from './stream'

test('rejects duplicate and out-of-order stream sequences independently per message', () => {
  const tracker = new StreamSequenceTracker()
  assert.equal(tracker.accept('a', 1), true)
  assert.equal(tracker.accept('a', 1), false)
  assert.equal(tracker.accept('a', 0), false)
  assert.equal(tracker.accept('b', 1), true)
  assert.equal(tracker.accept('a', 2), true)
})

test('reports all concurrently running agents once', () => {
  assert.deepEqual(runningAgentIds({
    first: { id: 'run-1', agentId: 'agent-a', messageId: 'first', lastSequence: 1, state: 'running' },
    second: { id: 'run-2', agentId: 'agent-b', messageId: 'second', lastSequence: 3, state: 'queued' },
    third: { id: 'run-3', agentId: 'agent-a', messageId: 'third', lastSequence: 9, state: 'running' },
    done: { id: 'run-4', agentId: 'agent-c', messageId: 'done', lastSequence: 2, state: 'complete' },
  }), ['agent-a', 'agent-b'])
})

test('preserves reasoning and tool parts when answer deltas arrive', () => {
  const thinking = mergeStreamParts([], { phase: 'thinking', mode: 'open', text: 'Inspecting', running: true })
  const withTool = [...thinking, {
    type: 'tool-call' as const,
    toolCallId: 'tool-1',
    toolName: 'progress-tracker',
    args: {},
    argsText: '{}',
  }]
  const answer = mergeStreamParts(withTool, { phase: 'answer', mode: 'append', text: 'Done', running: true })
  const closed = mergeStreamParts(answer, { phase: 'answer', mode: 'append', text: '!', running: false })
  assert.deepEqual(closed, [
    { type: 'reasoning', text: 'Inspecting', status: { type: 'complete' } },
    withTool[1],
    { type: 'text', text: 'Done!', status: { type: 'complete' } },
  ])
})
