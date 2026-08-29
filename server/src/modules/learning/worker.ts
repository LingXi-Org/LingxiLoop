import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { pool } from '../../db/pool.js'
import { learningApplication } from './facade.js'
import {
  claimLearningEffects,
  completeLearningEffect,
  failLearningEffect,
  renewLearningEffectLease,
} from './effects-repository.js'

export { startLearningNotificationScheduler } from './notifications.js'

export async function runLearningEffects(): Promise<void> {
  for (let processed = 0; processed < 20; processed += 1) {
    const [effect] = await claimLearningEffects(pool, 1)
    if (!effect) return
    let leaseLost = false
    const heartbeat = setInterval(() => {
      void renewLearningEffectLease(pool, effect)
        .then((renewed) => { if (!renewed) leaseLost = true })
        .catch(() => { /* completion remains the authoritative fence */ })
    }, 30_000)
    heartbeat.unref?.()
    try {
      await learningApplication.runEffect(effect)
      if (leaseLost) throw new Error(`learning effect lease lost during execution: ${effect.id}:${effect.generation}`)
      await completeLearningEffect(pool, effect)
    } catch (error) {
      await failLearningEffect(pool, effect, error instanceof Error ? error.message : String(error))
    } finally {
      clearInterval(heartbeat)
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
