import { createHash } from 'node:crypto'
import type { RunView } from '@lyyzka/lingxios/ui'
import { publicText,toolDisplay,toolDisplaySchema } from '../../../src/lib/runActivity.js'
import type { RunTrace,TraceSpan,TraceStatus } from '../../../src/lib/runTrace.js'
import type { HarnessToolPart } from './message-projection.js'

export interface PublicLlmTrace {
  id: string; model: string; status: 'complete'|'error'; durationMs: number|null
  tokensIn: number|null; tokensOut: number|null; cost: number|null; costEstimated: boolean
}
const opaque = (id: string) => createHash('sha256').update(id).digest('hex').slice(0,24)
const number = (value: unknown): number|null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const safe = (value: unknown): string|undefined => { const parsed = publicText.safeParse(value); return parsed.success ? parsed.data : undefined }
function status(lifecycle: RunView['lifecycle']): TraceStatus {
  return lifecycle === 'leased' || lifecycle === 'queued' ? 'running' : lifecycle === 'waiting' ? 'waiting'
    : lifecycle === 'succeeded' ? 'complete' : lifecycle === 'cancelled' ? 'cancelled' : lifecycle === 'failed' ? 'error' : 'unknown'
}

export function nativeTraceMatchesState(snapshot: import('@lyyzka/lingxios').RunTraceSnapshot,view: Pick<RunView,'runId'|'fence'|'requestVersion'|'lifecycle'>): boolean {
  const root = snapshot.spans.find(span=>span.spanId === snapshot.rootSpanId && span.kind === 'agent' && span.runId === view.runId)
  return snapshot.runId === view.runId && snapshot.fence === view.fence && snapshot.requestVersion === view.requestVersion
    && (root?.state === 'failed' ? 'error' : root?.state) === status(view.lifecycle)
}

/** Only existing public tool displays and the scoped product usage ledger enter this DTO.
 * Native events have no timestamp; their seq/arrival time is never a clock. */
export function buildRunTrace(input: { runId: string; createdAt: string; lifecycle: RunView['lifecycle'];
  tools: readonly HarnessToolPart[]; llm: readonly PublicLlmTrace[]; presentationAvailable?: boolean }): RunTrace {
  const parsed = Date.parse(input.createdAt), startedAt = number(parsed)
  const rootStatus = status(input.lifecycle)
  const relative = (value: unknown) => { const time = number(value); return startedAt !== null && time !== null && time >= startedAt ? time-startedAt : null }
  const children: TraceSpan[] = []
  const unique = [...new Map(input.tools.map(tool => [tool.toolCallId,tool])).values()]
  for (const tool of unique) {
    const raw = tool.result && typeof tool.result === 'object' ? Reflect.get(tool.result,'status') : undefined
    const state: TraceStatus = raw === 'completed' ? 'complete' : raw === 'failed' || tool.isError ? 'error'
      : raw === 'cancelled' ? 'cancelled' : raw === 'unknown' ? 'unknown' : tool.approval || tool.interrupt ? 'waiting'
      : rootStatus === 'complete' ? 'unknown' : rootStatus
    const display = toolDisplaySchema.safeParse(tool.display)
    const label = toolDisplay(tool.toolName,raw)
    const info = display.success ? display.data : label
    const start = relative(tool.timing?.startedAt),endValue = relative(tool.timing?.completedAt)
    const end = start !== null && endValue !== null && endValue >= start ? endValue : null
    const durationMs = tool.timing?.completedAt !== undefined ? number(tool.timing.completedAt-tool.timing.startedAt) : null
    children.push({ id: `tool-${opaque(tool.toolCallId)}`,name: safe(info.title)?.slice(0,160) ?? label.title,kind: 'tool',status: state,
      start,end,durationMs,detail: safe(info.purpose),
      ...(info.input?.length ? { input: info.input.filter(field => safe(field.value)) } : {}),
      ...(safe(info.summary) ? { output: safe(info.summary) } : {}),tokensIn: null,tokensOut: null,cost: null,costEstimated: false,children: [] })
  }
  const calls = [...new Map(input.llm.map(call => [call.id,call])).values()]
  for (const call of calls) children.push({ ...call,id: `llm-${opaque(call.id)}`,name: '模型调用',kind: 'llm',
    model: safe(call.model)?.slice(0,160) ?? '未知模型',start: null,end: null,children: [],detail: '实际调用耗时；起始偏移未提供。' })
  const sum = (key: 'tokensIn'|'tokensOut'|'cost') => calls.length && input.presentationAvailable !== false && calls.every(call => call[key] !== null)
    ? calls.reduce((total,call) => total+call[key]!,0) : null
  const truncated = children.length > 100
  // Known offsets first, then calls with measured duration but unknown offsets.
  children.sort((a,b) => (a.start ?? Infinity)-(b.start ?? Infinity))
  return { version: 1,startedAt,truncated,limitations: ['llm-offsets','terminal-time','child-discovery',
    ...(input.presentationAvailable === false ? ['presentation-unavailable' as const] : [])],
    root: { id: `run-${opaque(input.runId)}`,name: '运行',kind: 'agent',status: rootStatus,start: startedAt === null ? null : 0,end: null,durationMs: null,
      tokensIn: truncated ? null : sum('tokensIn'),tokensOut: truncated ? null : sum('tokensOut'),cost: truncated ? null : sum('cost'),
      costEstimated: calls.some(call => call.costEstimated),children: children.slice(-100) } }
}

