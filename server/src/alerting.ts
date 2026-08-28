/**
 * Process-level alerting hook. The unhandledRejection /
 * uncaughtException handlers in the process entrypoints log the
 * crash to stderr — fine for a local dev box, useless in prod where
 * nobody's tailing logs. Route those through here too so a webhook
 * (Discord webhook JSON by default) gets a copy and the on-call sees
 * the silent crashes.
 *
 * Design goals:
 *   - **Never throw.** The handler is invoked from the global error
 *     handlers themselves — if alerting fails it must NOT cascade into
 *     a second uncaught exception. Every code path here either
 *     `return`s or is wrapped in try/catch.
 *   - **Never block.** `notifyAlert` is async but every caller treats
 *     it as fire-and-forget (`void notifyAlert(...)`).
 *   - **Dedupe.** A crash loop can fire thousands of identical errors
 *     per second. We hold an in-memory `Map<fingerprint, lastSentAt>`
 *     and drop repeats inside ALERT_DEDUPE_MS. Fingerprint =
 *     `<label>:<first 80 chars of message>` — coarse enough to
 *     coalesce stack-shifted repeats, specific enough to NOT merge
 *     unrelated crashes.
 *   - **Off-switch.** Unset `ALERT_WEBHOOK_URL` ⇒ no-op (we still
 *     update the dedupe map so tests that exercise dedupe work even
 *     without a webhook configured).
 */
import { env } from './env.js'

export interface AlertContext {
  /** Short, stable origin tag — e.g. 'server.unhandledRejection',
   *  'pod.uncaughtException'. Used in the dedupe fingerprint and
   *  prefixes the webhook message. */
  label: string
  /** The thing that was thrown. Stringified safely. */
  error: unknown
  /** Optional metadata (agentId, runId, etc.) appended as JSON. */
  extras?: Record<string, unknown>
}

const DISCORD_CONTENT_MAX = 1950 // Discord caps `content` at 2000 chars
const FINGERPRINT_PREFIX_LEN = 80

// Module-level state. Kept tiny on purpose — we only need the LAST
// timestamp per fingerprint, not a history.
const lastSentAt = new Map<string, number>()

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error'
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return String(err) }
}

function safeErrorStack(err: unknown): string | null {
  if (err instanceof Error && err.stack) return err.stack
  return null
}

function fingerprintOf(ctx: AlertContext): string {
  const msg = safeErrorMessage(ctx.error).slice(0, FINGERPRINT_PREFIX_LEN)
  return `${ctx.label}|${msg}`
}

/** Format the message body that gets sent to the webhook. Pure —
 *  exported so the unit test can pin the shape. */
export function formatAlertContent(ctx: AlertContext): string {
  const message = safeErrorMessage(ctx.error)
  const stack = safeErrorStack(ctx.error)
  const lines: string[] = []
  lines.push(`**[${ctx.label}]** ${message}`)
  if (ctx.extras && Object.keys(ctx.extras).length > 0) {
    try { lines.push('```json\n' + JSON.stringify(ctx.extras, null, 2) + '\n```') }
    catch { /* extras with circular refs etc. — skip silently */ }
  }
  if (stack) {
    lines.push('```\n' + stack + '\n```')
  }
  let out = lines.join('\n')
  if (out.length > DISCORD_CONTENT_MAX) out = out.slice(0, DISCORD_CONTENT_MAX - 3) + '...'
  return out
}

/** True iff the same fingerprint was alerted on within ALERT_DEDUPE_MS.
 *  Pure (modulo the module-level Map) — exported so the unit test can
 *  exercise dedupe behaviour without monkey-patching fetch. */
export function shouldSuppressAlert(ctx: AlertContext, nowMs: number = Date.now()): boolean {
  const fp = fingerprintOf(ctx)
  const prev = lastSentAt.get(fp)
  if (prev !== undefined && nowMs - prev < env.ALERT_DEDUPE_MS) return true
  lastSentAt.set(fp, nowMs)
  // Opportunistic cleanup of long-stale entries so the map doesn't grow
  // without bound across a process lifetime. Cheap when the map is
  // small; rare when the map is large.
  if (lastSentAt.size > 256) {
    const cutoff = nowMs - env.ALERT_DEDUPE_MS * 10
    for (const [k, t] of lastSentAt) if (t < cutoff) lastSentAt.delete(k)
  }
  return false
}

/** Fire an alert. Never throws, never blocks the caller. Returns the
 *  HTTP status code on success / null on no-op or transport failure —
 *  callers ignore the return; it exists for the test. */
export async function notifyAlert(ctx: AlertContext): Promise<number | null> {
  // Always log locally; the webhook is additive, not a replacement.
  try {
    const stack = safeErrorStack(ctx.error)
    console.error(`[alert] ${ctx.label}: ${safeErrorMessage(ctx.error)}`, stack ?? '')
  } catch { /* stderr full / closed — give up silently */ }

  if (shouldSuppressAlert(ctx)) return null
  if (!env.ALERT_WEBHOOK_URL) return null

  try {
    const body = JSON.stringify({ content: formatAlertContent(ctx) })
    // 5s timeout — a stuck webhook must not delay subsequent handlers.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5_000)
    try {
      const res = await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: ctrl.signal,
      })
      return res.status
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    try {
      console.warn(`[alert] webhook POST failed — alert dropped:`,
        err instanceof Error ? err.message : err)
    } catch { /* see above */ }
    return null
  }
}

/** Reset module-level dedupe state. Test-only — production code must
 *  never call this. */
export function _resetAlertingForTests(): void {
  lastSentAt.clear()
}
