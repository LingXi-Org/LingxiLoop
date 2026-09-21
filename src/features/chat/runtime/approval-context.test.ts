import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalContext } from './approval-context'

test('approval context uses frozen recipients and excludes raw arguments, credentials and scope', () => {
  const payload = { id: 'approval-1', status: 'PENDING', summary: 'email.send',
    action: { action: 'email.send', args: { to: ['unreviewed@example.com'], token: 'secret' } },
    preview: { email: { sender: { email: 'agent@example.com' }, to: [{ addr: 'reviewed@example.com', name: null }], cc: [], subject: '周报' },
      attachments: [{ filename: '周报.pdf', key: 'private/key' }], scope: { token: 'secret' }, prompt: 'private prompt' } }
  assert.deepEqual(approvalContext(payload, 'approval-1'), {
    summary: '发送邮件', approved: undefined,
    context: [{ label: '发件人', value: 'agent@example.com' }, { label: '收件人', value: 'reviewed@example.com' }, { label: '主题', value: '周报' }, { label: '附件', value: '周报.pdf' }],
  })
  assert.equal(approvalContext({ ...payload, status: 'REJECTED' }, 'approval-1').approved, false)
  assert.equal(approvalContext({ ...payload, status: 'EXECUTED' }, 'approval-1').approved, true)
  assert.throws(() => approvalContext(payload, 'other-approval'), /审批信息无效/)
  assert.throws(() => approvalContext({ ...payload, status: 'invalid' }, 'approval-1'), /审批信息无效/)
})

test('calendar context renders reviewed timing and unknown actions reveal no raw payload', () => {
  const payload = { id: 'calendar', status: 'PENDING', summary: 'calendar.create', action: { action: 'calendar.create' },
    preview: { input: { title: '评审', at: '2026-09-23T06:00:00Z', endAt: '2026-09-23T06:30:00Z' } } }
  assert.deepEqual(approvalContext(payload, 'calendar').context, [
    { label: '日程', value: '评审' }, { label: '开始时间', value: '2026-09-23T06:00:00Z' }, { label: '结束时间', value: '2026-09-23T06:30:00Z' },
  ])
  assert.deepEqual(approvalContext({ ...payload, action: { action: 'other' } }, 'calendar').context, [])
})
