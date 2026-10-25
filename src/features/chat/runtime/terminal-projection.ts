import type { ThreadMessage } from '@assistant-ui/react'
import { getLingxiMessageMetadata as metadata, messageText } from './model'
import { isRunMessage } from './harness'
import { terminalFeedbackScopeSchema } from '@/lib/terminalFeedback'

/** A terminal IM receipt and the run snapshot describe the same outcome.
 * Keep the canonical messages intact; fold only an exact match into its run's
 * existing error/cancellation display before selecting regeneration branches. */
export function projectRunTerminals(messages: readonly ThreadMessage[]): ThreadMessage[] {
  const key = (message: ThreadMessage, version: number, status: string) => {
    const value = metadata(message)
    return JSON.stringify([value.conversationId, value.senderId, value.threadRootId, value.runId, version, status])
  }
  const runs = new Map<string, ThreadMessage>()
  for (const message of messages) {
    const value = metadata(message), view = value.harness
    if (message.role !== 'assistant' || !isRunMessage(value) || !view || view.runId !== value.runId
      || message.id !== `run-${value.runId}` || !['failed', 'cancelled', 'succeeded'].includes(view.lifecycle ?? '')
      || message.status?.type !== 'incomplete' || !['error', 'cancelled'].includes(message.status.reason)) continue
    const status = message.status.reason === 'cancelled' ? 'cancelled' : 'failed'
    if (view.lifecycle === 'succeeded') {
      const feedback = value.terminalFeedback
      if (!feedback || typeof feedback !== 'object' || Reflect.get(feedback, 'requestVersion') !== view.requestVersion
        || Reflect.get(feedback, 'status') !== status) continue
    } else if (view.lifecycle !== status) continue
    runs.set(key(message, view.requestVersion, status), message)
  }
  type Notice = NonNullable<ReturnType<typeof metadata>['terminalNotice']>
  const candidates = new Map<string, { messageId: string; notice: Notice }[]>()
  for (const message of messages) {
    const value = metadata(message), version = value.requestVersion, id = value.terminalFeedbackId, status = value.terminalStatus
    if (message.role !== 'system' || value.senderKind !== 'system' || !value.runId
      || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1
      || typeof id !== 'string' || !id || message.id !== `terminal-${id}` || value.clientMessageId !== message.id
      || (status !== 'failed' && status !== 'cancelled')) continue
    const run = runs.get(key(message, version, status)), text = messageText(message).trim()
    if (!run || !text) continue
    const feedback = metadata(run).terminalFeedback
    if (feedback !== undefined && (!feedback || typeof feedback !== 'object'
      || Reflect.get(feedback, 'id') !== id || Reflect.get(feedback, 'requestVersion') !== version
      || Reflect.get(feedback, 'status') !== status)) continue
    const scope = terminalFeedbackScopeSchema.safeParse({ scopeVersion: value.terminalScopeVersion, scope: value.terminalScope })
    candidates.set(run.id, [...(candidates.get(run.id) ?? []), { messageId: message.id,
      notice: { id, text, runId: value.runId, requestVersion: version, status, ...(scope.success ? scope.data : {}) } }])
  }
  const details = new Map<string, Notice>(), hidden = new Set<string>()
  for (const [runId, receipts] of candidates) {
    // A conflicting feedback identity is evidence to retain, not guess away.
    if (new Set(receipts.map(receipt => receipt.notice.id)).size !== 1) continue
    details.set(runId, receipts[0].notice)
    for (const receipt of receipts) hidden.add(receipt.messageId)
  }
  return messages.filter(message => !hidden.has(message.id)).map(message => {
    const terminalNotice = details.get(message.id)
    const value = metadata(message), previous = value.terminalNotice, view = value.harness
    const stale = previous && (!view || value.runId !== previous.runId || view.requestVersion !== previous.requestVersion
      || message.status?.type !== 'incomplete' || message.status.reason !== (previous.status === 'cancelled' ? 'cancelled' : 'error'))
    if (!terminalNotice && !stale) return message
    const { terminalNotice: _previous, ...custom } = message.metadata.custom
    return { ...message, metadata: { ...message.metadata,
      custom: { ...custom, ...(terminalNotice ? { terminalNotice } : {}) } } } as ThreadMessage
  })
}
