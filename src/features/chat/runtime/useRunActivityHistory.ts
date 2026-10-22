import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThreadMessage } from '@assistant-ui/react'
import { harnessApi, type AgentRunTarget } from './harness-api'
import { activityHistoryContext, beginActivityHistoryRequest, failActivityHistoryRequest, finishActivityHistoryRequest,
  historyOnlyEntries, initialActivityHistory, syncActivityHistory } from './runActivityHistory'

/** Read-only, explicitly requested activity pages; never mutates the live runtime. */
export function useRunActivityHistory({ target, message, enabled = true }: { target?: AgentRunTarget; message: ThreadMessage; enabled?: boolean }) {
  const context = enabled ? activityHistoryContext(target,message) : null
  const [initial, setStored] = useState(() => initialActivityHistory(context))
  const current = useRef({ state: initial, context })
  // Preserve same-sequence live receipts after they leave the bounded live window.
  // The ref contains only this consumer's read-only page cache, never runtime state.
  const state = syncActivityHistory(current.current.state,context)
  current.current = { state, context }
  const pending = useRef<{ token: symbol; controller: AbortController } | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; pending.current?.controller.abort(); pending.current = null }
  }, [])
  useEffect(() => {
    if (pending.current && pending.current.token !== current.current.state.request?.token) {
      pending.current.controller.abort(); pending.current = null
    }
  }, [state.scope,state.sequence,state.total])

  const loadMore = useCallback(() => {
    const now = current.current, token = Symbol('activity-page')
    const next = beginActivityHistoryRequest(now.state, now.context, token), request = next.request
    if (next === now.state || !request || !now.context) return
    pending.current?.controller.abort()
    const controller = new AbortController()
    pending.current = { token, controller }
    current.current = { ...now, state: next }; setStored(next)
    void harnessApi.activity(now.context.target,request.offset,false,controller.signal).then(page => {
      if (!mounted.current || controller.signal.aborted) return
      const latest = current.current
      const resolved = finishActivityHistoryRequest(latest.state,latest.context,request,page)
      if (resolved !== latest.state) { current.current = { ...latest,state: resolved }; setStored(resolved) }
    }).catch(() => {
      if (!mounted.current || controller.signal.aborted) return
      const latest = current.current
      const resolved = failActivityHistoryRequest(latest.state,latest.context,request)
      if (resolved !== latest.state) { current.current = { ...latest,state: resolved }; setStored(resolved) }
    }).finally(() => { if (pending.current?.token === token) pending.current = null })
  }, [])

  return { entries: historyOnlyEntries(state,message), total: state.total, hasMore: state.nextOffset !== null,
    isLoading: state.request !== null, error: state.error, loadMore, retry: loadMore }
}
