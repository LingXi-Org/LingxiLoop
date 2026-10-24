import type { ThreadMessage } from '@assistant-ui/react'
import { getLingxiMessageMetadata as metadata, messageText } from './model'
import { isRunMessage } from './harness'

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
      || message.id !== `run-${value.runId}` || (view.lifecycle !== 'failed' && view.lifecycle !== 'cancelled')
      || message.status?.type !== 'incomplete' || message.status.reason !== (view.lifecycle === 'cancelled' ? 'cancelled' : 'error')) continue
    runs.set(key(message, view.requestVersion, view.lifecycle), message)
  }
  const candidates = new Map<string, { messageId: string; id: string; text: string }[]>()
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
    candidates.set(run.id, [...(candidates.get(run.id) ?? []), { messageId: message.id, id, text }])
  }
  const details = new Map<string, { id: string; text: string }>(), hidden = new Set<string>()
  for (const [runId, receipts] of candidates) {
    // A conflicting feedback identity is evidence to retain, not guess away.
    if (new Set(receipts.map(receipt => receipt.id)).size !== 1) continue
    const { id, text } = receipts[0]
    details.set(runId, { id, text })
    for (const receipt of receipts) hidden.add(receipt.messageId)
  }
  return messages.filter(message => !hidden.has(message.id)).map(message => {
    const terminalNotice = details.get(message.id)
    return terminalNotice ? { ...message, metadata: { ...message.metadata,
      custom: { ...message.metadata.custom, terminalNotice } } } as ThreadMessage : message
  })
}
