import { pool } from '../../db/pool.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { seedMemberLearningContextThreads } from '../context-threads/public.js'
import {
  claimCompanyOnboardingEffect,
  completeCompanyOnboardingEffect,
  failCompanyOnboardingEffect,
  renewCompanyOnboardingEffectLease,
} from './effects-repository.js'

export async function runCompanyOnboardingEffects(): Promise<void> {
  for (let processed = 0; processed < 20; processed += 1) {
    const effect = await claimCompanyOnboardingEffect(pool)
    if (!effect) return
    let leaseLost = false
    const heartbeat = setInterval(() => {
      void renewCompanyOnboardingEffectLease(pool, effect)
        .then((renewed) => { if (!renewed) leaseLost = true })
        .catch(() => { /* completion remains the authoritative fence */ })
    }, 30_000)
    heartbeat.unref?.()
    try {
      await seedMemberLearningContextThreads({ companyId: effect.companyId, userId: effect.memberId })
      if (leaseLost) throw new Error(`company onboarding effect lease lost during execution: ${effect.id}`)
      await completeCompanyOnboardingEffect(pool, effect)
    } catch (error) {
      await failCompanyOnboardingEffect(pool, effect, error instanceof Error ? error.message : String(error))
    } finally {
      clearInterval(heartbeat)
    }
  }
}

export function startCompanyOnboardingEffectWorker(intervalMs = 5_000): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void runCompanyOnboardingEffects().catch((error) => {
    console.warn('[companies] onboarding effect sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(1_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
