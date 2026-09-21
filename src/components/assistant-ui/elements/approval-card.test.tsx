import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApprovalCard } from './approval-card'

test('approval cards show explicit decisions and distinct receipts, and disable both actions while busy', () => {
  const props = { title: '外部通信', summary: '发送邮件', context: [{ label: '执行者', value: '项目助手' }], onApprove: async () => {}, onDeny: async () => {} }
  const request = renderToStaticMarkup(<ApprovalCard {...props} />)
  assert.match(request, /data-slot="approval-card"/)
  assert.match(request, /shield-check/)
  assert.match(request, /批准并继续/)
  assert.match(request, /拒绝/)
  assert.match(request, /<dl/)
  assert.match(request, /项目助手/)
  assert.doesNotMatch(request, /其他方案|terminal/)
  for (const approved of [true, false]) {
    const receipt = renderToStaticMarkup(<ApprovalCard {...props} approved={approved} />)
    assert.match(receipt, approved ? /已批准/ : /已拒绝/)
    assert.doesNotMatch(receipt, /<button|需要你的审批/)
    assert.match(receipt, approved ? /lucide-check/ : /lucide-x/)
  }
  const busy = renderToStaticMarkup(<ApprovalCard {...props} busy />)
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 2)
})
