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
import { useMessages } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import type { ApiMessage } from '@/api/contracts'
import { messagesApi } from '@/api/messages'
import { LingxiImMessage } from '@/components/messages/LingxiImMessage'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Composer } from '@/desktop/ChatPane'
import { LingxiAssistantRuntimeProvider } from '@/im/assistantRuntime'
import type { Message } from '@/types'

const EMPTY_MESSAGES: readonly Message[] = []

const THREAD_MESSAGE_COMPONENTS = { Message: () => <LingxiImMessage animate={false} /> }

function ThreadMessage({ messageId }: { messageId: string }) {
  return <ThreadPrimitive.Unstable_MessageById messageId={messageId} components={THREAD_MESSAGE_COMPONENTS} />
}

function apiToMessage(m: ApiMessage): Message {
  const raw = m as unknown as {
    tool?: Message['tool']
    attachment?: Message['attachment']
    quotedMessageId?: string | null
    quoted?: Message['quoted'] | null
    replyCount?: number | null
  }
  return {
    id: m.id,
    conversationId: m.conversationId,
    authorId: m.authorId,
    kind: m.kind,
    body: m.body,
    at: m.at ?? '',
    createdAt: m.createdAt,
    reactions: m.reactions && m.reactions.length > 0 ? m.reactions : undefined,
    tool: raw.tool ?? undefined,
    attachment: raw.attachment ?? undefined,
    quotedMessageId: raw.quotedMessageId ?? undefined,
    quoted: raw.quoted ?? undefined,
    replyCount: raw.replyCount ?? undefined,
    sequence: m.sequence,
  }
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
    messagesApi.getReplies(openThread.convoId, openThread.rootId)
      .then((rows) => {
        if (cancelled) return
        setReplies(rows.map(apiToMessage))
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
        className="border-l border-ink-100 overflow-hidden relative flex flex-col"
        style={{ background: 'linear-gradient(180deg, #FBFDFE, #F4F8FC)' }}
      >
      <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-ink-100">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">主题</div>
          <div className="text-[13px] text-ink-700 font-semibold mt-0.5">
            {visibleReplies.length} {visibleReplies.length === 1 ? "回复" : "回复"}
          </div>
        </div>
        <button
          onClick={close}
          aria-label="关闭线程"
          className="w-7 h-7 rounded-md grid place-items-center text-ink-500 hover:bg-cloud hover:text-ink-900 transition"
        >×</button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-4 py-4">
        {/* Root message — small visual treatment to distinguish from replies. */}
        <div className="rounded-lg border border-ink-100 bg-paper px-3 py-2.5">
          <ThreadMessage messageId={root.id} />
        </div>
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400 pt-1 border-t border-ink-100 -mb-2">
          回复
        </div>

        {loading && <ResourceSkeleton variant="list" count={3} compact label="正在加载回复" />}
        {err && <div className="text-[12px] text-coral-deep">{err}</div>}
        {!loading && !err && visibleReplies.length === 0 && (
          <div className="text-[12px] text-ink-400 italic">尚未回复 - 成为第一个。</div>
        )}
        {visibleReplies.map((message) => (
          <ThreadMessage key={message.clientId ?? message.id} messageId={message.id} />
        ))}
        </div>
      </ScrollArea>

      <div className="border-t border-ink-100 bg-cloud px-3 py-3">
        <div className="text-[10.5px] text-ink-400 mb-1.5">
          回复 <span className="text-skype-deep font-semibold">{rootAuthor?.name ?? root.authorId}</span>
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
