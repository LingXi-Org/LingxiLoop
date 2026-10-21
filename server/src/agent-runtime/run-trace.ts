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
