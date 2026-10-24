import { toolDisplaySchema } from '@/lib/runActivity'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const approvalStatusLabels = {
  PENDING: '等待你的审批', APPROVED: '已批准 · 等待执行', EXECUTED: '执行成功',
  REJECTED: '已拒绝', UNKNOWN: '结果待核对 · 请先刷新进度，避免重复执行', FAILED: '执行失败',
} as const

/** The server authorizes and explicitly maps public business fields. Never inspect args. */
export function approvalContext(value: unknown, approvalId: string) {
  const approval = object(value)
  if (approval.id !== approvalId || typeof approval.summary !== 'string'
    || !Object.hasOwn(approvalStatusLabels, String(approval.status))) throw new Error('审批信息无效')
  const status = approval.status as keyof typeof approvalStatusLabels
  const fields = toolDisplaySchema.shape.input.safeParse(approval.context)
  return {
    retired: /^(email|calendar)\./.test(String(object(approval.action).action)),
    summary: approval.summary, status,
    context: fields.success ? fields.data ?? [] : [],
    approved: status === 'PENDING' ? undefined : status !== 'REJECTED',
    statusLabel: approvalStatusLabels[status],
  }
}
