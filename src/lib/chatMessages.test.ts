import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACTIVE_STREAM_EXPIRY_MS,
  hasBroadcastMention,
  QUEUED_STREAM_EXPIRY_MS,
  shouldApplyStreamEvent,
  streamExpiryForOpen,
  withoutFinalizedActiveRuns,
} from './chatMessages'

test('recognizes the canonical @all broadcast', () => {
  assert.equal(hasBroadcastMention('@all 请都回答'), true)
  assert.equal(hasBroadcastMention('请@all 都回答'), true)
  assert.equal(hasBroadcastMention('@everyone answer'), false)
  assert.equal(hasBroadcastMention('mail@all.example'), false)
  assert.equal(hasBroadcastMention('@alligator'), false)
})

test('queued placeholders outlive active stream silence protection', () => {
  assert.equal(streamExpiryForOpen(false), ACTIVE_STREAM_EXPIRY_MS)
  assert.equal(streamExpiryForOpen(true), QUEUED_STREAM_EXPIRY_MS)
  assert.ok(QUEUED_STREAM_EXPIRY_MS > ACTIVE_STREAM_EXPIRY_MS)
})

test('stream sequence rejects a queued preview that arrives after output or termination', () => {
  assert.equal(shouldApplyStreamEvent(undefined, 0), true)
  assert.equal(shouldApplyStreamEvent(2, 0), false)
  assert.equal(shouldApplyStreamEvent(4, 0), false)
  assert.equal(shouldApplyStreamEvent(4, 4), false)
  assert.equal(shouldApplyStreamEvent(4, 5), true)
  assert.equal(shouldApplyStreamEvent(4, undefined), false)
})

test('hides a persisted reply only while its matching markdown stream is active', () => {
  const messages = [{ id: 'one', runId: 'run-1' }, { id: 'two', runId: 'run-2' }, { id: 'human' }]
  assert.deepEqual(withoutFinalizedActiveRuns(messages, new Set(['run-1'])), [messages[1], messages[2]])
  assert.equal(withoutFinalizedActiveRuns(messages, new Set()), messages)
})
