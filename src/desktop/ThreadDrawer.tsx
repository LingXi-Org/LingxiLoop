/**
 * Thread drawer — right-pane sidebar that lists every reply to a single
 * root message (i.e. all messages whose quoted_message_id == root.id).
 * Slack-style. Opens via the "N 条回复" link under each bubble.
 *
 * Data flow:
 *   - On mount / rootId change → GET /conversations/:id/messages/:rootId/replies
 *     once, then merge in the main message store's live / optimistic rows.
 *   - Composer at the bottom defaults to quoting the root (so any reply
 *     written here joins the same thread). On send we clear local input
 *     but keep the drawer open.
 */
import { useEffect, useMemo, useState } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import { useSurface } from '@/stores/surface'
import { loadThreadReplies, useMessages } from '@/features/chat/state/messages'
import { useParticipants } from '@/features/agents/state'
import { LingxiImMessage } from '@/components/messages/LingxiImMessage'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Composer } from '@/desktop/ChatPane'
import { LingxiAssistantRuntimeProvider } from '@/im/assistantRuntime'
import type { Message } from '@/types'

const EMPTY_MESSAGES: readonly Message[] = []

const THREAD_MESSAGE_COMPONENTS = { Message: () => <LingxiImMessage animate={false} /> }

function ThreadMessage({ messageId }: { messageId: string }) {
  return <ThreadPrimitive.Unstable_MessageById messageId={messageId} components={THREAD_MESSAGE_COMPONENTS} />
}

export function ThreadDrawer() {
  const surface = useSurface((s) => s.surface)
  const openThread = surface?.kind === 'thread' ? surface : null
  const close = useSurface((s) => s.closeThreadView)
  const byId = useParticipants((s) => s.byId)
  const convoMessages = useMessages((s) =>
    openThread ? (s.byConvo[openThread.convoId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )
  const root = useMessages((s) => {
    if (!openThread) return undefined
    return (s.byConvo[openThread.convoId] ?? []).find((m) => m.id === openThread.rootId)
  })

  const [replies, setReplies] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const liveReplies = useMemo(() => {
    if (!openThread) return []
    return convoMessages.filter((m) => m.quotedMessageId === openThread.rootId)
  }, [convoMessages, openThread?.rootId])

  const visibleReplies = useMemo(() => {
    const out = [...replies]

    for (const live of liveReplies) {
      const idx = out.findIndex((existing) =>
        existing.id === live.id
          || (!!existing.clientId && existing.clientId === live.clientId)
          || (!!live.clientId && existing.clientId === live.clientId),
      )
      if (idx >= 0) out[idx] = live
      else out.push(live)
    }

    return out
  }, [replies, liveReplies])
  const runtimeMessages = useMemo(
    () => root ? [root, ...visibleReplies] : visibleReplies,
    [root, visibleReplies],
  )

  // Refetch on (convoId, rootId) change. The fetched snapshot covers replies
  // already persisted on the server; visibleReplies above folds in messages
  // that arrive over WS or are optimistically inserted by sendUserMessage.
  useEffect(() => {
    if (!openThread) return
    let cancelled = false
    setLoading(true); setErr(null)
    loadThreadReplies(openThread.convoId, openThread.rootId)
      .then((rows) => {
        if (cancelled) return
        setReplies(rows)
      })
      .catch((e) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [openThread])

  if (!openThread || !root) return null

  const rootAuthor = byId[root.authorId]

  return (
    <LingxiAssistantRuntimeProvider messages={runtimeMessages}>
      <aside
        className="relative flex flex-col overflow-hidden border-s border-border bg-background"
      >
      <header className="mx-2 mt-2 flex min-h-12 items-center justify-between rounded-2xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sidebar-foreground shadow-sm backdrop-blur-xl">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">主题</div>
          <div className="mt-0.5 text-[13px] font-semibold text-foreground">
            {visibleReplies.length} {visibleReplies.length === 1 ? "回复" : "回复"}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={close}
          aria-label="关闭线程"
          className="text-muted-foreground"
        >×</Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-4 py-4">
        {/* Root message — small visual treatment to distinguish from replies. */}
        <div className="rounded-3xl border border-border bg-card px-3 py-2.5">
          <ThreadMessage messageId={root.id} />
        </div>
        <div className="-mb-2 border-t border-border pt-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          回复
        </div>

        {loading && <ResourceSkeleton variant="list" count={3} compact label="正在加载回复" />}
        {err && <div className="text-[12px] text-destructive">{err}</div>}
        {!loading && !err && visibleReplies.length === 0 && (
          <div className="text-[12px] italic text-muted-foreground">尚未回复 - 成为第一个。</div>
        )}
        {visibleReplies.map((message) => (
          <ThreadMessage key={message.clientId ?? message.id} messageId={message.id} />
        ))}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-muted/40 px-3 py-3">
        <div className="mb-1.5 text-[10.5px] text-muted-foreground">
          回复 <span className="font-semibold text-primary">{rootAuthor?.name ?? root.authorId}</span>
        </div>
        <Composer
          convoId={openThread.convoId}
          threadRootId={openThread.rootId}
          placeholder="在帖子中回复..."
        />
      </div>
      </aside>
    </LingxiAssistantRuntimeProvider>
  )
}
