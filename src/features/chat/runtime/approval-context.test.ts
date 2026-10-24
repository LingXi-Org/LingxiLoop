import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalContext } from './approval-context'

// A grant is not an execution receipt; private preview/args must never become card context.
test('approval context preserves separate receipt states and only reviewed public fields', () => {
  for (const status of ['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'UNKNOWN', 'FAILED'] as const) {
    const review = approvalContext({ id: 'approval', summary: '删除文档', status,
      context: [{ label: '文档', value: '网络拓扑' }], action: { action: 'documents.delete', args: { secret: 'private' } },
      preview: { secret: 'private' } }, 'approval')
    assert.equal(review.status, status)
    assert.deepEqual(review.context, [{ label: '文档', value: '网络拓扑' }])
    assert.doesNotMatch(JSON.stringify(review), /private/)
  }
  assert.throws(() => approvalContext({ id: 'other', summary: 'x', status: 'PENDING' }, 'approval'))
  const unsafe = approvalContext({ id: 'approval', summary: '删除文档', status: 'PENDING',
    context: [{ label: '内容', value: '<analysis>private</analysis>' }] }, 'approval')
  assert.deepEqual(unsafe.context, [])
})
