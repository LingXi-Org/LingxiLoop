/**
 * llm_calls_rollup refresher — keeps the Observability pre-aggregation current.
 *
 * WHY THIS EXISTS: llm_calls is ~470k rows and 100% inside the 30d dashboard
 * window (growing ~70k/day), so every Observability aggregation was a full seq
 * scan and the page fired 6 of them concurrently → 5-25s. The rollup collapses
 * the table to ~30k hourly-bucketed rows (15× smaller); the dashboard reads it
 * in ~230ms. This worker is the thing that keeps that rollup fresh.
 *
 * Refresh model — recompute, don't increment:
 *   Each tick re-derives the FULL aggregate for a recent window of hourly
 *   buckets straight from llm_calls and UPSERTs it (ON CONFLICT … DO UPDATE,
 *   overwriting the row). Recomputing is idempotent and self-healing: a missed
 *   tick, a double-run across replicas, or a late-arriving row all converge to
 *   the correct value on the next pass. Past hours are immutable (no new rows
 *   land in them) so only the trailing window needs re-touching.
 *
 *   First run on a fresh/empty table (or after a long outage) widens the window
 *   to fill the gap from the newest existing bucket — so a single code path
 *   does both initial backfill and steady-state catch-up.
 *
 * Single-writer: an advisory lock means only one replica refreshes per tick;
 * the others no-op. Correctness wouldn't break without it (the upsert is
 * idempotent), but it avoids two replicas scanning llm_calls in lock-step.
 */
import { pool } from '../db/pool.js'

/** Interval between rollup refresh ticks. Default 120s; set 0 to disable. Read
 *  straight from process.env (not env.ts) to keep this self-contained. */
const INTERVAL_MS = Number(process.env.LLM_ROLLUP_INTERVAL_MS ?? 120_000)

// Distinct from migrate's SCHEMA_LOCK_KEY (7_643_178_926_104n).
const ROLLUP_LOCK_KEY = 7_643_178_926_211n

// Steady-state trailing window: the current partial hour plus slack for clock
// skew / late writes. 3h is generous and still ~150ms to recompute.
const STEADY_WINDOW_HOURS = 3
// Initial backfill / max catch-up reach. The dashboard's widest range is 90d;
// a touch more keeps the boundary clean. Capped so a brand-new table can't try
// to scan unbounded history in one statement.
const MAX_BACKFILL_HOURS = 95 * 24
// Drop buckets older than this so the rollup stays bounded as history grows.
const RETENTION_HOURS = 95 * 24

/**
 * Upsert every hourly bucket whose source rows are newer than `sinceHours`.
 * Returns the number of buckets written (inserted or updated).
 */
export async function refreshLlmRollup(sinceHours: number): Promise<number> {
  const res = await pool.query(
    `INSERT INTO llm_calls_rollup (
       bucket_hour, company_id, agent_id, purpose, model, source,
       calls, ok_calls, failed_calls, rate_limited_calls,
       input_tokens, cached_input_tokens, cache_creation_tokens, output_tokens, reasoning_tokens,
       cost_usd, cost_estimated)
     SELECT date_trunc('hour', created_at), company_id, agent_id, purpose, model, source,
            COUNT(*),
            COUNT(*) FILTER (WHERE status = 'ok'),
            COUNT(*) FILTER (WHERE status != 'ok'),
            COUNT(*) FILTER (WHERE status = 'rate_limited'),
            COALESCE(SUM(input_tokens), 0),
            COALESCE(SUM(cached_input_tokens), 0),
            COALESCE(SUM(cache_creation_tokens), 0),
            COALESCE(SUM(output_tokens), 0),
            COALESCE(SUM(reasoning_tokens), 0),
            COALESCE(SUM(cost_usd), 0),
            BOOL_OR(cost_estimated)
       FROM llm_calls
      WHERE created_at >= date_trunc('hour', NOW()) - ($1::int * INTERVAL '1 hour')
      GROUP BY 1, 2, 3, 4, 5, 6
     ON CONFLICT (bucket_hour, company_id, agent_id, purpose, model, source)
     DO UPDATE SET
       calls = EXCLUDED.calls,
       ok_calls = EXCLUDED.ok_calls,
       failed_calls = EXCLUDED.failed_calls,
       rate_limited_calls = EXCLUDED.rate_limited_calls,
       input_tokens = EXCLUDED.input_tokens,
       cached_input_tokens = EXCLUDED.cached_input_tokens,
       cache_creation_tokens = EXCLUDED.cache_creation_tokens,
       output_tokens = EXCLUDED.output_tokens,
       reasoning_tokens = EXCLUDED.reasoning_tokens,
       cost_usd = EXCLUDED.cost_usd,
       cost_estimated = EXCLUDED.cost_estimated`,
    [Math.max(1, Math.ceil(sinceHours))],
  )
  return res.rowCount ?? 0
}