/** Translate only the public runtime trace; no private events/tables or inferred lineage. */
export function buildNativeRunTrace(snapshot: import('@lyyzka/lingxios').RunTraceSnapshot,
  tools: readonly HarnessToolPart[] = []): RunTrace {
  const origin = snapshot.origin
  const relative = (time: number|null) => origin !== null && time !== null && time >= origin ? time-origin : null
  const spans = new Map<string,TraceSpan>()
  let truncated = snapshot.truncated
  for (const item of snapshot.spans) {
    const tool = item.runId === snapshot.runId ? tools.find(tool => tool.toolCallId === item.toolCallId && tool.eventSeq === item.seq) : undefined
    const parsed = toolDisplaySchema.safeParse(tool?.display)
    const display = parsed.success ? parsed.data : toolDisplay(item.name ?? '',item.state === 'complete' ? 'completed' : item.state)
    const detail = item.kind === 'llm' ? '模型调用：包含准入、请求与用量结算。' : item.kind === 'agent'
      ? '实际执行区间；排队时间单独记录。' : safe(display.purpose)
    const durationMs = item.startedAt !== null && item.completedAt !== null && item.completedAt >= item.startedAt
      ? item.completedAt-item.startedAt : null
    spans.set(item.spanId,{ id: item.spanId,name: item.kind === 'agent' ? item.childRunId ? '子任务' : '运行' : item.kind === 'llm' ? '模型调用' : safe(display.title)?.slice(0,160) ?? '工具调用',
      kind: item.kind,status: item.state === 'failed' ? 'error' : item.state,start: relative(item.startedAt),end: relative(item.completedAt),durationMs,
      ...(item.kind === 'llm' ? { model: safe(item.model)?.slice(0,160) ?? '未知模型' } : {}),detail,
      ...(item.kind === 'tool' && parsed.success ? { input: parsed.data.input,output: safe(parsed.data.summary) } : {}),
      tokensIn: item.kind === 'llm' && item.usageAvailable ? number(item.inputTokens) : null,
      tokensOut: item.kind === 'llm' && item.usageAvailable ? number(item.outputTokens) : null,
      cost: item.kind === 'llm' && item.usageAvailable && item.costMicros != null ? number(item.costMicros/1_000_000) : null,
      costEstimated: false,children: [] })
  }
  const root = spans.get(snapshot.rootSpanId)
  if (!root) throw new Error('native trace root is missing')
  const ancestors = (id: string) => {
    const seen = new Set<string>()
    for (let cursor: string|null = id; cursor !== null;) {
      if (seen.has(cursor) || seen.size > 10) return false
      seen.add(cursor)
      const item = snapshot.spans.find(span => span.spanId === cursor)
      if (!item) return false
      if (item.spanId === snapshot.rootSpanId) return true
      cursor = item.parentSpanId
    }
    return false
  }
  for (const item of snapshot.spans) {
    if (item.spanId === snapshot.rootSpanId) continue
    const parent = item.parentSpanId ? spans.get(item.parentSpanId) : undefined
    if (!parent || !ancestors(item.spanId) || parent.children.length >= 100) { truncated = true; continue }
    parent.children.push(spans.get(item.spanId)!)
  }
  const totals = (span: TraceSpan): TraceSpan[] => {
    span.children.sort((a,b)=>(a.start ?? Infinity)-(b.start ?? Infinity))
    const calls = span.kind === 'llm' ? [span] : span.children.flatMap(totals)
    if (span.kind === 'agent') for (const key of ['tokensIn','tokensOut','cost'] as const) {
      span[key] = !truncated && calls.length && calls.every(call=>call[key] !== null) ? calls.reduce((sum,call)=>sum+call[key]!,0) : null
    }
    return calls
  }
  totals(root)
  return { version: 1,startedAt: origin,timingBasis: 'execution',queuedAt: snapshot.queuedAt,revision: snapshot.revision,root,truncated,
    limitations: [...snapshot.spans.some(span=>span.kind === 'llm' && span.startedAt === null) ? ['llm-offsets' as const] : [],
      ...snapshot.spans.some(span=>span.startedAt === null || span.completedAt === null && !['running','waiting'].includes(span.state)) ? ['terminal-time' as const] : [],
      ...truncated ? ['child-discovery' as const] : []] }
}
