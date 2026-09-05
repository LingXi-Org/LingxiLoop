import { createHash } from 'node:crypto'
import { z } from 'zod'

export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/)
const text = z.string().min(1).max(64_000)
const score = z.number().finite().min(0).max(1)
export const graderSchema = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('exact'), threshold: score }).strict(),
  z.object({ id, kind: z.literal('contains'), value: text, threshold: score }).strict(),
  z.object({ id, kind: z.literal('json'), threshold: score }).strict(),
  z.object({ id, kind: z.literal('factuality'), threshold: score }).strict(),
])
export const datasetSchema = z.object({
  schemaVersion: z.literal(1), id, version: id,
  cases: z.array(z.object({ id, input: text, expected: text, tags: z.array(id).max(20).default([]) }).strict()).min(1).max(10_000),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.cases.map(c => c.id)).size !== v.cases.length) ctx.addIssue({ code: 'custom', message: 'duplicate case id' })
})
export const suiteSchema = z.object({
  schemaVersion: z.literal(2), id, version: id,
  dataset: z.object({ id, version: id }).strict(),
  samples: z.number().int().min(1).max(100),
  concurrency: z.number().int().min(1).max(32),
  timeoutMs: z.number().int().min(100).max(600_000),
  graders: z.array(graderSchema).min(1).max(20),
  gate: z.object({
    minScore: score, minPassRate: score, maxScoreDrop: score, maxCaseDrop: score,
    maxP95LatencyMs: z.number().positive().finite(), maxCandidateCostCny: z.number().nonnegative().finite(),
    maxJudgeCostCny: z.number().nonnegative().finite(), requireBaseline: z.boolean(),
  }).strict(),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.graders.map(g => g.id)).size !== v.graders.length) ctx.addIssue({ code: 'custom', message: 'duplicate grader id' })
})
export type Dataset = z.infer<typeof datasetSchema>
export type Suite = z.infer<typeof suiteSchema>
export type Grader = z.infer<typeof graderSchema>
export const usageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), costCny: z.number().finite().nonnegative() }).strict()
export type Usage = z.infer<typeof usageSchema>
export interface TargetRequest {
  input: string
  requestId: string
  seed: number
  signal: AbortSignal
}
export const targetResponseSchema = z.object({ output: z.string().max(64_000), usage: usageSchema.optional() }).strict()
export interface EvalTarget {
  readonly identity: { id: string; version: string; fingerprint: string }
  execute(request: TargetRequest): Promise<z.infer<typeof targetResponseSchema>>
}
export interface Grade { id: string; score: number; passed: boolean; reason?: string }
export interface Judge {
  readonly fingerprint: string
  grade(input: string, output: string, expected: string, signal: AbortSignal, requestId: string): Promise<{ score: number; usage: Usage }>
}
export const sampleSchema = z.object({
  caseId: id, index: z.number().int().nonnegative(), status: z.enum(['pass', 'fail', 'error']), score,
  latencyMs: z.number().finite().nonnegative(),
  grades: z.array(z.object({ id, score, passed: z.boolean(), reason: id.optional() }).strict()).max(20),
  candidate: usageSchema.optional(), judge: usageSchema, failure: id.optional(),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict()
export type Sample = z.infer<typeof sampleSchema>
export const manifestSchema = z.object({
  schemaVersion: z.literal(2), engine: z.literal('black-box-eval/2'), suite: suiteSchema, dataset: datasetSchema,
  target: z.object({ id, version: id, fingerprint: z.string().min(1).max(200) }).strict(),
  judge: z.string().min(1).max(200).nullable(), seed: z.number().int().min(0).max(2147483647),
  provenance: z.object({ revision: z.string().min(1).max(200) }).strict(), baseline: id.nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.suite.dataset.id !== v.dataset.id || v.suite.dataset.version !== v.dataset.version
    || v.suite.samples * v.dataset.cases.length > 100_000
    || (v.suite.graders.some(g => g.kind === 'factuality') && !v.judge)) ctx.addIssue({ code: 'custom', message: 'inconsistent manifest' })
})
export type Manifest = z.infer<typeof manifestSchema>
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex') }
export const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, costCny: 0 })
export function addUsage(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costCny: a.costCny + b.costCny }
}
export class EvaluationError extends Error {
  constructor(readonly code: string) { super(code) }
}
export function failureCode(error: unknown): string {
  return error instanceof EvaluationError ? error.code : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'timeout_or_cancelled' : 'unexpected_error'
}

export class ModelError extends EvaluationError {
  constructor(code: string, readonly usage: Usage) { super(code) }
}
