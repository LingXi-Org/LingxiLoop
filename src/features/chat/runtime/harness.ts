import type { MessageStatus, ThreadAssistantMessagePart, ToolCallMessagePart } from '@assistant-ui/react'
import { consumeAssistantMessage, createRunView, responseSegments, type AssistantMessage, type RunEvent, type RunView } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
import type { LingxiMessageMetadata } from './model'

export function canCancelRun(metadata: LingxiMessageMetadata): boolean {
  return metadata.harnessControl === true && Boolean(metadata.runId)
    && metadata.messageKind === 'text'
    && ['queued', 'leased', 'waiting'].includes(metadata.harness?.lifecycle ?? '')
}

/** Display projection only: lifecycle, preview and results remain in the native RunView. */
export function harnessToolParts(runId: string, events: readonly RunEvent[], current: readonly ToolCallMessagePart[] = []): ToolCallMessagePart[] {
  const calls = new Map(current.map(part => [part.toolCallId,part]))
  for (const event of events) {
    if (event.runId !== runId || event.visibility !== 'user') continue
    const id = event.data.toolCallId
    if (typeof id !== 'string' || !id.startsWith('host:')) continue
    if (event.kind === 'tool.started' && typeof event.data.name === 'string' && !calls.has(id)) {
      calls.set(id,{ type: 'tool-call',toolCallId: id,toolName: event.data.name,args: {},argsText: '{}' })
    }
    const previous = calls.get(id)
    if (event.kind === 'tool.completed' && previous && event.data.result && typeof event.data.result === 'object') {
      // The timeline needs status only; do not duplicate tool payloads in the message store.
      calls.set(id,{ ...previous,result: { status: Reflect.get(event.data.result,'status') },isError: event.data.isError === true })
    }
  }
  return [...calls.values()].slice(-256)
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

export function harnessParts(view: RunView): ThreadAssistantMessagePart[] {
  if (view.lifecycle === 'failed' && !view.message) return []
  if (view.draft && (view.lifecycle === 'leased' || view.lifecycle === 'queued')) return [{ type: 'text', text: view.draft }]
  if (!view.message) return view.draft ? [{ type: 'text', text: view.draft }] : []
  // Citation provenance is displayed alongside the answer, without inventing a confidence score.
  const segments = responseSegments(view.message.envelope)
  const parts: ThreadAssistantMessagePart[] = []
  for (const segment of segments) {
    if (segment.type === 'presentation') parts.push({ type: 'tool-call',
      toolCallId: `presentation:${segment.component.hash}`, toolName: segment.component.type,
      args: segment.component.fields as ToolCallMessagePart['args'], argsText: JSON.stringify(segment.component.fields), result: segment.component })
    else {
      const previous = parts.at(-1)
      if (previous?.type === 'text') parts[parts.length - 1] = { ...previous, text: previous.text + segment.text }
      else if (segment.text) parts.push({ type: 'text', text: segment.text })
    }
  }
  return parts
}

export function harnessStatus(view: RunView): MessageStatus {
  if (view.lifecycle === 'queued' || view.lifecycle === 'leased') return { type: 'running' }
  if (view.lifecycle === 'cancelled') return { type: 'incomplete', reason: 'cancelled' }
  if (view.lifecycle === 'failed') return { type: 'incomplete', reason: 'error' }
  switch (view.goalOutcome?.status) {
    case 'awaiting_input': case 'awaiting_approval': case 'delegated': return { type: 'requires-action', reason: 'tool-calls' }
    case 'partial': case 'blocked': return { type: 'incomplete', reason: 'other' }
    case 'satisfied': return { type: 'complete', reason: 'stop' }
    default: return view.lifecycle === 'succeeded' ? { type: 'incomplete', reason: 'error' } : { type: 'running' }
  }
}

export function harnessLabel(view: RunView): string {
  if (view.lifecycle === 'cancelled') return '已取消'
  if (view.lifecycle === 'failed') return '执行失败'
  if (view.lifecycle === 'queued') return '排队中'
  if (view.lifecycle === 'leased') return view.draft ? '正文草稿' : '执行中'
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
