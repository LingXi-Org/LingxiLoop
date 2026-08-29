import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { learningApplication } from './facade.js'
import {
  claimLearningEffects,
  completeLearningEffect,
  failLearningEffect,
} from './effects-repository.js'

export { startLearningNotificationScheduler } from './notifications.js'

export async function runLearningEffects(): Promise<void> {
  const effects = await claimLearningEffects(pool)
  for (const effect of effects) {
    try {
      if (effect.kind === 'course_create.audit') {
        await withTransaction(pool, async (db) => {
          await learningApplication.runEffect(effect, db)
          await completeLearningEffect(db, effect)
        })
      } else {
        await learningApplication.runEffect(effect)
        await completeLearningEffect(pool, effect)
      }
    } catch (error) {
      await failLearningEffect(pool, effect, error instanceof Error ? error.message : String(error))
    }
  }
}

export function startLearningEffectWorker(intervalMs = 5_000): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void runLearningEffects().catch((error) => {
    console.warn('[learning] effect sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(1_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