/** One refresh pass: take the lock, pick the window (gap-fill on first run),
 *  upsert, prune old buckets. Best-effort + non-fatal — a failure just retries
 *  next tick. */
export async function runLlmRollupTick(): Promise<{ skipped?: boolean; buckets?: number; sinceHours?: number }> {
  const client = await pool.connect()
  try {
    const lock = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [ROLLUP_LOCK_KEY])
    if (lock.rows[0]?.ok !== true) return { skipped: true }
    try {
      // Window = max(steady, gap since newest bucket), capped at the backfill
      // reach. NULL max (empty table) → full backfill.
      const { rows } = await client.query<{ gap_hours: number | null }>(
        `SELECT CEIL(EXTRACT(EPOCH FROM (NOW() - MAX(bucket_hour))) / 3600.0)::int AS gap_hours
           FROM llm_calls_rollup`,
      )
      const gap = rows[0]?.gap_hours
      const sinceHours = gap == null
        ? MAX_BACKFILL_HOURS
        : Math.min(MAX_BACKFILL_HOURS, Math.max(STEADY_WINDOW_HOURS, gap + 1))
      const buckets = await refreshLlmRollup(sinceHours)
      await client.query(
        `DELETE FROM llm_calls_rollup WHERE bucket_hour < NOW() - ($1::int * INTERVAL '1 hour')`,
        [RETENTION_HOURS],
      )
      return { buckets, sinceHours }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ROLLUP_LOCK_KEY]).catch(() => { /* swallow */ })
    }
  } finally {
    client.release()
  }
}

let timer: NodeJS.Timeout | null = null

/** Start the periodic rollup refresher. Idempotent. Fires the first tick
 *  immediately (so a fresh deploy backfills right away rather than waiting a
 *  full interval), then on the interval. LLM_ROLLUP_INTERVAL_MS=0 disables. */
export function startLlmRollupRefresher(): { stop(): void } | null {
  if (timer) return { stop: stopLlmRollupRefresher }
  const intervalMs = INTERVAL_MS
  if (intervalMs <= 0) {
    console.log('[llm-rollup] disabled (LLM_ROLLUP_INTERVAL_MS=0)')
    return null
  }
  console.log(`[llm-rollup] starting · interval=${intervalMs}ms`)
  const tick = async () => {
    const t = Date.now()
    try {
      const r = await runLlmRollupTick()
      if (!r.skipped) console.log(`[llm-rollup] refreshed ${r.buckets} buckets (window=${r.sinceHours}h) in ${Date.now() - t}ms`)
    } catch (e) {
      console.error('[llm-rollup] tick failed:', e instanceof Error ? e.message : String(e))
    }
  }
  // Kick the first pass now so the dashboard has data ASAP after boot.
  void tick()
  timer = setInterval(() => { void tick() }, intervalMs)
  return { stop: stopLlmRollupRefresher }
}

export function stopLlmRollupRefresher(): void {
  if (timer) { clearInterval(timer); timer = null }
}
