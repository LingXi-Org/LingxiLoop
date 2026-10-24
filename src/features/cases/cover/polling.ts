export const COVER_POLL_LIMIT = 24
export const COVER_POLL_WINDOW_MS = 120_000
export function coverPollDelay(attempt: number) { return Math.min(2_000 * 1.4 ** attempt, 10_000) }

/** One bounded subscription per page/scope; caller only adopts cover metadata. */
export function startCoverPolling<T>({ refresh, receive, signal, now = Date.now, schedule = setTimeout, cancel = clearTimeout }: {
  refresh: (signal: AbortSignal) => Promise<T>
  receive: (value: T) => boolean
  signal: AbortSignal
  now?: () => number
  schedule?: typeof setTimeout
  cancel?: typeof clearTimeout
}) {
  const startedAt = now()
  let attempts = 0
  let failures = 0
  let stopped = signal.aborted
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const request = new AbortController()
  const stop = () => { stopped = true; if (timer !== undefined) cancel(timer); if (deadline !== undefined) cancel(deadline); request.abort(); signal.removeEventListener('abort', stop) }
  const queue = () => {
    if (stopped || attempts >= COVER_POLL_LIMIT || now() - startedAt >= COVER_POLL_WINDOW_MS) { stop(); return }
    timer = schedule(() => { void poll() }, coverPollDelay(attempts))
  }
  const poll = async () => {
    if (stopped || now() - startedAt >= COVER_POLL_WINDOW_MS) { stop(); return }
    attempts += 1
    try {
      const value = await refresh(request.signal)
      if (stopped || now() - startedAt >= COVER_POLL_WINDOW_MS) { stop(); return }
      failures = 0
      if (!receive(value)) { stop(); return }
    } catch {
      if (stopped) return
      failures += 1
      if (failures >= 3) { stop(); return }
    }
    queue()
  }
  signal.addEventListener('abort', stop, { once: true })
  if (!stopped) deadline = schedule(stop, COVER_POLL_WINDOW_MS)
  queue()
  return stop
}
