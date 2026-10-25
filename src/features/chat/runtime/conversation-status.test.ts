import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { conversationRunStatus } from './conversation-status'
const run = (lifecycle: string, status: string, extra = {}) => ({ role: 'assistant', metadata: { custom: {
  harnessControl: true, harness: { lifecycle, goalOutcome: { status } }, ...extra,
} } }) as unknown as ThreadMessage

test('conversation list states follow durable waits, actor permissions and terminal outcomes', () => {
  assert.equal(conversationRunStatus([]), null)
  assert.equal(conversationRunStatus([run('waiting', 'awaiting_input')]), '等你回答')
  assert.equal(conversationRunStatus([run('waiting', 'awaiting_approval', { harnessControl: false })]), '等待有权限的成员审批')
  assert.equal(conversationRunStatus([run('cancelled', 'awaiting_approval')]), '已取消')
  assert.equal(conversationRunStatus([run('succeeded', 'partial')]), '部分完成')
  assert.equal(conversationRunStatus([run('failed', 'blocked', { unresolvedActions: [{ actionKey: 'a' }] })]), '结果待核对')
  assert.equal(conversationRunStatus([run('waiting', 'awaiting_input'), run('succeeded', 'satisfied')]), '等你回答')
  assert.equal(conversationRunStatus([run('waiting', 'awaiting_input', { runConnection: 'inaccessible' })]), '已无访问权限')
})

test('a succeeded main run cannot hide its matching failed collaboration in the conversation status', () => {
  const message = { ...run('succeeded', 'satisfied', { runId: 'main',
    harness: { runId: 'main', lifecycle: 'succeeded', requestVersion: 2, goalOutcome: { status: 'satisfied' } },
    terminalFeedback: { id: 'feedback', requestVersion: 2, status: 'failed', scopeVersion: 1, scope: 'follow_up' },
  }), status: { type: 'incomplete', reason: 'error' }, content: [] } as ThreadMessage
  assert.equal(conversationRunStatus([message]), '后续协作未完成')
})
