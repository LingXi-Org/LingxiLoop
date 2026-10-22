import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import type { LingxiMessageMetadata } from './model'

/** chat.send messages can share a run ID without owning that run's preview or lifecycle. */
export function isRunMessage(metadata: LingxiMessageMetadata): boolean {
  return metadata.senderKind === 'agent' && metadata.messageKind === 'text' && Boolean(metadata.runId && metadata.harness)
}

export function canCancelRun(metadata: LingxiMessageMetadata): boolean {
  return metadata.harnessControl === true && Boolean(metadata.runId)
    && metadata.messageKind === 'text'
    && ['queued', 'leased', 'waiting'].includes(metadata.harness?.lifecycle ?? '')
}

export function isOlderRun(current: RunDisplayState, incoming: RunDisplayState): boolean {
  if (current.runId !== incoming.runId) throw new Error('运行身份不一致')
  return incoming.requestVersion < current.requestVersion || incoming.fence < current.fence
    || incoming.messageFence < current.messageFence || incoming.lastSeq < current.lastSeq
}

export function harnessLabel(view: RunDisplayState): string {
  if (view.lifecycle === 'cancelled') return '已取消'
  if (view.lifecycle === 'failed') return '执行失败'
  if (view.lifecycle === 'queued') return '排队中'
  if (view.lifecycle === 'leased') return '执行中'
  switch (view.goalOutcome?.status) {
    case 'satisfied': return '已完成'
    case 'partial': return '部分完成'
    case 'blocked': return '需要处理'
    case 'awaiting_input': return '等待补充信息'
    case 'awaiting_approval': return '等待审批'
    case 'delegated': return '等待协作任务'
    default: return view.lifecycle === 'succeeded' ? '未完成' : '处理中'
  }
}

export function harnessFailure(reason: string): string {
  const messages: Record<string, string> = {
    'Model call, token, cost or execution-time budget exhausted': '本次请求超出处理限制，请缩小范围后重试。',
    'Tool execution timed out': '操作超时，请重试。',
    'The operation was aborted due to timeout': '回复生成超时，请重试。',
  }
  if (reason.startsWith('Model provider request failed')) return '服务暂时不可用，请稍后重试。'
  return messages[reason] ?? '消息生成失败，请稍后重试。'
}
