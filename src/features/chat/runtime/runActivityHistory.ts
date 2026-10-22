import type { ThreadAssistantMessagePart, ThreadMessage } from '@assistant-ui/react'
import { z } from 'zod'
import { nativeMessageSchema, deserializeMessage } from '@/lib/nativeMessage'
import { activityAnnotation } from '@/lib/runActivity'
import type { AgentRunTarget } from './harness-api'

const watermarkSchema = z.object({ runId: z.string().min(1), requestVersion: z.number().int().nonnegative().safe(),
  fence: z.number().int().nonnegative().safe(), messageFence: z.number().int().nonnegative().safe(), lastSeq: z.number().int().nonnegative().safe() })
const historySchema = z.object({ total: z.number().int().nonnegative().safe(), attention: z.number().int().nonnegative().safe() })
const pageSchema = z.object({ message: nativeMessageSchema, total: z.number().int().nonnegative().safe(), nextOffset: z.number().int().nonnegative().safe().nullable() }).strict()
const ERROR = '过程记录暂时无法加载，请重试。'

export interface HistoryActivityEntry {
  id: string
  part: ThreadAssistantMessagePart
  message: ThreadMessage
  order?: number
  revision?: number
  readOnly: true
  sequence: number
}
export interface ActivityHistoryContext {
  scope: string
  sequence: number
  total: number
  message: ThreadMessage
  target: AgentRunTarget
}
export interface ActivityHistoryRequest { token: symbol; scope: string; sequence: number; offset: number }
export interface ActivityHistoryState {
  scope: string | null
  sequence: number
  records: readonly HistoryActivityEntry[]
  nextOffset: number | null
  total: number
  liveTotal: number
  passSequence: number
  refreshNeeded: boolean
  request: ActivityHistoryRequest | null
  error: string | null
}

function watermark(message: ThreadMessage | ReturnType<typeof nativeMessageSchema.parse>, target: AgentRunTarget) {
  const value = watermarkSchema.safeParse(message.metadata.custom.harness)
  if (message.role !== 'assistant' || message.id !== `run-${target.runId}` || message.metadata.custom.runId !== target.runId
    || !value.success || value.data.runId !== target.runId) return null
  return value.data
}
function scope(target: AgentRunTarget, view: z.infer<typeof watermarkSchema>) {
  return JSON.stringify([target.conversationId, target.agentId, target.threadId ?? null, target.runId, view.requestVersion, view.fence, view.messageFence])
}

/** Pages are presentation data. Their native message never enters the live message store. */
export function parseActivityPage(input: unknown, target: AgentRunTarget, offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error(ERROR)
  const page = pageSchema.parse(input)
  const view = watermark(page.message, target)
  const count = page.message.content.length, end = offset + count
  const annotations = page.message.content.map(activityAnnotation)
  if (!view || count > 40 || end > page.total && count > 0
    || page.nextOffset !== (end < page.total ? end : null) || page.nextOffset !== null && !count
    || annotations.some(annotation => !annotation || annotation.purpose === 'result' || !['tool','commentary','attention'].includes(annotation.kind))
    || new Set(annotations.map(annotation => annotation?.id)).size !== count) throw new Error(ERROR)
  return { ...page, scope: scope(target, view), sequence: view.lastSeq }
}
export type ActivityHistoryPage = ReturnType<typeof parseActivityPage>

export function activityHistoryContext(target: AgentRunTarget | undefined, message: ThreadMessage): ActivityHistoryContext | null {
  if (!target) return null
  const view = watermark(message, target), history = historySchema.safeParse(message.metadata.custom.activityHistory)
  if (!view || !history.success || history.data.total === 0) return null
  return { scope: scope(target,view), sequence: view.lastSeq, total: history.data.total, message, target }
}

function entry(message: ThreadMessage, part: ThreadAssistantMessagePart): HistoryActivityEntry | null {
  const annotation = activityAnnotation(part)
  if (!annotation || annotation.purpose === 'result' || !['tool','commentary','attention'].includes(annotation.kind)) return null
  const order = 'order' in annotation && typeof annotation.order === 'number' ? annotation.order : undefined
  const revision = 'revision' in annotation && typeof annotation.revision === 'number' ? annotation.revision : undefined
  // Do not carry page control/harness state into live presentation. Status is kept
  // factual; read-only providers and the existing readOnly prop prohibit actions.
  const sequence = watermarkSchema.parse(message.metadata.custom.harness).lastSeq
  return { id: annotation.id, part, order, revision, readOnly: true, sequence,
    message: { ...message, content: [part], metadata: { ...message.metadata, custom: { ...message.metadata.custom, harnessControl: false } } } as ThreadMessage }
}
function liveEntries(context: ActivityHistoryContext) {
  return context.message.content.flatMap(part => {
    const value = entry(context.message,part as ThreadAssistantMessagePart)
    return value ? [value] : []
  })
}
function merge(records: readonly HistoryActivityEntry[], incoming: readonly HistoryActivityEntry[], context: ActivityHistoryContext) {
  const entries = new Map(records.map(record => [record.id,record]))
  for (const value of incoming) {
    const previous = entries.get(value.id)
    if (!previous || value.sequence >= previous.sequence && (previous.revision === undefined
      ? value.sequence > previous.sequence || value.revision !== undefined
      : value.revision !== undefined && value.revision > previous.revision)) entries.set(value.id,value)
  }
  // A page is never authoritative for any currently displayed identity, including
  // same-sequence approval changes. Retain that value if the live window moves on.
  for (const value of liveEntries(context)) if (entries.has(value.id)) entries.set(value.id,value)
  const result = [...entries.values()]
  // Legacy annotations have no event ordering. Preserve their server page order.
  if (result.every(value => value.order !== undefined)) result.sort((a,b) => a.order! - b.order!)
  return result
}

