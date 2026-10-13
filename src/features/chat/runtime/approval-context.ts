const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Show reviewed business fields only, never raw tool arguments or internal scope. */
export function approvalContext(value: unknown, approvalId: string) {
  const approval = object(value)
  if (approval.id !== approvalId || typeof approval.summary !== 'string'
    || !['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'UNKNOWN', 'FAILED'].includes(String(approval.status))) throw new Error('审批信息无效')
  return {
    retired: /^(email|calendar)\./.test(String(object(approval.action).action)),
    summary: approval.summary,
    context: [] as { label: string; value: string }[],
    approved: approval.status === 'PENDING' ? undefined : approval.status !== 'REJECTED',
  }
}
