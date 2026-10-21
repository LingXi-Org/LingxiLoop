import { z } from 'zod'
import { publicText } from './runActivity.js'

const metric = z.number().finite().nonnegative().nullable()
const label = publicText.pipe(z.string().max(160))
export const traceStatusSchema = z.enum(['running','waiting','complete','cancelled','error','unknown'])
export type TraceStatus = z.infer<typeof traceStatusSchema>
export interface TraceSpan {
  id: string; name: string; kind: 'agent'|'llm'|'tool'; status: TraceStatus
  start: number|null; end: number|null; durationMs: number|null
  model?: string; detail?: string
  input?: { label: string; value: string }[]; output?: string
  tokensIn: number|null; tokensOut: number|null; cost: number|null; costEstimated: boolean
  children: TraceSpan[]
}
const span: z.ZodType<TraceSpan> = z.lazy(() => z.object({
  id: z.string().min(1).max(160),name: label,kind: z.enum(['agent','llm','tool']),status: traceStatusSchema,
  start: metric,end: metric,durationMs: metric,model: label.optional(),detail: publicText.optional(),
  input: z.array(z.object({ label,value: publicText.pipe(z.string().max(500)) }).strict()).max(8).optional(),
  output: publicText.optional(),tokensIn: metric,tokensOut: metric,cost: metric,costEstimated: z.boolean(),
  children: z.array(span).max(100),
}).strict())
export const runTraceSchema = z.object({ version: z.literal(1),startedAt: metric,root: span,
  truncated: z.boolean(),limitations: z.array(z.enum(['llm-offsets','terminal-time','child-discovery','presentation-unavailable'])).max(4),
}).strict()
export type RunTrace = z.infer<typeof runTraceSchema>

/** Treat metadata from older clients/history as optional, never infer a trace. */
export function readRunTrace(value: unknown): RunTrace|undefined {
  const parsed = runTraceSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
