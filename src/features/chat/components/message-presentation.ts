import type { ThreadMessage, ToolCallMessagePart } from '@assistant-ui/react'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { activityAnnotation } from '@/lib/runActivity'
import { hasQuestionnaireWait } from '../runtime/questionnaire-wait'

type Message = Pick<ThreadMessage, 'id' | 'role' | 'content' | 'metadata' | 'status'>
export type MessageRegion = 'body' | 'process' | 'attention'
export type InputOwner = { type: 'none' | 'questionnaire' | 'harness' } | { type: 'tool'; toolCallId: string }
const resultStatus = (part: ToolCallMessagePart) => part.result && typeof part.result === 'object' ? Reflect.get(part.result, 'status') : undefined
const currentView = (message: Message) => message.metadata.custom.harness as RunDisplayState | undefined
const currentPart = (message: Message, part: unknown) => {
  const version = activityAnnotation(part)?.requestVersion
  return version === undefined || version === currentView(message)?.requestVersion
}
const active = (message: Message) => {
  const view = currentView(message)
  return message.status?.type === 'requires-action' && (!view || ['queued', 'leased', 'waiting'].includes(view.lifecycle ?? ''))
    && (!view?.runId || view.runId === message.metadata.custom.runId)
}

/** Identity belongs to the current run, never the wording of a question. */
export function inputOwner(message: Message): InputOwner {
  if (!active(message)) return { type: 'none' }
  if (hasQuestionnaireWait(message.metadata.custom)) return { type: 'questionnaire' }
  const view = currentView(message)
  const awaitingInput = view?.goalOutcome?.status === 'awaiting_input'
  if (view?.goalOutcome?.status === 'awaiting_approval') return { type: 'none' }
  const candidates = message.content.filter((part): part is ToolCallMessagePart => part.type === 'tool-call'
    && Boolean(part.interrupt) && currentPart(message, part) && !['completed', 'failed', 'cancelled'].includes(String(resultStatus(part))))
  const ids = [...new Set(candidates.map(part => part.toolCallId))]
  if (ids.length === 1) return { type: 'tool', toolCallId: ids[0]! }
  return { type: awaitingInput ? 'harness' : 'none' }
}

export function ownsApproval(message: Message, toolCallId: string, approvalId: string): boolean {
  if (!active(message)) return false
  const outcome = currentView(message)?.goalOutcome
  if (outcome?.status === 'awaiting_approval' && outcome.approvalId !== approvalId) return false
  const owner = message.content.find(part => part.type === 'tool-call' && part.approval?.id === approvalId
    && part.approval.approved === undefined && !part.approval.resolution && currentPart(message, part))
  return owner?.type === 'tool-call' && owner.toolCallId === toolCallId
}

function pendingTool(message: Message, part: ToolCallMessagePart): boolean {
  if (!active(message) || !currentPart(message, part)) return false
  if (part.interrupt && !['completed', 'failed', 'cancelled'].includes(String(resultStatus(part)))) return true
  return !!part.approval && ownsApproval(message, part.toolCallId, part.approval.id)
}

/** Old structured results have no declared purpose. Their existence is not consent to hide them. */
function unclassifiedResult(part: ToolCallMessagePart): boolean {
  return Boolean(part.result && typeof part.result === 'object'
    && ['memory', 'sources', 'value', 'presentation', 'artifacts', 'message'].some(key => Reflect.has(part.result as object, key)))
}

export function messagePresentation(message: Message) {
  const view = currentView(message)
  const recovered = view?.lifecycle === 'succeeded' && view.goalOutcome?.status === 'satisfied'
  return message.content.map((part, index) => {
    const annotation = activityAnnotation(part)
    let region: MessageRegion = 'body'
    if (message.role === 'assistant') {
      if (part.type === 'tool-call') {
        const failed = part.isError || resultStatus(part) === 'failed'
        if (pendingTool(message, part) || resultStatus(part) === 'unknown' || failed && !recovered) region = 'attention'
        else if (annotation?.purpose === 'result' || annotation?.kind === 'result' || annotation?.kind === 'answer') region = 'body'
        else if (annotation?.purpose === 'process' || annotation && !unclassifiedResult(part)) region = 'process'
      } else if (annotation?.kind === 'attention') region = 'attention'
      else if (annotation?.purpose === 'result') region = 'body'
      else if (annotation?.purpose === 'process' || annotation?.kind === 'commentary') region = 'process'
    }
    const identity = annotation?.id ?? (part.type === 'tool-call' ? `tool:${part.toolCallId}` : `index:${index}`)
    return { index, part, annotation, region, key: JSON.stringify([message.id, view?.requestVersion ?? null, identity]) }
  })
}

/** Unknown legacy order is not a timestamp. Keep its server slot while sorting known events. */
export function orderActivityEntries<T extends { order?: number }>(entries: readonly T[]): T[] {
  const ordered = entries.filter(entry => entry.order !== undefined).sort((left, right) => left.order! - right.order!)
  let index = 0
  return entries.map(entry => entry.order === undefined ? entry : ordered[index++]!)
}
