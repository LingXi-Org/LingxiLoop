import type { AuthMeResponse } from './contracts'

interface ProductSessionSync {
  currentKey(): string | null
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
    void sync.read(controller.signal).then(me => {
      if (!controller.signal.aborted) sync.accept(me, key)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) sync.failed(error instanceof Error ? error : new Error('Session unavailable'))
    })
  }
  return () => controller.abort()
}
