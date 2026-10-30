import type { ApprovalSnapshot } from '@lyyzka/lingxios'
import { publicText, toolDisplay } from '../../../src/lib/runActivity.js'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Caller authorizes the approval first. Map only fields reviewed at the owning
 * tool's preview producer; runtime args, instructions and internal scope stay server-side. */
export function approvalView(approval: ApprovalSnapshot) {
  const status = approval.decision === null ? 'PENDING' : approval.decision === false ? 'REJECTED'
    : !approval.result || approval.result.executionState === 'awaiting_approval' ? 'APPROVED'
    : approval.result.executionState === 'unknown' ? 'UNKNOWN' : approval.result.ok ? 'EXECUTED' : 'FAILED'
  const context: { label: string; value: string }[] = []
  const field = (label: string, value: unknown) => {
    const parsed = publicText.pipe(publicText.max(500)).safeParse(value)
    if (parsed.success) context.push({ label, value: parsed.data })
  }
  const version = (value: unknown) => { if (Number.isSafeInteger(value) && Number(value) >= 0) field('核准版本', String(value)) }
  const preview = approval.preview
  switch (approval.action) {
    case 'documents.delete':
      field('文档', preview.title); version(preview.revision)
      field('具体变化', '删除这份文档'); break
    case 'knowledge.delete_source':
    case 'knowledge.set_source_enabled': {
      const source = object(preview.source)
      field('课程资料', source.title)
      field('可见范围', source.visibilityScope === 'PRIVATE' ? '个人私有资料' : source.visibilityScope === 'PROJECT' ? '当前课程共享资料' : undefined)
      if (typeof source.version === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source.version)) field('核准版本', source.version)
      field('具体变化', approval.action === 'knowledge.delete_source' ? '删除资料并清理关联资源'
        : typeof preview.enabled === 'boolean' ? preview.enabled ? '在当前对话中启用资料' : '在当前对话中停用资料' : undefined)
      break
    }
    case 'routines.create':
    case 'routines.activate': {
      field('定时任务', preview.title); version(preview.version)
      const schedule = object(preview.schedule)
      field('执行频率', Number.isSafeInteger(schedule.everyMinutes) ? `每 ${schedule.everyMinutes} 分钟`
        : typeof schedule.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ? `每天 ${schedule.time}` : undefined)
      field('时区', preview.timezone)
      field('生效方式', approval.action === 'routines.create' ? '创建为暂停状态；启用需要另一次审批' : '启用当前版本并按计划执行')
      break
    }
  }
  return { id: approval.approvalId, runId: approval.runId, agentId: approval.agentId, status,
    summary: toolDisplay(approval.action).title, action: { action: approval.action }, context,
    requestedAt: approval.createdAt, resolvedAt: approval.decidedAt, scope: { requestVersion: approval.requestVersion } }
}
