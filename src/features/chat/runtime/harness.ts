import { consumeAssistantMessage, createRunView, type AssistantMessage, type RunView } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
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

export function mergeHarness(current: RunView, incoming: RunView): RunView {
  if (current.runId !== incoming.runId) throw new Error('运行身份不一致')
  const view = incoming.message && incoming.resultId
    ? consumeAssistantMessage(current,incoming.message,{ resultId: incoming.resultId,fence: incoming.messageFence }) : current
  return { ...view,
    ...(incoming.delivery === 'delivered' && incoming.resultId === view.resultId ? { delivery: 'delivered' } : {}) }
}

export function readHarness(envelope: ImEnvelope): RunView | undefined {
  const data = envelope.payload.data
  if (!data?.harness) return undefined
  const runId = envelope.payload.refs?.runId
  if (typeof runId !== 'string' || envelope.payload.refs?.agentId !== envelope.fromUid) throw new Error('运行结果身份不一致')
  if (typeof data.harnessSessionId !== 'string' || !data.harnessSessionId) throw new Error('运行 session 身份缺失')
  const message: AssistantMessage = { version: 2, runId, agentId: envelope.fromUid, sessionId: data.harnessSessionId,
    ...(envelope.payload.replyToClientMsgNo ? { threadId: envelope.payload.replyToClientMsgNo } : {}),
    body: envelope.payload.body ?? '', envelope: data.harness as AssistantMessage['envelope'] }
  return { ...consumeAssistantMessage(createRunView(runId),message,data.harnessCommit as { resultId: string; fence: number }), delivery: 'delivered' }
}

export function harnessLabel(view: RunView): string {
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
