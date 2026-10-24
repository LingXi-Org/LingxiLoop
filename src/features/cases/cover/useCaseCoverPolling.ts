import { useEffect, useRef } from 'react'
import { startCoverPolling } from './polling'

/** scopeKey includes organization, selected case/search and target fingerprints/generations. */
export function useCaseCoverPolling<T>({ scopeKey, pending, refresh, receive }: {
  scopeKey: string
  pending: boolean
  refresh: (signal: AbortSignal) => Promise<T>
  receive: (value: T) => boolean
}) {
  const callbacks = useRef({ scopeKey, pending, refresh, receive })
  callbacks.current = { scopeKey, pending, refresh, receive }
  useEffect(() => {
    if (!pending) return
    const abort = new AbortController()
    const stop = startCoverPolling({
      signal: abort.signal,
      refresh: signal => callbacks.current.scopeKey === scopeKey && callbacks.current.pending
        ? callbacks.current.refresh(signal) : Promise.reject(new Error('cover scope changed')),
      receive: value => callbacks.current.scopeKey === scopeKey && callbacks.current.pending && callbacks.current.receive(value),
    })
    return () => { abort.abort(); stop() }
  }, [scopeKey, pending])
}
