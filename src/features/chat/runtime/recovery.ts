// Bounds apply to one identity/scope generation; network wake-ups coalesce into
// the current cycle rather than extending its deadline or retry budget.
export const OUTBOX_RECOVERY = { batch: 20, passes: 5, attempts: 3, deadlineMs: 60_000, requestMs: 10_000 } as const
export const RUN_RECOVERY = { pollMs: 15_000, waitMs: 60_000, backgroundMs: 30_000, requestMs: 10_000 } as const

export function retryDelay(attempt: number, cap = 20_000): number {
  return Math.round(Math.min(cap, 1000 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5))
}

export function permanentRecoveryError(error: unknown): boolean {
  // Both existing API transports retain the HTTP status in their error text.
  return /(?:^|[\s:（(])(400|401|403|404|409|410|422)(?:$|[\s）)])/.test(String(error))
}

export function waitForRecovery(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => { window.clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = window.setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}
