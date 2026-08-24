import assert from 'node:assert/strict'
import test from 'node:test'
import { isEmptyHistoryDetail } from './historyErrors'

test('empty IM history details are distinguished from real service failures', () => {
  for (const detail of [
    'messagesync not found',
    '{"error":"channel does not exist"}',
    '{"message":"no_messages"}',
    '{"message":"频道不存在"}',
  ]) {
    assert.equal(isEmptyHistoryDetail(detail), true, detail)
  }

  for (const detail of ['storage unavailable', 'database timeout', 'internal server error']) {
    assert.equal(isEmptyHistoryDetail(detail), false, detail)
  }
})
