const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Show reviewed business fields only, never raw tool arguments or internal scope. */
export function approvalContext(value: unknown, approvalId: string) {
  const approval = object(value)
  if (approval.id !== approvalId || typeof approval.summary !== 'string'
    || !['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'UNKNOWN', 'FAILED'].includes(String(approval.status))) throw new Error('审批信息无效')
  const preview = object(approval.preview)
  const action = object(approval.action).action
  const context: { label: string; value: string }[] = []
  const add = (label: string, text: unknown) => { if (typeof text === 'string' && text.trim()) context.push({ label, value: text }) }
  const addresses = (value: unknown) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : object(item).addr).filter((item): item is string => typeof item === 'string').join('、') : ''
  if (action === 'email.send' || action === 'email.reply') {
    const email = object(preview.email)
    add('发件人', object(email.sender).email)
    add('收件人', addresses(email.to))
    add('抄送', addresses(email.cc))
    add('主题', email.subject)
    if (Array.isArray(preview.attachments)) add('附件', preview.attachments.map(item => object(item).filename).filter((item): item is string => typeof item === 'string').join('、'))
  } else if (action === 'calendar.create' || action === 'calendar.delete') {
    const event = object(action === 'calendar.create' ? preview.input : preview.event)
    add('日程', event.title)
    add('开始时间', event.at ?? event.startAt)
    add('结束时间', event.endAt)
  }
  const labels: Record<string, string> = { 'email.send': '发送邮件', 'email.reply': '回复邮件', 'calendar.create': '创建日程', 'calendar.delete': '删除日程' }
  return {
    summary: approval.summary === action && typeof action === 'string' ? labels[action] ?? approval.summary : approval.summary,
    context,
    approved: approval.status === 'PENDING' ? undefined : approval.status !== 'REJECTED',
  }
}
