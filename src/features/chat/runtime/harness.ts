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
    default: return view.lifecycle === 'succeeded' ? '结果状态缺失' : '正在读取状态'
  }
}

export function harnessFailure(reason: string): string {
  const messages: Record<string, string> = {
    'Model call, token, cost or execution-time budget exhausted': '本次执行的模型调用、字数、费用或时间预算已耗尽。',
    'Content acceptance correction budget exhausted': '答复仍有未满足的要求，内容修正次数已用尽。',
    'Final assessment protocol correction exhausted': '模型未能按要求生成有效的答复格式，修正次数已用尽。',
    'Final response assessment is invalid': '答复的完成情况检查格式无效，尚未验证全部要求。',
    'Tool protocol correction exhausted': '模型未能生成有效的工具调用，修正次数已用尽。',
    'Tool execution failed after bounded correction': '工具执行失败，修正次数已用尽。',
    'Tool execution timed out': '工具执行超时。',
    'No valid answer was produced for the current request': '本次请求没有生成可交付的有效答复。',
    'Model returned an invalid response format': '模型返回了无效的答复格式。',
  }
  if (reason.startsWith('Model provider request failed')) return `模型服务请求失败${reason.match(/\(HTTP \d+\)/)?.[0] ?? ''}。`
  return messages[reason] ?? reason.slice(0,2000)
}
