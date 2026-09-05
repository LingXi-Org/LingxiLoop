import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasBroadcastMention } from './chatMessages'

test('recognizes the canonical @all broadcast', () => {
  assert.equal(hasBroadcastMention('@all 请都回答'), true)
  assert.equal(hasBroadcastMention('请@all 都回答'), true)
  assert.equal(hasBroadcastMention('@everyone answer'), false)
  assert.equal(hasBroadcastMention('mail@all.example'), false)
  assert.equal(hasBroadcastMention('@alligator'), false)
})
