import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { CH_AGENT_ACTIVITY, publish } from '../redis.js'
import type { WorkerTaskHandle } from '../runtime/lifecycle.js'
import { publicActivityTitle } from './activity-visibility.js'
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheCreationTokens: number
  outputTokens: number
}
const EMPTY_USAGE: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 0 }

export type AgentRunStatus = 'running' | 'waiting_for_human' | 'completed' | 'failed' | 'skipped'
export type TriageSource = 'cloud' | 'agent-os' | 'product'
export type AgentEventLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_STRING_CHARS = 24_000
const MAX_JSON_CHARS = 160_000

function clip(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}…` : value
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= 8) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => clip(item, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    out[key] = clip(item, depth + 1)
  }
  return out
}

function jsonForDb(value: unknown): string {
  try {
    const text = JSON.stringify(clip(value))
    if (text.length <= MAX_JSON_CHARS) return text
    return JSON.stringify({ truncated: true, preview: text.slice(0, MAX_JSON_CHARS) })
  } catch {
    return JSON.stringify({ value: String(value) })
  }
}

async function publishAgentActivity(args: {
  id: string
  runId: string
  kind: string
  level?: AgentEventLevel
  createdAt?: string
  statusOverride?: AgentRunStatus
}): Promise<void> {
  const level = args.level ?? 'info'
  const title = publicActivityTitle(args.kind, level)
  if (!title) return
  const { rows } = await pool.query<{
      agent_id: string
      company_id: string | null
      status: AgentRunStatus
      agent_name: string
      conversation_ids: string[]
    }>(
      `SELECT r.agent_id, r.company_id, r.status,
              COALESCE(p.name, r.agent_id) AS agent_name,
              ARRAY(
                SELECT DISTINCT conversation_id
                  FROM (
                    SELECT jsonb_array_elements_text(COALESCE(r.trigger->'conversationIds', '[]'::jsonb)) AS conversation_id
                    UNION ALL
                    SELECT m.conversation_id
                      FROM jsonb_array_elements_text(COALESCE(r.input_message_ids, '[]'::jsonb)) input(message_id)
                      JOIN messages m ON m.id = input.message_id
                  ) activity_conversations
                 WHERE conversation_id IS NOT NULL AND conversation_id <> ''
              ) AS conversation_ids
         FROM agent_runs r
         LEFT JOIN participants p ON p.id = r.agent_id AND p.company_id = r.company_id
        WHERE r.id = $1
        LIMIT 1`,
      [args.runId],
    )
  const row = rows[0]
  if (!row?.company_id || row.conversation_ids.length === 0) return
  await publish(CH_AGENT_ACTIVITY, {
      type: 'agent.activity',
      companyId: row.company_id,
      conversationIds: row.conversation_ids,
      activity: {
        id: args.id,
        runId: args.runId,
        agentId: row.agent_id,
        agentName: row.agent_name,
        runStatus: args.statusOverride ?? row.status,
        kind: args.kind,
        level,
        title,
        createdAt: args.createdAt ?? new Date().toISOString(),
      },
  })
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message
  return String(err)
}

export async function createAgentRun(args: {
  agentId: string
  companyId?: string | null
  trigger?: Record<string, unknown>
  inputMessageIds?: string[]
  inboxCount?: number
  fingerprint?: string
}): Promise<string> {
  const id = `run-${randomUUID()}`
  await pool.query(
    `INSERT INTO agent_runs (
       id, agent_id, company_id, trigger, status, stage,
       input_message_ids, inbox_count, fingerprint
     )
     VALUES ($1,$2,$3,$4::jsonb,'running','created',$5::jsonb,$6,$7)`,
    [
      id,
      args.agentId,
      args.companyId ?? null,
      jsonForDb(args.trigger ?? {}),
      jsonForDb(args.inputMessageIds ?? []),
      args.inboxCount ?? 0,
      args.fingerprint ?? null,
    ],
  )
  await publishAgentActivity({
    id: `${id}:started`,
    runId: id,
    kind: 'run.started',
    statusOverride: 'running',
  })
  return id
}

export async function recordAgentEvent(args: {
  runId: string
  agentId: string
  companyId?: string | null
  kind: string
  level?: AgentEventLevel
  title: string
  data?: Record<string, unknown>
  stage?: string
}): Promise<void> {
  const id = `evt-${randomUUID()}`
  const inserted = await pool.query<{ created_at: Date }>(
    `INSERT INTO agent_events (id, run_id, agent_id, company_id, kind, level, title, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING created_at`,
    [
      id,
      args.runId,
      args.agentId,
      args.companyId ?? null,
      args.kind,
      args.level ?? 'info',
      args.title,
      jsonForDb(args.data ?? {}),
    ],
  )
  await pool.query(
    `UPDATE agent_runs
        SET updated_at = NOW(),
            stage = COALESCE($2, stage)
      WHERE id = $1`,
    [args.runId, args.stage ?? null],
  )
  await publishAgentActivity({
    id,
    runId: args.runId,
    kind: args.kind,
    level: args.level,
    createdAt: inserted.rows[0]?.created_at?.toISOString(),
  })
}

export async function finishAgentRun(args: {
  runId: string
  status: AgentRunStatus
  summary?: string
  error?: string | null
  toolCallCount?: number
  model?: string | null
  /** Native token breakdown reported by OpenAI. */
  usage?: TokenUsage | null
}): Promise<void> {
  const usage = args.usage ?? null
  await pool.query(
    `UPDATE agent_runs
        SET status = $2,
            stage = $2,
            summary = $3,
            error = $4,
            tool_call_count = $5,
            input_tokens          = COALESCE($6, input_tokens),
            cached_input_tokens   = COALESCE($7, cached_input_tokens),
            cache_creation_tokens = COALESCE($8, cache_creation_tokens),
            output_tokens         = COALESCE($9, output_tokens),
            model                 = COALESCE($10, model),
            updated_at = NOW(),
            finished_at = CASE WHEN $2 IN ('running', 'waiting_for_human') THEN NULL ELSE NOW() END
      WHERE id = $1`,
    [
      args.runId,
      args.status,
      args.summary ?? null,
      args.error ?? null,
      args.toolCallCount ?? 0,
      usage?.inputTokens ?? null,
      usage?.cachedInputTokens ?? null,
      usage?.cacheCreationTokens ?? null,
      usage?.outputTokens ?? null,
      args.model ?? null,
    ],
  )
  await publishAgentActivity({
    id: `${args.runId}:${args.status}`,
    runId: args.runId,
    kind: `run.${args.status}`,
    level: args.status === 'failed' ? 'error' : 'info',
    statusOverride: args.status,
  })
}

/** Record one inbox-triage call with native token telemetry. */
export async function recordTriage(args: {
  agentId: string
  companyId?: string | null
  source: TriageSource
  model?: string | null
  actionable: boolean
  reason?: string | null
  usage?: TokenUsage | null
  /** The big-brain run this triage WOKE (actionable=true), if known. */
  runId?: string | null
}): Promise<void> {
  const measured = !!args.usage
  const usage = args.usage ?? EMPTY_USAGE
  await pool.query(
      `INSERT INTO agent_triages (
         id, agent_id, company_id, source, model, actionable, reason,
         input_tokens, cached_input_tokens, cache_creation_tokens, output_tokens,
         measured, run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        `tri-${randomUUID()}`, args.agentId, args.companyId ?? null, args.source,
        args.model ?? null, args.actionable, (args.reason ?? '').slice(0, 500),
        usage.inputTokens, usage.cachedInputTokens, usage.cacheCreationTokens, usage.outputTokens,
        measured, args.runId ?? null,
      ],
    )
}

