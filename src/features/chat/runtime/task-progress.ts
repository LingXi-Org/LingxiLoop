import { parseSerializableProgressTracker, type ProgressStep } from '@/components/tool-ui/progress-tracker/schema'
import type { ToolUIReceipt } from '@/components/tool-ui/shared/schema'

type Data = Record<string, unknown>
type Names = Record<string, { name: string }>
const text = (value: unknown, fallback = '') => typeof value === 'string' && value ? value : fallback
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.filter((item): item is Data => !!item && typeof item === 'object') : []
const person = (names: Names, id: unknown) => names[text(id)]?.name ?? text(id, '负责人')
const labels: Record<string, string> = { queued: '等待执行', accepted: '已接受，等待执行', working: '执行中', waiting: '等待回传',
  blocked: '等待处理', partial: '部分完成', completed: '已完成', failed: '执行失败', cancelled: '已取消', active: '协作中', summarizing: '汇总报告中', stopped: '已取消' }

function stepStatus(status: string): ProgressStep['status'] {
  return status === 'completed' ? 'completed' : status === 'failed' ? 'failed'
    : ['working','active','summarizing'].includes(status) ? 'in-progress' : 'pending'
}
function receipt(status: string, at: unknown): ToolUIReceipt | undefined {
  const outcome = status === 'completed' ? 'success' : status === 'failed' ? 'failed' : status === 'partial' ? 'partial'
    : ['cancelled','stopped'].includes(status) ? 'cancelled' : undefined
  return outcome && typeof at === 'string' && Number.isFinite(Date.parse(at))
    ? { outcome, summary: labels[status], at: new Date(at).toISOString() } : undefined
}


export function canvasProgress(data: Data, names: Names) {
  const status = text(data.status,'active'), assignments = rows(data.assignments)
  return parseSerializableProgressTracker({ id: text(data.id), steps: [
    ...assignments.map(item => ({ id: text(item.id), label: `${person(names,item.agentId)} · ${text(item.task,'协作任务')} · ${labels[text(item.status)] ?? '等待状态'}`,
      status: stepStatus(text(item.status)), description: item.executionRole === 'verifier' ? '独立证据复核' : '执行并提交报告' })),
    { id: `${text(data.id)}:report`, label: `${person(names,data.coordinatorAgentId)} · ${text(data.title,'协作画布')} · ${labels[status] ?? '等待状态'}`,
      description: text(data.goal), status: stepStatus(status === 'active' && assignments.length ? 'waiting' : status) },
  ], ...(receipt(status,data.updatedAt) ? { choice: receipt(status,data.updatedAt) } : {}) })
}

const knowledgeSourceLabels = {
  matched: '已找到证据', ready: '已读取原文', no_matches: '没有匹配资料',
  no_sources: '暂无可检索资料', processing: '资料处理中', queued: '资料等待处理',
  unavailable: '检索服务不可用', empty: '资料没有可读正文',
} as const

/** Only public source-state vocabulary belongs in the shared tool status row. */
export function knowledgeSourceState(toolName: string, result: unknown) {
  if (!['knowledge.search', 'knowledge.read_source', 'knowledge.list_sources'].includes(toolName)
    || !result || typeof result !== 'object') return undefined
  const status = Reflect.get(result, 'sourceStatus')
  if (typeof status !== 'string' || !Object.hasOwn(knowledgeSourceLabels, status)) return undefined
  return { status, label: knowledgeSourceLabels[status as keyof typeof knowledgeSourceLabels] }
}
