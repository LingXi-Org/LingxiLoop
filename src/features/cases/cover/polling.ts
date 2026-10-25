import type { GeneratedCaseCover } from '../api'

/** A background cover refresh cannot replace the reader/editor snapshot. */
export function mergeCaseCoverMetadata<T extends { id: string; generatedCover?: GeneratedCaseCover | null }>(current: T, incoming: T): T {
  if (current.id !== incoming.id || !current.generatedCover || !incoming.generatedCover
    || current.generatedCover.fingerprint !== incoming.generatedCover.fingerprint
    || current.generatedCover.generation !== incoming.generatedCover.generation) return current
  return { ...current, generatedCover: incoming.generatedCover }
}

export const COVER_POLL_LIMIT = 64
export const COVER_POLL_WINDOW_MS = 600_000
export function coverPollDelay(attempt: number) { return Math.min(2_000 * 1.4 ** attempt, 10_000) }

type CoverPollingOptions<T> = {
  refresh: (signal: AbortSignal) => Promise<T>
  receive: (value: T) => boolean
  signal: AbortSignal
  now?: () => number
  schedule?: typeof setTimeout
  cancel?: typeof clearTimeout
  immediate?: boolean
  onStop?: () => void
}

/** One bounded session per page/scope; caller only adopts cover metadata. */
export function startCoverPolling<T>({ refresh, receive, signal, now = Date.now, schedule = setTimeout, cancel = clearTimeout, immediate = false, onStop }: CoverPollingOptions<T>) {
  const startedAt = now()
  let attempts = 0
  let stopped = signal.aborted
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const request = new AbortController()
  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer !== undefined) cancel(timer)
    if (deadline !== undefined) cancel(deadline)
    request.abort()
    signal.removeEventListener('abort', stop)
    onStop?.()
  }
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
      if (!receive(value)) { stop(); return }
    } catch {
      if (stopped) return
      // A transient read failure must not strand pending metadata. The same
      // deadline/read budget bounds unsuccessful reads as successful ones.
    }
    queue()
  }
  signal.addEventListener('abort', stop, { once: true })
  if (!stopped) deadline = schedule(stop, COVER_POLL_WINDOW_MS)
  if (immediate && !stopped) void poll()
  else queue()
  return stop
}

/** Explicit recovery creates a new bounded session; background wakeups never
 * reset an active session's deadline. Disposed scopes cannot be resumed. */
export function createCoverPollingController<T>(options: CoverPollingOptions<T>) {
  let disposed = options.signal.aborted
  let active = false
  let stopSession: (() => void) | undefined
  const start = (immediate: boolean) => {
    if (disposed || options.signal.aborted) return
    stopSession?.()
    active = true
    stopSession = startCoverPolling({ ...options, immediate, onStop: () => { active = false } })
  }
  const stop = () => {
    disposed = true
    stopSession?.()
    options.signal.removeEventListener('abort', stop)
  }
  options.signal.addEventListener('abort', stop, { once: true })
  start(false)
  return {
    resume: () => start(true),
    wake: () => { if (!active) start(true) },
    stop,
  }
}

/** A hidden tab does not restart work until it becomes visible. */
export function listenForCoverPollingRecovery(wake: () => void, page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>, network: Pick<Window, 'addEventListener' | 'removeEventListener'>) {
  const visible = () => { if (page.visibilityState === 'visible') wake() }
  page.addEventListener('visibilitychange', visible)
  network.addEventListener('online', visible)
  return () => {
    page.removeEventListener('visibilitychange', visible)
    network.removeEventListener('online', visible)
  }
}
