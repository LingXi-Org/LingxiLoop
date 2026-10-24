import type { AuthMeResponse } from './contracts'

interface ProductSessionSync {
  currentKey(): string | null
  currentEpoch(): number
  read(signal: AbortSignal): Promise<AuthMeResponse>
  clear(): void
  accept(me: AuthMeResponse, key: string): void
  failed(error: Error): void
}

/** A single observed Better Auth session owns this product-session request. */
export function synchronizeProductSession(key: string | null, sync: ProductSessionSync): () => void {
  const controller = new AbortController()
  if (!key) {
    sync.clear()
  } else {
    if (sync.currentKey() !== key) sync.clear()
    const epoch = sync.currentEpoch()
    const current = () => !controller.signal.aborted && sync.currentEpoch() === epoch
    const failed = (error: unknown) => sync.failed(error instanceof Error ? error : new Error('Session unavailable'))
    void sync.read(controller.signal).then(me => {
      if (!current()) return
      // A current acceptance can itself clear an invalid membership before
      // throwing. Its own synchronous rejection still needs a recoverable UI.
      try { sync.accept(me, key) } catch (error) { failed(error) }
    }).catch((error: unknown) => {
      if (current()) failed(error)
    })
  }
  return () => controller.abort()
}
