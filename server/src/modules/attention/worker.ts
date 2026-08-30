import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { listUnprojectedAttentionEvents } from './projection-repository.js'
import { projectAttentionEvent } from './projection.js'
import { TEACHER_ATTENTION_RULES_V1 } from './rules.js'

export async function runAttentionProjectionSweep(): Promise<void> {
  await withTransaction(pool, async (db) => {
    const { rows } = await db.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtextextended('attention-projection',0)) AS locked`,
    )
    if (!rows[0]?.locked) return
    for (const event of await listUnprojectedAttentionEvents(db)) {
      await projectAttentionEvent(db, event, TEACHER_ATTENTION_RULES_V1)
    }
  })
}

export function startAttentionProjectionWorker(
  intervalMs = Number(process.env.ATTENTION_PROJECTION_INTERVAL_MS ?? 10_000),
): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void runAttentionProjectionSweep().catch((error) => {
    console.warn('[attention] projection failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(5_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
