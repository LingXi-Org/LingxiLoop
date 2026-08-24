import type { CanvasActivity, CanvasAgentAssignment } from '@/types'

const TERMINAL_STATUSES = new Set<CanvasAgentAssignment['status']>(['completed', 'failed', 'cancelled'])

export function isCanvasAssignmentActive(status: CanvasAgentAssignment['status']): boolean {
  return !TERMINAL_STATUSES.has(status)
}

export function canvasAssignmentProgress(assignments: CanvasAgentAssignment[]): number {
  if (assignments.length === 0) return 0
  const complete = assignments.filter((assignment) => assignment.status === 'completed').length
  const partial = assignments.filter((assignment) => assignment.status === 'working' || assignment.status === 'waiting').length
  return Math.round(((complete + partial * 0.5) / assignments.length) * 100)
}

export function canvasStatusLabel(status: CanvasAgentAssignment['status']): string {
  return ({
    queued: '排队中',
    blocked: '等待依赖',
    working: '正在工作',
    waiting: '正在复核',
    completed: '已完成',
    failed: '失败',
    cancelled: '已停止',
  } satisfies Record<CanvasAgentAssignment['status'], string>)[status]
}

export function formatCanvasDuration(startedAt: string | null, completedAt: string | null, now = Date.now()): string {
  if (!startedAt) return '尚未开始'
  const elapsed = Math.max(0, new Date(completedAt ?? now).getTime() - new Date(startedAt).getTime())
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours}小时 ${remaining}分钟` : `${hours}小时`
}

export function canvasActivityLabel(activity: CanvasActivity): string {
  const title = typeof activity.detail.title === 'string' ? `“${activity.detail.title}”` : '画板'
  const status = typeof activity.detail.status === 'string' ? activity.detail.status : ''
  switch (activity.action) {
    case 'frame.created': return `创建了 ${title}`
    case 'frame.updated': return `更新了 ${title}`
    case 'frame.content_appended': return `向 ${title} 追加了内容`
    case 'frame.deleted': return `删除了 ${title}`
    case 'comment.created': return '留下了反馈'
    case 'agent.status': return status ? `状态更新：${status}` : '更新了工作状态'
    case 'agent.steered': return '调整了 Agent 的工作方向'
    case 'assignment.completed': return '完成了任务并提交自检'
    case 'assignment.failed': return '任务执行失败'
    case 'assignment.created': return '在画布中新增了工作'
    case 'assignment.restarted': return '重新启动了一项工作'
    case 'assignment.steered': return '补充了新的工作要求'
    default: return activity.action.replaceAll('.', ' · ')
  }
}

export function formatCanvasRelativeTime(value: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(value).getTime())
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}小时前`
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
