import type { ToolCallMessagePart } from '@assistant-ui/react'
import { parseSerializablePlan } from '@/components/tool-ui/plan/schema'
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

export function missionPlan(data: Data, names: Names) {
  const status = text(data.status).toLowerCase(), steps = rows(data.steps)
  return parseSerializablePlan({ id: text(data.id), title: text(data.goal, '学习任务'),
    description: [person(names,data.coordinatorAgentId),text(data.successCriteria),status === 'paused' ? '已暂停' : status === 'planning' ? '规划中' : ''].filter(Boolean).join(' · '),
    todos: steps.length ? steps.map(step => ({ id: text(step.id), label: text(step.description, '学习步骤'),
      description: [text(step.successCriteria),text(step.outcome)].filter(Boolean).join(' · '),
      status: ({ OPEN: 'pending', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled' } as const)[text(step.status) as 'OPEN'] ?? 'pending',
    })) : [{ id: `${text(data.id)}:planning`, label: status === 'planning' ? '制定可检查的学习步骤' : text(data.goal, '学习任务'),
      status: status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'in_progress' }],
    ...(receipt(status,data.updatedAt) ? { receipt: receipt(status,data.updatedAt) } : {}),
  })
}

export function handoffProgress(data: Data, names: Names) {
  const status = text(data.status,'queued')
  return parseSerializableProgressTracker({ id: text(data.id), steps: [{ id: `${text(data.id)}:child`,
    label: `${person(names,data.toAgentId)} · ${text(data.title,'协作任务')} · ${labels[status] ?? '等待状态'}`,
    description: `${person(names,data.fromAgentId)} 派发 · ${labels[status] ?? '等待状态'}`, status: stepStatus(status) }],
    ...(receipt(status,data.updatedAt) ? { choice: receipt(status,data.updatedAt) } : {}),
  })
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

export function knowledgeProgress(id: string, calls: readonly ToolCallMessagePart[], lifecycle: string | null, owner: string) {
  const selected = calls.filter(call => ['knowledge.search','knowledge.read_source','knowledge.list_sources'].includes(call.toolName))
  if (!selected.length) return null
  const sourceStates: Record<string, string> = { matched: '已找到证据', ready: '已读取原文', no_matches: '没有匹配资料',
    no_sources: '暂无可检索资料', processing: '资料处理中', queued: '资料等待处理', unavailable: '检索服务不可用', empty: '资料没有可读正文' }
  return parseSerializableProgressTracker({ id: `knowledge:${id}`, steps: selected.map(call => {
    const result = call.result && typeof call.result === 'object' ? call.result as Data : undefined
    const interrupted = !result && ['failed','cancelled'].includes(lifecycle ?? '')
    const failed = call.isError || result?.status === 'failed' || result?.sourceStatus === 'unavailable'
    const statusText = interrupted ? lifecycle === 'cancelled' ? '已取消' : '执行中断'
      : sourceStates[text(result?.sourceStatus)] ?? (failed ? '检索未完成' : result ? '已完成' : '检索中')
    return { id: call.toolCallId, label: `${owner} · ${call.toolName === 'knowledge.search' ? '检索课程资料' : call.toolName === 'knowledge.read_source' ? '阅读资料原文' : '查看课程资料'} · ${statusText}`,
      status: failed || interrupted ? 'failed' : result ? 'completed' : 'in-progress',
    }
  }) })
}
