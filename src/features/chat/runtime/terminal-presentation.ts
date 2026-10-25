import type { ThreadMessage } from '@assistant-ui/react'
import { activityAnnotation } from '@/lib/runActivity'
import { terminalFeedbackScopeSchema, type TerminalScope } from '@/lib/terminalFeedback'
import { harnessFailure } from './harness'
import type { LingxiMessageMetadata } from './model'

export function currentTerminalNotice(value: Partial<LingxiMessageMetadata>) {
  const notice = value.terminalNotice, view = value.harness
  return notice && view && value.runId === view.runId && notice.runId === view.runId
    && notice.requestVersion === view.requestVersion ? notice : undefined
}

/** Public terminal evidence owns the failure scope. Body text can establish an
 * unfinished preview, never successful commitment or delivery. */
export function terminalFailurePresentation(message: ThreadMessage) {
  if (message.role !== 'assistant' || message.status?.type !== 'incomplete' || !['error', 'cancelled'].includes(message.status.reason)) return null
  const cancelled = message.status.reason === 'cancelled', status = cancelled ? 'cancelled' : 'failed'
  const value = message.metadata.custom as Partial<LingxiMessageMetadata>, view = value.harness
  const notice = currentTerminalNotice(value)
  const feedback = value.terminalFeedback
  const matched = view && value.runId === view.runId && ['failed', 'cancelled', 'succeeded'].includes(view.lifecycle ?? '')
    && feedback && typeof feedback === 'object' && Reflect.get(feedback, 'requestVersion') === view.requestVersion
    && Reflect.get(feedback, 'status') === status && typeof Reflect.get(feedback, 'id') === 'string' ? feedback : undefined
  const evidence = matched ?? (notice?.status === status ? notice : undefined)
  const parsed = terminalFeedbackScopeSchema.safeParse(evidence && {
    scopeVersion: Reflect.get(evidence, 'scopeVersion'), scope: Reflect.get(evidence, 'scope'),
  })
  const scope: TerminalScope = parsed.success ? parsed.data.scope : 'unknown'
  const preview = message.content.some(part => part.type === 'text' && part.text.trim()
    && (!activityAnnotation(part) || activityAnnotation(part)?.kind === 'answer'))
  const partial = view && value.runId === view.runId && view.goalOutcome?.requestVersion === view.requestVersion
    && ['partial', 'blocked'].includes(view.goalOutcome.status)
  const titles: Record<TerminalScope, string> = {
    response: cancelled ? '回复已取消' : preview ? '回复未完成' : '回复生成失败',
    follow_up: cancelled ? '回答已生成，后续协作已取消' : '回答已生成，后续协作未完成',
    delivery: '答复投递未完成', finalization: '答复已发送，收尾未完成', unknown: cancelled ? '本轮执行已取消' : '本轮执行未完成',
  }
  const labels: Record<TerminalScope, string> = {
    response: cancelled ? '已取消' : '回复未完成', follow_up: cancelled ? '后续协作已取消' : '后续协作未完成',
    delivery: '投递未完成', finalization: '收尾未完成', unknown: cancelled ? '已取消' : '执行未完成',
  }
  const publicText = matched && typeof Reflect.get(matched, 'text') === 'string' ? String(Reflect.get(matched, 'text')) : undefined
  const title = !parsed.success && !view ? preview ? '回复未完成' : '回复生成失败' : partial && scope === 'unknown' ? '答复尚未完成' : titles[scope]
  return { title, statusLabel: partial && scope === 'unknown' ? '答复尚未完成' : labels[scope],
    detail: publicText ?? notice?.text ?? (value.harnessError ? harnessFailure(value.harnessError) : '本轮执行未完成。已完成的操作会保留，请先刷新进度核对结果。'),
    recovery: scope === 'response' || !view || partial && scope === 'unknown' ? 'regenerate' as const
      : scope === 'delivery' ? 'delivery' as const : 'refresh' as const,
  }
}
