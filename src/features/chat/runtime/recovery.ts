// Bounds apply to one identity/scope generation; network wake-ups coalesce into
// the current cycle rather than extending its deadline or retry budget.
export const OUTBOX_RECOVERY = { batch: 20, passes: 5, attempts: 3, deadlineMs: 60_000, requestMs: 10_000 } as const
export const RUN_RECOVERY = { pollMs: 15_000, waitMs: 60_000, requestMs: 10_000 } as const
export const RUN_RECOVERY_MESSAGE = '暂时无法更新回复，请刷新重试。'

export function retryDelay(attempt: number, cap = 20_000): number {
  return Math.min(cap, Math.round(1000 * 2 ** Math.min(attempt, 5) * (0.75 + Math.random() * 0.5)))
}

export function recoveryHttpStatus(error: unknown): number | undefined {
  const match = /(?:^|[\s:（(])(\d{3})(?:$|[\s）)])/.exec(String(error))
  return match ? Number(match[1]) : undefined
}

export function permanentRecoveryError(error: unknown): boolean {
  // Both existing API transports retain the HTTP status in their error text.
  return [400,401,403,404,409,410,422].includes(recoveryHttpStatus(error) ?? 0)
}

export function waitForRecovery(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => { window.clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = window.setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}
