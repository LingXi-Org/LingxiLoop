import { randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'
import type { Queryable } from './db/queryable.js'

export type LlmCallContext = {
  purpose: string
  companyId: string
  agentId?: string | null
  runId?: string | null
  conversationId?: string | null
  source?: 'product' | 'agent-os' | 'eval'
  extras?: Record<string, unknown>
}

export type LlmUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

type LlmCallRecord = Parameters<typeof persistLlmCall>[0]
let recorderOverride: ((record: LlmCallRecord) => Promise<void>) | null = null
export function __setLlmLedgerOverrideForTesting(override: typeof recorderOverride): void {
  recorderOverride = override
}

function token(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

async function persistLlmCall(args: {
  context: LlmCallContext
  model: string
  usage?: LlmUsage | null
  latencyMs: number
  status: 'succeeded' | 'failed'
  error?: unknown
  measured?: boolean
}, db: Queryable = pool, id = `llm-${randomUUID()}`): Promise<void> {
  const usage = args.usage
  await db.query(
    `INSERT INTO llm_calls (
       id, company_id, agent_id, run_id, conversation_id, purpose, source, model,
       input_tokens, cached_input_tokens, output_tokens, cost_usd, cost_estimated,
       measured, latency_ms, status, error, extras
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,TRUE,$12,$13,$14,$15,$16::jsonb)`,
    [
      id,
      args.context.companyId,
      args.context.agentId ?? null,
      args.context.runId ?? null,
      args.context.conversationId ?? null,
      args.context.purpose,
      args.context.source ?? 'product',
      args.model,
      token(usage?.prompt_tokens),
      token(usage?.prompt_tokens_details?.cached_tokens),
      token(usage?.completion_tokens),
      args.measured ?? Boolean(usage),
      Math.max(0, Math.floor(args.latencyMs)),
      args.status,
      args.error == null ? null : String(args.error).slice(0, 4000),
      JSON.stringify(args.context.extras ?? {}),
    ],
  )
}

export async function recordLlmCall(args: LlmCallRecord, db: Queryable = pool, id?: string): Promise<void> {
  if (recorderOverride) return recorderOverride(args)
  return persistLlmCall(args, db, id)
}
