/** A read-only public projection, never a second run or interaction owner. */
export interface ConversationRunSummary {
  kind: 'waiting_input' | 'waiting_approval' | 'submitted' | 'processing' | 'queued' | 'delegated' | 'cancelled' | 'completed' | 'partial' | 'failed' | 'unknown'
  actor: 'you' | 'member' | 'system' | 'unknown'
  runId?: string
  agentId?: string
  requestVersion?: number
  fence?: number
}

export function conversationRunSummaryLabel(summary: ConversationRunSummary | null | undefined): string | null {
  if (!summary) return null
  switch (summary.kind) {
    case 'waiting_input': return summary.actor === 'you' ? '等你回答' : summary.actor === 'member' ? '等待成员回答' : '等待补充信息'
    case 'waiting_approval': return summary.actor === 'you' ? '等你审批' : summary.actor === 'member' ? '等待有权限的成员审批' : '等待审批进度'
    case 'submitted': return '已提交待继续'
    case 'processing': return '处理中'
    case 'queued': return '排队中'
    case 'delegated': return '等待协作任务'
    case 'cancelled': return '已取消'
    case 'completed': return '已完成'
    case 'partial': return '部分完成'
    case 'failed': return '执行失败'
    case 'unknown': return '任务状态待刷新'
  }
}

/** A newer local receipt for this exact run may supersede a list-read snapshot;
 * a terminal result from a different loaded run cannot hide an unopened wait. */
export function conversationListRunLabel(summary: ConversationRunSummary, local?: {
  runId: string; requestVersion: number; fence: number; lifecycle: string; label: string | null
}): string | null {
  if (local && summary.runId === local.runId && summary.requestVersion !== undefined && summary.fence !== undefined
    && (local.requestVersion > summary.requestVersion || local.requestVersion === summary.requestVersion && local.fence > summary.fence
      || local.requestVersion === summary.requestVersion && local.fence === summary.fence
        && ['waiting_input', 'waiting_approval', 'submitted', 'processing', 'queued', 'delegated', 'unknown'].includes(summary.kind)
        && ['cancelled', 'failed', 'succeeded', 'partial', 'blocked'].includes(local.lifecycle))) return local.label
  return conversationRunSummaryLabel(summary)
}
