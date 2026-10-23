import { z } from 'zod'
import { publicText } from './runActivity.js'

const metric = z.number().finite().nonnegative().nullable()
const label = publicText.pipe(z.string().max(160))
export const traceStatusSchema = z.enum(['running','waiting','complete','partial','blocked','cancelled','error','unknown'])
export type TraceStatus = z.infer<typeof traceStatusSchema>
export const modelOperationSchema = z.enum(['generation','correction','content-review','compaction','memory-synthesis','approval-explanation','embedding','structured'])
export type ModelOperation = z.infer<typeof modelOperationSchema>
export function readModelOperation(value: unknown): ModelOperation|undefined {
  const parsed = modelOperationSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
export const modelOperationLabel: Record<ModelOperation,string> = { generation: '生成回复',correction: '纠正回复','content-review': '内容验收',
  compaction: '上下文摘要','memory-synthesis': '记忆整理','approval-explanation': '审批说明',embedding: '向量编码',structured: '模型辅助调用' }
/** Exact provider model registrations, never a guess from an arbitrary label. */
export const isEmbeddingTraceModel = (model: unknown) => model === 'BAAI/bge-m3' || model === 'Pro/BAAI/bge-m3' || model === 'Qwen/Qwen3-Embedding-8B'
export interface TraceSpan {
  id: string; name: string; kind: 'agent'|'llm'|'embedding'|'tool'; status: TraceStatus
  start: number|null; end: number|null; durationMs: number|null
  model?: string; detail?: string
  input?: { label: string; value: string }[]; output?: string
  tokensIn: number|null; tokensOut: number|null; cost: number|null; costEstimated: boolean
  knownCost?: number; costIncomplete?: boolean
  children: TraceSpan[]
}
const span: z.ZodType<TraceSpan> = z.lazy(() => z.object({
  id: z.string().min(1).max(160),name: label,kind: z.enum(['agent','llm','embedding','tool']),status: traceStatusSchema,
  start: metric,end: metric,durationMs: metric,model: label.optional(),detail: publicText.optional(),
  input: z.array(z.object({ label,value: publicText.pipe(z.string().max(500)) }).strict()).max(8).optional(),
  output: publicText.optional(),tokensIn: metric,tokensOut: metric,cost: metric,costEstimated: z.boolean(),
  knownCost: z.number().finite().nonnegative().optional(),costIncomplete: z.boolean().optional(),
  children: z.array(span).max(100),
}).strict())
export const runTraceSchema = z.object({ version: z.literal(1),startedAt: metric,root: span,
  timingBasis: z.enum(['creation','execution']).optional(),queuedAt: metric.optional(),revision: z.string().max(160).optional(),
  truncated: z.boolean(),limitations: z.array(z.enum(['llm-offsets','terminal-time','child-discovery','presentation-unavailable'])).max(4),
}).strict()
export type RunTrace = z.infer<typeof runTraceSchema>

/** Treat metadata from older clients/history as optional, never infer a trace. */
export function readRunTrace(value: unknown): RunTrace|undefined {
  const parsed = runTraceSchema.safeParse(value)
  if (!parsed.success) return undefined
  const project = (span: TraceSpan): TraceSpan => {
    let output = span.output
    if (span.kind === 'tool') {
      if (output === '可视化内容已保存；展示引用是否交付会在答复中确认。') output = '可视化内容已保存。'
      else if (output === `${span.name}未完成；本次工具调用没有确认交付结果。`) output = `${span.name}未完成，请重试。`
      else if (output === '本次脚本执行未完成，请以已确认的工具结果为准。') output = '脚本执行未完成，请重试。'
    }
    const embedding = span.kind === 'llm' && isEmbeddingTraceModel(span.model)
    return { ...span,...(embedding ? { kind: 'embedding' as const,...(span.name === '模型调用' ? { name: '向量编码' } : {}) } : {}),
      ...(output === undefined ? {} : { output }),children: span.children.map(project) }
  }
  const root = project(parsed.data.root)
  // Before execution traces, usage fallback used run creation as its anchor.
  // Preserve that anchor for recorded call offsets without claiming it is the
  // missing root execution start.
  if (parsed.data.timingBasis !== 'execution' && root.start === 0 && root.end === null && root.durationMs === null) root.start = null
  return { ...parsed.data,root }
}
