import type { ThreadMessage } from '@assistant-ui/react'
import { harnessLabel } from './harness'
import type { LingxiMessageMetadata } from './model'

/** Durable loaded run state only. Typing indicators cannot assert a human wait
 * or a successful outcome; role names are never inferred from an approval. */
export function conversationRunStatus(messages: readonly ThreadMessage[]): string | null {
  const runs = messages.filter(message => message.role === 'assistant' && message.metadata.custom.harness)
    .map(message => message.metadata.custom as LingxiMessageMetadata).reverse()
  const relevant = runs.find(meta => meta.unresolvedActions?.length)
    ?? runs.find(meta => meta.harness?.lifecycle === 'waiting')
    ?? runs.find(meta => ['leased', 'queued'].includes(meta.harness?.lifecycle ?? ''))
    ?? runs[0]
  if (!relevant?.harness) return null
  if (relevant.runConnection === 'inaccessible') return '已无访问权限'
  if (relevant.runConnection === 'unauthenticated') return '登录已失效'
  if (relevant.runConnection === 'released') return '进度待刷新'
  if (relevant.unresolvedActions?.length) return '结果待核对'
  const view = relevant.harness
  if (view.lifecycle === 'waiting') {
    if (view.goalOutcome?.status === 'awaiting_input') return relevant.harnessControl ? '等你回答' : '等待成员回答'
    if (view.goalOutcome?.status === 'awaiting_approval') return relevant.harnessControl ? '等你审批' : '等待有权限的成员审批'
  }
  return harnessLabel(view)
}
