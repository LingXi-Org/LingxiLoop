export function localizeCanvasStatus(status: string): string {
  const labels: Record<string, string> = {
    working: '正在工作',
    editing: '正在编辑',
    viewing: '正在查看',
    queued: '排队中',
    blocked: '等待依赖',
    waiting: '正在复核',
    completed: '已完成',
    failed: '失败',
    cancelled: '已停止',
    offline: '离线',
  }
  return labels[status] ?? status
}
