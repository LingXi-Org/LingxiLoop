import type { CanvasActivity, CanvasAgentAssignment } from '@/features/canvas/contracts'

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
    case 'frame_created': return `创建了 ${title}`
    case 'frame_updated': return `更新了 ${title}`
    case 'frame_deleted': return `删除了 ${title}`
    case 'comment_created': return '留下了反馈'
    case 'agent_status': return status ? `状态更新：${status}` : '更新了工作状态'
    case 'assignment_created': return '在画布中新增了工作'
    case 'assignment_updated': return '补充了新的工作要求'
    case 'handoff': return '把任务和画布上下文移交给了另一位 Agent'
    case 'task_completed': return '完成了任务并提交自检'
    case 'task_failed': return '任务执行失败'
    case 'task_cancelled': return '任务已停止'
    case 'workspace_started': return '启动了协作画布'
    case 'workspace_updated': return '更新了画布状态'
  }
}

export function formatCanvasRelativeTime(value: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(value).getTime())
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}小时前`
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
