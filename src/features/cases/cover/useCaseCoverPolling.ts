import { useCallback, useEffect, useRef } from 'react'
import { createCoverPollingController, listenForCoverPollingRecovery } from './polling'

/** scopeKey includes organization, selected case/search and target fingerprints/generations. */
export function useCaseCoverPolling<T>({ scopeKey, pending, refresh, receive }: {
  scopeKey: string
  pending: boolean
  refresh: (signal: AbortSignal) => Promise<T>
  receive: (value: T) => boolean
}) {
  const callbacks = useRef({ scopeKey, pending, refresh, receive })
  callbacks.current = { scopeKey, pending, refresh, receive }
  const session = useRef<{ scopeKey: string; resume: () => void } | null>(null)
  const resume = useCallback(() => {
    const current = callbacks.current
    if (current.pending && session.current?.scopeKey === current.scopeKey) session.current.resume()
  }, [])
  useEffect(() => {
    if (!pending) return
    const abort = new AbortController()
    const controller = createCoverPollingController({
      signal: abort.signal,
      refresh: signal => callbacks.current.scopeKey === scopeKey && callbacks.current.pending
        ? callbacks.current.refresh(signal) : Promise.reject(new Error('cover scope changed')),
      receive: value => callbacks.current.scopeKey === scopeKey && callbacks.current.pending && callbacks.current.receive(value),
    })
    session.current = { scopeKey, resume: controller.resume }
    const unsubscribe = listenForCoverPollingRecovery(controller.wake, document, window)
    return () => { session.current = null; unsubscribe(); abort.abort(); controller.stop() }
  }, [scopeKey, pending])
  return { resume }
}
