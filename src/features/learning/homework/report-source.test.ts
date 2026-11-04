import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findReportSource } from './report-source'
const references = [{ channelId: 'private-room', messageIds: ['a','b'], title: '学习', capturedAt: '2026-11-04T00:00:00Z', messages: [
  { id: 'a', role: 'user' as const, text: '2+3*4 = 14', sequence: 2 }, { id: 'b', role: 'assistant' as const, text: '继续解释', sequence: 4 },
] }]
test('676 stable IDs and exact quotes locate shared evidence after reordering', () => {
  assert.equal(findReportSource({ messageId:'a', excerpt:'3*4' },references)?.message.id, 'a')
  assert.equal(findReportSource({ messageId:'a', excerpt:'3*4' },[...references].reverse())?.message.sequence, 2)
  assert.equal(findReportSource({ messageId:'missing', excerpt:'3*4' },references), null)
  assert.equal(findReportSource({ messageId:'a', excerpt:'different version' },references), null)
})
