import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conversationListRunLabel, conversationRunSummaryLabel, type ConversationRunSummary } from './conversationRunSummary'

test('only a current receipt for the same run supersedes the unloaded-list wait', () => {
  const summary: ConversationRunSummary = { kind: 'waiting_approval', actor: 'you', runId: 'current', requestVersion: 2, fence: 3 }
  const local = { runId: 'old', requestVersion: 99, fence: 99, lifecycle: 'succeeded', label: '已完成' }
  assert.equal(conversationListRunLabel(summary, local), '等你审批')
  assert.equal(conversationListRunLabel(summary, { ...local, runId: 'current', requestVersion: 1 }), '等你审批')
  assert.equal(conversationListRunLabel(summary, { ...local, runId: 'current', requestVersion: 2, fence: 3, lifecycle: 'cancelled', label: '已取消' }), '已取消')
  assert.equal(conversationListRunLabel(summary, { ...local, runId: 'current', requestVersion: 3, fence: 4, lifecycle: 'queued', label: '排队中' }), '排队中')
  assert.equal(conversationListRunLabel({ ...summary, kind: 'cancelled', actor: 'system' }, { ...local, runId: 'current', requestVersion: 2, fence: 3 }), '已取消')
  assert.equal(conversationListRunLabel({ ...summary, kind: 'submitted', actor: 'system' }, { ...local, runId: 'current', requestVersion: 2, fence: 3, lifecycle: 'waiting', label: '等你审批' }), '已提交待继续')
})
test('unknown or unproven actors never become personal next actions', () => {
  assert.equal(conversationRunSummaryLabel({ kind: 'waiting_input', actor: 'unknown' }), '等待补充信息')
  assert.equal(conversationRunSummaryLabel({ kind: 'waiting_approval', actor: 'unknown' }), '等待审批进度')
  assert.equal(conversationRunSummaryLabel({ kind: 'unknown', actor: 'unknown' }), '任务状态待刷新')
})
