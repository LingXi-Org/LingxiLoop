import assert from 'node:assert/strict'
import test from 'node:test'
import { isEmptyHistoryDetail, isInternalAgentStatus } from './historyErrors'

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

test('only internal agent start previews are hidden from chat', () => {
  const base = {
    messageId: '1', messageSeq: 1, clientMsgNo: 'preview-run-1', channelId: 'chat',
    channelType: 2, fromUid: 'agent', timestamp: 1,
    payload: {
      version: 1, kind: 'tool_activity', clientMsgNo: 'preview-run-1',
      body: 'Agent started working', refs: { runId: 'run-1' }, data: { stage: 'started' },
    },
  }
  assert.equal(isInternalAgentStatus(base), true)
  assert.equal(isInternalAgentStatus({
    ...base,
    payload: { ...base.payload, clientMsgNo: 'tool-1', body: 'Search', data: { stage: 'started' } },
  }), false)
})
