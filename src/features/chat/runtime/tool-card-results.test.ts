import assert from 'node:assert/strict'
import test from 'node:test'
import { harnessToolParts } from '../../../../server/src/agent-runtime/message-projection'
import { toolCardResult } from '@/lib/agentToolCards'
import { publicRunEvent } from '../../../../server/src/agent-runtime/public-events'

// Failure modes: either projection drops the card locator, invalid locators survive,
// or private provider state leaks through the public result.
test('homework draft card locators survive public event and native message projection without private state', () => {
  const value = { result: { homeworkId: 'homework-1', courseId: 'course-1', revision: 2, privateEvidence: 'private' }, state: { privateEvidence: 'private' } }
  const publicValue = { result: { homeworkId: 'homework-1', courseId: 'course-1', revision: 2 } }
  assert.deepEqual(toolCardResult('teacher.draft_homework', value), publicValue)
  const started = { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started' as const, visibility: 'user' as const, data: { toolCallId: 'host:homework', name: 'teacher.draft_homework', args: { instructions: 'private' } } }
  const completed = { ...started, seq: 2, kind: 'tool.completed', stage: 'completed' as const, data: { toolCallId: 'host:homework', result: { status: 'completed', value } } }
  const cards = harnessToolParts('run', [started, completed].map(item => publicRunEvent(item, 'teacher.draft_homework')))
  assert.deepEqual(cards[0].args, {})
  assert.deepEqual(cards[0].result, { status: 'completed', value: publicValue })
  for (const result of [undefined, { homeworkId: '', courseId: 'course-1', revision: 2 }, { homeworkId: 'homework-1', courseId: 'course-1', revision: 0 }]) {
    assert.equal(toolCardResult('teacher.draft_homework', { result }), undefined)
  }
})
