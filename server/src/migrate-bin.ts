/**
 * Standalone migration runner.
 *
 *   npx tsx server/src/migrate-bin.ts
 *   # or, in package.json scripts: npm run migrate
 *
 * Designed for the production Compose `migrate` one-shot service. Runs
 * `ensureSchema()` and exits — no HTTP listener, scheduler, or Redis
 * subscription. It uses the same digest-pinned server image as the app.
 *
 * The migration is wrapped in a pg_advisory_lock (see db/migrate.ts)
 * so multiple concurrent runners (rolling deploy, parallel init
 * containers across replicas) serialize cleanly. The DDL is fully
 * idempotent (IF NOT EXISTS / IF EXISTS shapes), so re-runs are
 * no-ops.
 *
 * Exit codes:
 *   0  schema is up to date (or was, and migration finished cleanly)
 *   1  migration failed (Postgres error, env missing, etc.) — main
 *      container should NOT start
 */
import { pool } from './db/pool.js'
import { ensureSchema } from './db/migrate.js'

// Postgres SQLSTATE codes for transient lock contention. ensureSchema is fully
// idempotent (every DDL is IF NOT EXISTS / IF EXISTS shaped) and advisory-lock
// serialized across replicas, so on these it is ALWAYS safe to back off and
// re-run the whole thing:
//   40P01 = deadlock_detected  — a no-op ALTER's brief AccessExclusiveLock
//                                raced a live agent/server query into a cycle
//                                and PG aborted one. Under constant traffic this
//                                recurs, so a bare container restart can
//                                loop the rollout to failure (the outage
//                                this fixes) unless we retry IN-PROCESS in a
//                                quieter moment.
//   55P03 = lock_not_available — lock_timeout (set inside ensureSchema) tripped
//                                while WAITING for a table lock.
const TRANSIENT_LOCK_CODES = new Set(['40P01', '55P03'])
const MAX_ATTEMPTS = 8

async function main(): Promise<void> {
  const started = Date.now()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await ensureSchema()
      console.log(`[migrate-bin] ok · ${Date.now() - started}ms${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
      await pool.end().catch(() => { /* swallow */ })
      process.exit(0)
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code
      if (typeof code === 'string' && TRANSIENT_LOCK_CODES.has(code) && attempt < MAX_ATTEMPTS) {
        // The advisory lock is released on the failed attempt (ensureSchema's
        // finally), so each retry re-acquires cleanly and the idempotent DDL
        // re-runs as no-ops up to the statement that lost the race, then retries
        // that one. Exponential backoff + jitter, capped at 15s — this is the
        // "retry in a quieter moment" the surrounding comments promised but the
        // runner never actually did.
        const backoffMs = Math.min(15_000, 1_000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500)
        console.warn(`[migrate-bin] transient lock error ${code} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${backoffMs}ms`)
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }
      console.error('[migrate-bin] failed:', err instanceof Error ? (err.stack ?? err.message) : String(err))
      await pool.end().catch(() => { /* swallow */ })
      process.exit(1)
    }
  }
}

void main()