/** Heartbeat a still-running run so the stale-run sweeper does not reap a
 * legitimately long Agent OS turn. Only touches a running row and therefore
 * cannot resurrect a terminal run. */
export async function touchAgentRun(runId: string): Promise<void> {
  await pool.query(
    `UPDATE agent_runs SET updated_at = NOW() WHERE id = $1 AND status = 'running'`,
    [runId],
  )
}

export async function markStaleAgentRuns(maxAgeMs: number = 10 * 60_000): Promise<Array<{ id: string; agent_id: string }>> {
  const { rows } = await pool.query<{ id: string; agent_id: string }>(
    `UPDATE agent_runs
        SET status = 'failed',
            stage = 'orphaned',
            summary = COALESCE(NULLIF(summary, ''), 'Agent run orphaned after runtime finalization was lost'),
            error = COALESCE(error, 'Agent run was left running without heartbeat and was closed by the stale-run sweeper'),
            updated_at = NOW(),
            finished_at = NOW()
      WHERE status = 'running'
        AND updated_at < NOW() - ($1::double precision * INTERVAL '1 millisecond')
      RETURNING id, agent_id`,
    [maxAgeMs],
  )
  return rows
}

export function startStaleAgentRunSweeper(
  intervalMs: number = 60_000,
  maxAgeMs: number = 10 * 60_000,
): WorkerTaskHandle {
  const tick = (): void => {
    void markStaleAgentRuns(maxAgeMs).then((rows) => {
      if (rows.length > 0) {
        console.warn(`[observability] closed ${rows.length} stale running agent run(s): ${rows.map((r) => r.id).join(', ')}`)
      }
    }).catch((err) => {
      console.warn('[observability] stale agent run sweeper failed:', err instanceof Error ? err.message : err)
    })
  }
  const immediate = setImmediate(tick)
  const t = setInterval(tick, intervalMs)
  t.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(t) } }
}
