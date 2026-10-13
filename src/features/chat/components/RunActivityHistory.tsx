import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { deserializeMessage } from '@/lib/nativeMessage'
import { userFacingError } from '@/lib/userFacingError'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { harnessApi } from '../runtime/harness-api'
import { NativeMessageContent } from './NativeMessageContent'

const historySchema = z.object({ total: z.number().int().nonnegative(), attention: z.number().int().nonnegative() })
function PageMessage() { return <MessagePrimitive.Root><NativeMessageContent /></MessagePrimitive.Root> }
function HistoryPage({ message }: { message: ThreadMessage }) {
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: false, onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message: PageMessage }} /></AssistantRuntimeProvider>
}

export function RunActivityHistory({ message }: { message: ThreadMessage }) {
  const parsed = historySchema.safeParse(message.metadata.custom.activityHistory)
  const [request, setRequest] = useState<{ offset: number; attention: boolean } | null>(null)
  const [page, setPage] = useState<{ message: ThreadMessage; total: number; nextOffset: number | null } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const { runId, senderId, conversationId, threadRootId } = message.metadata.custom
  const metadata = useRef(message.metadata.custom)
  metadata.current = message.metadata.custom
  const view = message.metadata.custom.harness as RunDisplayState | undefined
  useEffect(() => {
    if (!request || typeof runId !== 'string' || typeof senderId !== 'string' || typeof conversationId !== 'string') return
    const controller = new AbortController()
    setBusy(true); setError(null)
    void harnessApi.activity({ runId, agentId: senderId, conversationId, ...(typeof threadRootId === 'string' ? { threadId: threadRootId } : {}) }, request.offset, request.attention, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        // Keep product room identity while using the server's fresh control fence.
        const { activityHistory: _history, ...custom } = metadata.current
        setPage({ ...value, message: deserializeMessage({ ...value.message, metadata: { ...value.message.metadata,
          custom: { ...custom, ...value.message.metadata.custom } } }) })
      }).catch(cause => { if (!controller.signal.aborted) setError(userFacingError(cause, '活动记录暂时无法加载，请重试。')) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [request, runId, senderId, conversationId, threadRootId, view?.requestVersion, view?.fence, view?.lastSeq, message.metadata.custom.harnessControl])
  if (!parsed.success) return null
  const button = 'rounded text-sm underline outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return <section className="grid min-w-0 gap-3" aria-label="完整活动记录">
    <div className="flex flex-wrap gap-3">
      <button type="button" className={button} onClick={() => { setPage(null); setRequest({ offset: 0, attention: false }) }}>查看全部活动（{parsed.data.total} 条）</button>
      {parsed.data.attention > 0 && <button type="button" className={button} onClick={() => { setPage(null); setRequest({ offset: 0, attention: true }) }}>查看需要注意的记录（{parsed.data.attention} 条）</button>}
    </div>
    {busy && <p role="status">正在加载活动记录…</p>}
    {error && <div role="alert">{error}<button type="button" className={button} onClick={() => setRequest(value => value && { ...value })}>重试</button></div>}
    {page && request && <div className="grid min-w-0 gap-3 rounded border p-3" aria-busy={busy}>
      <p>活动记录 · {request.offset + 1}–{request.offset + page.message.content.length} / {page.total}</p>
      <HistoryPage message={page.message} />
      <nav className="flex gap-4" aria-label="活动分页">
        <button type="button" className={button} disabled={busy || request.offset === 0} onClick={() => setRequest({ ...request, offset: Math.max(0, request.offset - 40) })}>上一页活动</button>
        <button type="button" className={button} disabled={busy || page.nextOffset === null} onClick={() => page.nextOffset !== null && setRequest({ ...request, offset: page.nextOffset })}>下一页活动</button>
        <button type="button" className={button} onClick={() => { setRequest(null); setPage(null) }}>收起活动记录</button>
      </nav>
    </div>}
  </section>
}
