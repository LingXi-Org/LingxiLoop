/**
 * Email attachment garbage collector.
 *
 * Inbound + outbound attachments land in object storage under the
 * `email-attachments/` prefix; their metadata lives in
 * `email_attachments.storage_key`. When the parent email_messages row is
 * deleted (CASCADE from message redaction, conversation cleanup, etc.),
 * the DB row disappears but the storage object stays — Postgres doesn't
 * know how to call S3.
 *
 * Without GC, storage bills creep upward over time and every leak from a
 * partial-write retry (upload succeeded, persistEmailMessage threw)
 * accumulates forever.
 *
 * Strategy: a periodic sweep enumerates the storage prefix, asks the DB
 * for every currently-referenced storage_key, and deletes objects in the
 * set difference. An age threshold spares anything uploaded recently —
 * we don't want to race a concurrent inbound webhook that's uploaded
 * bytes but hasn't committed the row yet.
 *
 * Multi-replica safety: the sweep is idempotent. Two replicas running
 * simultaneously will both try to delete the same orphan; whichever
 * loses the race gets a benign "key not found" from the backend and
 * moves on (deleteObject returns false, not throw).
 *
 * Disabling: set EMAIL_GC_INTERVAL_MS=0.
 */
import { pool } from './db/pool.js'
import { env } from './env.js'
import type { WorkerTaskHandle } from './runtime/lifecycle.js'
import { storage, type StorageObject } from './storage.js'
import { inc } from './metrics.js'

/** Prefix in object storage where every email attachment lives. Hardcoded
 *  here AND in storage.ts SIGNED_PREFIXES — keep in sync. */
const STORAGE_PREFIX = 'email-attachments/'

/** How recent an object must be to be spared from GC. Spans both:
 *    - the worst-case time between storage.put() and the email_messages
 *      INSERT (typically <1s, but DB stalls can extend this);
 *    - any in-flight retry that has temporarily orphaned a key.
 *  An hour is conservative and the cost of being conservative is tiny —
 *  we'd just skip an orphan this tick and catch it next time. */
const SAFETY_AGE_MS = 60 * 60_000  // 1 hour

/** Pure reconciliation: given the storage listing + DB-referenced keys +
 *  the current wall-clock time, return the keys we should delete.
 *
 *  Pulled out as a free function so the unit test can exercise the
 *  decision matrix without mocking S3 or Postgres. Reasoning:
 *    - in storage, NOT in DB, OLDER than safety threshold → DELETE
 *    - in storage, in DB                                  → KEEP (live)
 *    - in storage, NOT in DB, YOUNGER than threshold      → KEEP (race)
 *    - in DB, NOT in storage                              → ignored
 *      (DB-only ghosts are harmless; the row just renders as a broken
 *      download link, which is recoverable; GC's job is to delete bytes,
 *      not patch ghost rows)
 */
export function pickOrphans(args: {
  inStorage: StorageObject[]
  inDb: Set<string>
  nowMs: number
  safetyAgeMs?: number
}): string[] {
  const threshold = (args.safetyAgeMs ?? SAFETY_AGE_MS)
  const cutoff = args.nowMs - threshold
  const out: string[] = []
  for (const obj of args.inStorage) {
    if (args.inDb.has(obj.key)) continue
    if (obj.lastModifiedMs > cutoff) continue
    out.push(obj.key)
  }
  return out
}

/** Read every storage_key currently referenced by an email_attachments
 *  row. We include `truncated=TRUE` rows whose key is non-null in case
 *  some odd flow set both — better to err toward keeping objects. */
async function loadReferencedKeys(): Promise<Set<string>> {
  const { rows } = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM email_attachments
      WHERE storage_key IS NOT NULL`,
  )
  return new Set(rows.map((r) => r.storage_key))
}

/** Run one sweep. Returns the per-step counts so the boot logger / a
 *  future metrics surface can report on it. */
export async function runGcTick(): Promise<{ inspected: number; deleted: number; failed: number }> {
  const t0 = Date.now()
  const [inStorage, inDb] = await Promise.all([
    storage.listObjectsByPrefix(STORAGE_PREFIX),
    loadReferencedKeys(),
  ])
  const orphans = pickOrphans({ inStorage, inDb, nowMs: Date.now() })
  let deleted = 0
  let failed = 0
  for (const key of orphans) {
    const ok = await storage.deleteObject(key)
    if (ok) { deleted++; inc('email.gc.deleted') }
    else    { failed++; inc('email.gc.failed') }
  }
  const ms = Date.now() - t0
  console.log(JSON.stringify({
    evt: 'email.gc.tick',
    storage_objects: inStorage.length,
    db_keys: inDb.size,
    orphans_found: orphans.length,
    deleted, failed,
    latency_ms: ms,
  }))
  return { inspected: inStorage.length, deleted, failed }
}

let timer: NodeJS.Timeout | null = null

/** Start the periodic GC loop. Idempotent — re-calling is a no-op. */
export function startEmailGcWorker(): WorkerTaskHandle | null {
  if (timer) return { stop: stopEmailGcWorker }
  const intervalMs = env.EMAIL_GC_INTERVAL_MS
  if (intervalMs <= 0) {
    console.log('[email-gc] disabled (EMAIL_GC_INTERVAL_MS=0)')
    return null
  }
  console.log(`[email-gc] starting · interval=${intervalMs}ms · safety=${SAFETY_AGE_MS}ms`)
  const tick = async () => {
    try { await runGcTick() }
    catch (e) { console.error('[email-gc] tick failed:', e instanceof Error ? e.message : String(e)) }
  }
  timer = setInterval(() => { void tick() }, intervalMs)
  return { stop: stopEmailGcWorker }
}

export function stopEmailGcWorker(): void {
  if (timer) { clearInterval(timer); timer = null }
}