export function initialActivityHistory(context: ActivityHistoryContext | null): ActivityHistoryState {
  return { scope: context?.scope ?? null, sequence: context?.sequence ?? -1, records: [], nextOffset: context ? 0 : null,
    total: context?.total ?? 0, liveTotal: context?.total ?? 0, passSequence: context?.sequence ?? -1, refreshNeeded: false, request: null, error: null }
}
export function syncActivityHistory(state: ActivityHistoryState, context: ActivityHistoryContext | null): ActivityHistoryState {
  if (state.scope !== (context?.scope ?? null) || context && context.sequence < state.sequence) return initialActivityHistory(context)
  if (!context) return state
  const changed = state.sequence !== context.sequence || state.liveTotal !== context.total
  const restarting = changed && state.nextOffset === null
  return { ...state, sequence: context.sequence, liveTotal: context.total, total: Math.max(state.total,context.total), records: merge(state.records, [], context),
    ...(restarting ? { nextOffset: 0, refreshNeeded: false, passSequence: context.sequence, error: null }
      : changed && (state.nextOffset !== 0 || state.request) ? { refreshNeeded: true } : {}) }
}
export function beginActivityHistoryRequest(state: ActivityHistoryState, context: ActivityHistoryContext | null, token: symbol): ActivityHistoryState {
  if (!context || state.scope !== context.scope || state.sequence !== context.sequence || state.request || state.nextOffset === null) return state
  return { ...state, ...(state.nextOffset === 0 ? { passSequence: context.sequence, refreshNeeded: false } : {}),
    request: { token, scope: context.scope, sequence: context.sequence, offset: state.nextOffset }, error: null }
}
function ownsRequest(state: ActivityHistoryState, context: ActivityHistoryContext | null, request: ActivityHistoryRequest) {
  return context && request.token === state.request?.token && request.scope === context.scope && request.sequence <= context.sequence
}
export function finishActivityHistoryRequest(state: ActivityHistoryState, context: ActivityHistoryContext | null, request: ActivityHistoryRequest, page: ActivityHistoryPage): ActivityHistoryState {
  if (!ownsRequest(state,context,request) || !context) return state
  if (page.scope !== request.scope || page.sequence < request.sequence) return failActivityHistoryRequest(state,context,request)
  const message = deserializeMessage(page.message)
  const incoming = message.content.flatMap(part => { const value = entry(message,part as ThreadAssistantMessagePart); return value ? [value] : [] })
  // The first verified REST page anchors this read-only traversal. The live
  // stream may legitimately lag behind a stable API snapshot; anchoring to it
  // would restart every completed pass forever. Later page/live changes still
  // request one explicit follow-up pass to cover possible inserted records.
  const firstPage = request.offset === 0
  const passSequence = firstPage ? page.sequence : state.passSequence
  const refreshNeeded = (!firstPage && state.refreshNeeded) || page.sequence !== passSequence || page.sequence < context.sequence
  return { ...state, passSequence, records: merge(state.records,incoming,context),
    nextOffset: page.nextOffset === null && refreshNeeded ? 0 : page.nextOffset,
    total: Math.max(context.total,page.total), refreshNeeded, request: null, error: null }
}
export function failActivityHistoryRequest(state: ActivityHistoryState, context: ActivityHistoryContext | null, request: ActivityHistoryRequest): ActivityHistoryState {
  return ownsRequest(state,context,request) ? { ...state, request: null, error: ERROR } : state
}

/** The live renderer owns duplicate identities and all current attention. */
export function historyOnlyEntries(state: ActivityHistoryState, message: ThreadMessage): readonly HistoryActivityEntry[] {
  const live = new Set(message.content.map(part => activityAnnotation(part)?.id).filter(Boolean))
  return state.records.filter(record => !live.has(record.id))
}
