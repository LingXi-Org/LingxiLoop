import type { RunView } from '@lyyzka/lingxios/ui'
import { toolDisplay } from '../../../src/lib/runActivity.js'
import type { HarnessToolPart } from './message-projection.js'
import { visualizeReferences } from './visualize-projection.js'

/** Closed, factual status copy from public state/receipts only. This is never
 * model reasoning, generated answer content, or a promise of successful retry. */
export function observedProgress(view: RunView, tools: readonly HarnessToolPart[], hasText: boolean): string | undefined {
  if (view.requestVersion < 1) return
  if (view.lifecycle === 'queued' && !hasText) return '请求已接收，正在等待处理。'
  const current = tools.filter(tool => tool.activityIdentity?.requestVersion === view.requestVersion && tool.activityIdentity.fence === view.fence)
  const status = (tool: HarnessToolPart) => tool.result && typeof tool.result === 'object' ? Reflect.get(tool.result,'status') : undefined
  const last = current.at(-1)
  const lastTextSeq = Math.max(0,...(view.publicTextParts ?? []).map(part => part.lastSeq))
  if (view.lifecycle === 'leased' && last && status(last) === 'failed' && (last.eventSeq ?? 0) > lastTextSeq) {
    return `${toolDisplay(last.toolName).title}未完成。任务仍在进行，尚未收到后续公开说明。`
  }
  const saved = current.some(tool => ['visualize.save','visualize.chart','visualize.diagram','visualize.sliding_window'].includes(tool.toolName) && status(tool) === 'completed')
  if (saved && !(view.delivery === 'delivered' && view.message?.envelope.requestVersion === view.requestVersion && visualizeReferences(view.message.envelope.body).length)) {
    if (view.message?.envelope.requestVersion === view.requestVersion && visualizeReferences(view.message.envelope.body).length) {
      if (view.delivery === 'failed') return '可视化内容已保存，但答复交付失败，未交付可用的展示引用。'
      return view.delivery === 'pending' ? '可视化展示引用已生成，正在等待答复交付。'
        : '可视化展示引用已生成，但答复交付状态尚未确认。'
    }
    return view.lifecycle === 'leased'
      ? '可视化内容已保存，尚未交付可用的展示引用。'
      : '可视化内容已保存，但本次任务未交付可用的展示引用。'
  }
  if (view.lifecycle === 'leased' && !hasText && !view.message) {
    if (last && last.result === undefined) {
      const display = toolDisplay(last.toolName)
      return `正在${display.title}。${display.purpose}`
    }
    return '任务已开始，尚未收到模型可显示的正文。'
  }
}
