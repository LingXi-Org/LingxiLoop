import type { MessageStatus, ThreadAssistantMessagePart, ToolCallMessagePart } from '@assistant-ui/react'
import { consumeAssistantMessage, createRunView, responseSegments, type AssistantMessage, type RunEvent, type RunView } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'

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
  if (view.draft && (view.lifecycle === 'leased' || view.lifecycle === 'queued')) return [{ type: 'text', text: view.draft }]
  if (!view.message) return view.draft ? [{ type: 'text', text: view.draft }] : []
  // Citation provenance is displayed alongside the answer, without inventing a confidence score.
  const segments = responseSegments(view.message.envelope)
  return [{ type: 'text', text: segments.filter(segment => segment.type !== 'presentation').map(segment => segment.text).join('') },
    ...segments.flatMap((segment): ThreadAssistantMessagePart[] => segment.type === 'presentation' ? [{ type: 'tool-call',
      toolCallId: `presentation:${segment.component.hash}`, toolName: segment.component.type,
      args: segment.component.fields as ToolCallMessagePart['args'], argsText: JSON.stringify(segment.component.fields), result: segment.component }] : [])]
}

export function harnessStatus(view: RunView): MessageStatus {
  if (view.lifecycle === 'queued' || view.lifecycle === 'leased') return { type: 'running' }
  if (view.lifecycle === 'cancelled') return { type: 'incomplete', reason: 'cancelled' }
  if (view.lifecycle === 'failed') return { type: 'incomplete', reason: 'error' }
  switch (view.goalOutcome?.status) {
    case 'awaiting_input': case 'awaiting_approval': case 'delegated': return { type: 'requires-action', reason: 'tool-calls' }
    case 'partial': case 'blocked': return { type: 'incomplete', reason: 'other' }
    case 'satisfied': return { type: 'complete', reason: 'stop' }
    default: return { type: 'running' }
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
    default: return '正在读取状态'
  }
}
