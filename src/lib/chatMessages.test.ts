import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasBroadcastMention, withoutFinalizedActiveRuns } from './chatMessages'

test('recognizes canonical @all and legacy @everyone broadcasts', () => {
  assert.equal(hasBroadcastMention('@all 请都回答'), true)
  assert.equal(hasBroadcastMention('请@all 都回答'), true)
  assert.equal(hasBroadcastMention('@everyone answer'), true)
  assert.equal(hasBroadcastMention('mail@all.example'), false)
  assert.equal(hasBroadcastMention('@alligator'), false)
})

test('hides a persisted reply only while its matching markdown stream is active', () => {
  const messages = [{ id: 'one', runId: 'run-1' }, { id: 'two', runId: 'run-2' }, { id: 'human' }]
  assert.deepEqual(withoutFinalizedActiveRuns(messages, new Set(['run-1'])), [messages[1], messages[2]])
  assert.equal(withoutFinalizedActiveRuns(messages, new Set()), messages)
})
