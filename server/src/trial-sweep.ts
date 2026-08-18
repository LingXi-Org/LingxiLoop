/**
 * Apple-signup Pro-trial expiry sweep.
 *
 * Net-new users who sign up with Sign in with Apple (native iOS route)
 * are granted tier='pro' with `users.pro_trial_expires_at` stamped (see
 * oauth.ts findOrCreateUserByProfile). This worker walks expired stamps
 * and downgrades them back to 'free' through admin.changeUserTier — the
 * SAME path the admin UI uses — so the sub2api quota group is mirrored
 * and can never drift from the cumora tier.
 *
 * Safety properties:
 *  - Only rows with tier='pro' AND a non-NULL, past stamp are touched.
 *    changeUserTier clears the stamp on every manual tier change, so a
 *    user who genuinely upgraded mid-trial is invisible to this sweep.
 *  - Per-user failures (sub2api hiccup) are logged and retried on the
 *    next tick — the stamp is only cleared after a successful downgrade.
 *  - Hourly cadence: a trial lapsing up to an hour late is harmless.
 */
import { pool } from './db/pool.js'
import { changeUserTier } from './admin.js'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const BATCH = 100

export async function runTrialSweepTick(): Promise<{ expired: number; failed: number }> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users
      WHERE tier = 'pro'
        AND pro_trial_expires_at IS NOT NULL
        AND pro_trial_expires_at < NOW()
        AND deleted_at IS NULL
      LIMIT $1`,
    [BATCH],
  )
  let expired = 0, failed = 0
  for (const r of rows) {
    try {
      await changeUserTier(r.id, 'free')  // mirrors sub2api + clears the stamp
      expired++
      console.log(`[trial-sweep] pro trial expired → free for ${r.id}`)
    } catch (e) {
      failed++
      console.warn(`[trial-sweep] downgrade failed for ${r.id}; will retry next tick:`, e instanceof Error ? e.message : String(e))
    }
  }
  return { expired, failed }
}

let timer: NodeJS.Timeout | null = null

/** Start the hourly sweep. Idempotent — re-calling is a no-op. Runs one
 *  pass shortly after boot so a long-down server catches up quickly. */
export function startTrialSweepWorker(): { stop(): void } {
  if (timer) return { stop: stopTrialSweepWorker }
  const tick = async () => {
    try { await runTrialSweepTick() }
    catch (e) { console.error('[trial-sweep] tick failed:', e instanceof Error ? e.message : String(e)) }
  }
  setTimeout(() => { void tick() }, 30_000)
  timer = setInterval(() => { void tick() }, SWEEP_INTERVAL_MS)
  console.log(`[trial-sweep] starting · interval=${SWEEP_INTERVAL_MS}ms`)
  return { stop: stopTrialSweepWorker }
}

export function stopTrialSweepWorker(): void {
  if (timer) { clearInterval(timer); timer = null }
}
