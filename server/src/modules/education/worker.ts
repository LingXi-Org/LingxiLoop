import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { educationApplication } from './facade.js'

export async function expireDueEducationContracts(limit = 20): Promise<void> {
  for (let processed = 0; processed < limit; processed += 1) {
    if (!await educationApplication.expireNextDueContract(new Date())) return
  }
}

export function startEducationContractExpiryWorker(intervalMs = 30_000): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void expireDueEducationContracts().catch((error) => {
    console.warn('[education] Contract expiry sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(1_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
