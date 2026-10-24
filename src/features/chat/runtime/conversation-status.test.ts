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
