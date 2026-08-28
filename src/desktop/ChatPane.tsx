import { useAuiState } from '@assistant-ui/react'
import { agentsApi } from '@/api/agents'
import type { ApiCoworkerActivity } from '@/api/contracts'
import { type MutableRefObject, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { ws } from '@/api/core/realtime'
import { ICanvas, ISearch } from '@/components/icons'
import { LingxiImMessage } from '@/components/messages/LingxiImMessage'
import { AgentTypingIndicator } from '@/components/messages/AgentTypingIndicator'
import { ScrollToLatestButton } from '@/components/ScrollToLatestButton'
import { ConversationHeader } from '@/im/ConversationHeader'
import { MessageList } from '@/im/MessageList'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { applyFindHighlights, clearFindHighlights } from '@/lib/findHighlights'
import { cn } from '@/lib/utils'
import { projectFindMatches } from '@/lib/transcriptExperience'
import { useApp } from '@/stores/app'
import { useConversationUi } from '@/stores/conversationUi'
import { useSurface } from '@/stores/surface'
import { useUiCommand } from '@/stores/uiCommands'
import { useConversations } from '@/stores/conversations'
import type { MessagesState } from '@/stores/messages'
import { messagesFor, useMessages, VIRTUOSO_FIRST_INDEX_BASE } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import type { Participant } from '@/types'
import { Composer } from './ChatComposer'

export { Composer } from './ChatComposer'

function DesktopRuntimeEntry({ index, initialIdsRef, animatedIdsRef, searchOpen, matchedIds, currentMessageId }: {
  index: number
  initialIdsRef: MutableRefObject<Set<string> | null>
  animatedIdsRef: MutableRefObject<Set<string>>
  searchOpen: boolean
  matchedIds: ReadonlySet<string>
  currentMessageId?: string
}) {
  const custom = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const { message } = custom
  const wasInitial = initialIdsRef.current?.has(message.id) ?? false
  const delay = wasInitial ? Math.min(index * 30, 200) : 0
  const firstAnimation = !animatedIdsRef.current.has(message.id)
  if (firstAnimation) animatedIdsRef.current.add(message.id)
  const isMatch = searchOpen && matchedIds.has(message.id)
  const isCurrent = isMatch && currentMessageId === message.id
  return (
    <div
      data-msg-id={message.id}
      data-find-message-id={message.id}
      className={cn(
        'mx-auto w-full max-w-[900px] rounded-[10px] px-5 transition-shadow',
        custom.continuedFromPrevious ? 'pt-px' : 'pt-[9px]',
        custom.continuedToNext ? 'pb-px' : 'pb-[9px]',
        isMatch && 'find-row-match',
        isCurrent && 'find-row-current',
      )}
    >
      <LingxiImMessage delay={delay} animate={firstAnimation} openMaus />
    </div>
  )
}

/** Soft "Coming soon" popover anchored beneath the trigger. Auto-dismisses
 *  after a beat; also closes on outside-click or Escape. The sparkle
 *  drifts gently so the bubble feels alive rather than static. */
function ThreadLoader() {
  return (
    <div
      className="grid place-items-center py-16"
      style={{ animation: 'lingxiloop-empty-in 280ms ease-out both' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-14 h-14 grid place-items-center">
          {/* Ambient halo behind the dots */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0, 168, 240, 0.18), transparent 70%)',
              animation: 'lingxiloop-halo 2.4s ease-in-out infinite',
            }}
          />
          <div className="relative flex items-end gap-[5px] h-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[7px] h-[7px] rounded-full"
                style={{
                  background: 'var(--skype)',
                  boxShadow: '0 1px 4px rgba(0, 168, 240, 0.45)',
                  animation: 'lingxiloop-pulse-dot 1.2s ease-in-out infinite',
                  animationDelay: `${i * 160}ms`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="font-display italic text-[13px] text-ink-500 tracking-tight">
          正在加载消息…
        </div>
      </div>
    </div>
  )
}

function ThreadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [retrying, setRetrying] = useState(false)
  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try { await onRetry() } finally { setRetrying(false) }
  }
  return (
    <div
      className="grid place-items-center py-12 px-6"
      style={{ animation: 'lingxiloop-empty-in 280ms ease-out both' }}
    >
      <div
        className="flex flex-col items-center text-center max-w-[340px] gap-3 rounded-2xl px-6 py-6 backdrop-blur-sm"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 217, 210, 0.18))',
          border: '1px solid rgba(255, 122, 107, 0.18)',
          boxShadow: '0 12px 32px -16px rgba(200, 78, 63, 0.25)',
        }}
      >
        <div
          className="w-10 h-10 rounded-full grid place-items-center"
          style={{
            background: 'rgba(255, 122, 107, 0.12)',
            color: 'var(--coral-deep)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]" aria-hidden>
            <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.2" r="1" fill="currentColor" />
            <path
              d="M10.6 3.6a1.6 1.6 0 0 1 2.8 0l8.1 14.4a1.6 1.6 0 0 1-1.4 2.4H3.9a1.6 1.6 0 0 1-1.4-2.4l8.1-14.4Z"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="font-display font-medium text-[15px] tracking-tight text-ink-700">
          无法加载消息
        </div>
        <div className="text-[12.5px] text-ink-500 leading-relaxed break-words">
          {message}
        </div>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-1 h-[30px] px-3.5 rounded-full font-semibold text-[12px] text-white inline-flex items-center gap-1.5 transition disabled:cursor-not-allowed"
          style={{
            background: retrying ? 'var(--ink-300)' : 'var(--skype)',
            boxShadow: retrying ? 'none' : '0 4px 12px -3px rgba(0, 168, 240, 0.5)',
          }}
        >
          {retrying ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              正在重试…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" aria-hidden>
                <path
                  d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              重试
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function OpenMausEmptyConversationState() {
  const total = useConversations((s) => s.list.length)
  return (
    <main className="chat-surface omb-titlebar-safe omb-drag grid h-full min-w-0 place-items-center">
      <div className="omb-no-drag flex max-w-sm flex-col items-center gap-3 px-8 text-center">
        <img src="/logo.png" alt="" className="size-14 rounded-2xl opacity-90" draggable={false} />
        <h1 className="text-[17px] font-semibold text-ink">选择一个会话开始交流</h1>
        <p className="text-[13px] leading-6 text-ink-secondary">
          {total > 0 ? `左侧共有 ${total} 个会话。你也可以搜索消息，或新建群聊。` : '新消息和 Agent 的实时进度会显示在这里。'}
        </p>
      </div>
    </main>
  )
}

function ConversationActivity({ conversationId }: { conversationId: string }) {
  const [events, setEvents] = useState<ApiCoworkerActivity[]>([])
  useEffect(() => {
    let cancelled = false
    setEvents([])
    const merge = (rows: ApiCoworkerActivity[]) => {
      if (cancelled) return
      setEvents((current) => {
        const byId = new Map(current.map((event) => [event.id, event]))
        for (const event of rows) byId.set(event.id, event)
        return [...byId.values()]
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(-12)
      })
    }
    const refresh = () => void agentsApi.getCoworkerActivity(conversationId)
      .then(merge)
      .catch(() => { /* activity is best-effort; chat remains primary */ })
    refresh()
    void ws.connect()
    const off = ws.on((event) => {
      if (event.type === 'agent.activity' && event.conversationIds.includes(conversationId)) {
        merge([event.activity])
      } else if (event.type === 'hello') {
        // Reconcile anything missed while the socket was disconnected.
        refresh()
      }
    })
    // Slow REST reconciliation is only a fallback for dropped/backpressured WS
    // frames; live activity arrives through the same realtime path as messages.
    const timer = window.setInterval(refresh, 60_000)
    return () => { cancelled = true; off(); window.clearInterval(timer) }
  }, [conversationId])
  const visible = events.slice(-3)
  if (visible.length === 0) return null
  // A run emits multiple activity rows. Only its newest row represents the
  // current state; otherwise an older run.started row can outlive a later
  // run.completed row and leave the strip pulsing forever.
  const latestByRun = new Map<string, ApiCoworkerActivity>()
  for (const event of events) latestByRun.set(event.runId, event)
  const active = [...latestByRun.values()].reverse()
    .find((event) => event.runStatus === 'running' || event.runStatus === 'waiting_for_human')
  return (
    <div className="border-b border-hairline bg-panel px-5 py-2" role="status" aria-label="Agent 最近活动">
      <div className="mx-auto flex max-w-[900px] items-center gap-3 overflow-hidden">
        <span className={`size-2 shrink-0 rounded-full ${active ? 'animate-pulse bg-[var(--working)]' : 'bg-[var(--avail)]'}`} />
        <span className="shrink-0 text-[11px] font-semibold text-ink-secondary">
          {active ? `${active.agentName}${active.runStatus === 'waiting_for_human' ? ' 正在等待你' : ' 正在工作'}` : '最近活动'}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {visible.map((event) => (
            <span key={event.id} className="max-w-[240px] truncate rounded-full bg-raised px-2.5 py-1 text-[10.5px] text-ink-500" title={event.title}>
              {/completed/.test(event.kind) ? '✓' : /failed/.test(event.kind) ? '!' : '●'} {event.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ChatPane({
  onBackToConversations,
  onOpenGroupContext,
}: {
  onBackToConversations?: () => void
  onOpenGroupContext?: () => void
} = {}) {
  const convoId = useApp((s) => s.selectedConversationId)
  const uiCommand = useUiCommand()
  // Atomic selectors — primitive / stable refs
  const byConvo = useMessages((s) => (convoId ? s.byConvo[convoId] : undefined))
  const streaming = useMessages((s) => s.streaming)
  const typingIds = useMessages((s) => (convoId ? s.typing[convoId] ?? null : null))
  const isLoading = useMessages((s) => (convoId ? s.loading.has(convoId) : false))
  // ThreadLoader visibility — the textbook loader-flicker pattern, with
  // BOTH guards in place:
  //   show-delay (400 ms): nothing renders until the load has been in
  //     flight that long. Cached convos / 404s / fast network loads all
  //     finish before this fires, so the loader stays hidden entirely.
  //   min-visible (500 ms): once the loader DOES appear, it must stay
  //     visible at least that long. Without this, a load that crosses
  //     the 400 ms threshold and finishes 80 ms later would flash the
  //     loader for 80 ms — exactly the "appears then immediately
  //     disappears" UX the user reported.
  //   Net: loads < 400 ms never show the loader; loads 400-900 ms show
  //   it for 500-900 ms (smooth, no flicker); loads > 900 ms show it
  //   for the full duration.
  const [showLoader, setShowLoader] = useState(false)
  const loaderTimers = useRef<{ show: number | null; hide: number | null; shownAt: number | null }>({
    show: null, hide: null, shownAt: null,
  })
  useEffect(() => {
    const t = loaderTimers.current
    if (t.show !== null) { window.clearTimeout(t.show); t.show = null }
    if (t.hide !== null) { window.clearTimeout(t.hide); t.hide = null }

    if (isLoading) {
      if (t.shownAt !== null) return  // already visible
      t.show = window.setTimeout(() => {
        setShowLoader(true)
        t.shownAt = Date.now()
        t.show = null
      }, 400)
      return
    }
    // Loading ended.
    if (t.shownAt === null) {
      setShowLoader(false)
      return
    }
    const elapsed = Date.now() - t.shownAt
    const remaining = Math.max(0, 500 - elapsed)
    if (remaining === 0) {
      setShowLoader(false)
      t.shownAt = null
      return
    }
    t.hide = window.setTimeout(() => {
      setShowLoader(false)
      t.shownAt = null
      t.hide = null
    }, remaining)
  }, [isLoading, convoId])
  useEffect(() => () => {
    const t = loaderTimers.current
    if (t.show !== null) window.clearTimeout(t.show)
    if (t.hide !== null) window.clearTimeout(t.hide)
  }, [])
  const loadError = useMessages((s) => (convoId ? s.errors[convoId] ?? null : null))
  const retryLoad = useMessages((s) => s.retryLoad)
  // Compose with memo so the rendered array ref stays stable when inputs do
  const list = useMemo(
    () => messagesFor({ byConvo: byConvo ? { [convoId!]: byConvo } : {}, streaming, typing: convoId ? { [convoId]: typingIds } : {} } as MessagesState, convoId)
      .filter((message) => message.streaming !== 'placeholder'),
    [byConvo, streaming, typingIds, convoId],
  )
  const conversations = useConversations((s) => s.list)
  const c = useMemo(() => conversations.find((x) => x.id === convoId), [conversations, convoId])
  const byId = useParticipants((s) => s.byId)
  const typingAgents = useMemo(() => {
    const ids = new Set(typingIds ?? [])
    for (const entry of Object.values(streaming)) {
      if (entry.conversationId === convoId && !entry.body) ids.add(entry.authorId)
    }
    return [...ids]
      .map((id) => byId[id])
      .filter((participant): participant is Participant => participant?.kind === 'agent')
  }, [typingIds, streaming, convoId, byId])
  const streamRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  // Whether the scroll is currently anchored to the latest message — drives
  // the bottom-right "scroll to latest" pill that appears once the user
  // scrolls up. Default true so the pill stays hidden on first mount.
  const [atBottom, setAtBottom] = useState(true)
  const scrollToLatest = useCallback(() => {
    if (list.length === 0) return
    virtuosoRef.current?.scrollToIndex({ index: list.length - 1, align: 'end', behavior: 'smooth' })
  }, [list.length])

  // Older-history pager — virtualization keeps the DOM small; this fetches
  // the next page upward when the user scrolls past the top.
  const hasMoreOlder = useMessages((s) => (convoId ? s.hasMoreOlder[convoId] ?? false : false))
  const loadingOlder = useMessages((s) => (convoId ? s.loadingOlder.has(convoId) : false))
  const loadOlder = useMessages((s) => s.loadOlder)
  // Anchor for upward pagination — the store decrements this per prepend so
  // Virtuoso holds scroll position when older history pages in.
  const firstItemIndex = useMessages((s) => (convoId ? s.firstItemIndex[convoId] ?? VIRTUOSO_FIRST_INDEX_BASE : VIRTUOSO_FIRST_INDEX_BASE))
  const onStartReached = useCallback(() => {
    if (!convoId) return
    if (!hasMoreOlder || loadingOlder) return
    void loadOlder(convoId)
  }, [convoId, hasMoreOlder, loadingOlder, loadOlder])

  // In-conversation search — opened by the chat-header search icon.
  // We don't filter the thread; we highlight matching rows in place and
  // jump between them with the up/down arrows or Enter / Shift+Enter.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [matchIdx, setMatchIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const findMatches = useMemo(() => projectFindMatches(list, deferredSearchQuery), [list, deferredSearchQuery])
  const currentMatch = findMatches[matchIdx] ?? null
  const matchedIds = useMemo(() => new Set(findMatches.map((match) => match.messageId)), [findMatches])
  // Reset the search when the user navigates to a different conversation.
  useEffect(() => {
    setSearchOpen(false); setSearchQuery(''); setMatchIdx(0)
  }, [convoId])
  // Reset to the first hit whenever the result set changes.
  useEffect(() => { setMatchIdx(0) }, [deferredSearchQuery, findMatches.length])
  // Scroll the current hit into view. We virtualize the message list so a
  // matched row may not even be mounted yet — virtuoso's scrollToIndex
  // mounts and centers it in one go.
  useEffect(() => {
    const id = currentMatch?.messageId
    if (!id) return
    const index = list.findIndex((m) => m.id === id)
    if (index < 0) return
    virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' })
  }, [currentMatch?.messageId, currentMatch?.occurrence, list])

  useEffect(() => {
    if (!searchOpen) { clearFindHighlights(); return }
    const frame = window.requestAnimationFrame(() => {
      applyFindHighlights(streamRef.current, deferredSearchQuery, currentMatch)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen, deferredSearchQuery, currentMatch, list])

  const refreshFindHighlights = useCallback(() => {
    if (!searchOpen) return
    window.requestAnimationFrame(() => applyFindHighlights(streamRef.current, deferredSearchQuery, currentMatch))
  }, [searchOpen, deferredSearchQuery, currentMatch])

  useEffect(() => () => clearFindHighlights(), [])

  useEffect(() => {
    if (uiCommand?.type === 'find-chat') setSearchOpen(true)
  }, [uiCommand])

  // Centralized "jump to message" — quote clicks and `#N` chips both set
  // useApp.pendingJumpMessageId and we resolve it here. virtuoso.scrollToIndex
  // mounts off-screen rows reliably; previously a quote click that lost its
  // DOM element (Virtuoso recycled it) silently did nothing. Once the target
  // is mounted we briefly flash it like the old quote jump did.
  const pendingJumpId = useConversationUi((s) => s.pendingJumpMessageId)
  const clearPendingJump = useConversationUi((s) => s.clearPendingJump)
  useEffect(() => {
    if (!pendingJumpId) return
    const index = list.findIndex((m) => m.id === pendingJumpId)
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' })
      // Wait for Virtuoso to mount the row (smooth scroll + recycle ≈ 0–500ms),
      // then flash it. Poll briefly because mount timing varies.
      const targetId = pendingJumpId
      const deadline = Date.now() + 800
      const tryFlash = (): void => {
        const el = document.getElementById(`m-${targetId}`)
        if (el) {
          el.classList.add('quote-jump-flash')
          window.setTimeout(() => el.classList.remove('quote-jump-flash'), 1400)
        } else if (Date.now() < deadline) {
          window.setTimeout(tryFlash, 60)
        }
      }
      window.setTimeout(tryFlash, 80)
    }
    // Clear after we've handled it so a repeat click on the same id re-fires.
    clearPendingJump()
  }, [pendingJumpId, list, clearPendingJump])
  // Auto-focus the search input when the bar opens.
  useEffect(() => {
    if (searchOpen) {
      // requestAnimationFrame: wait for the input to mount.
      const h = window.requestAnimationFrame(() => searchInputRef.current?.focus())
      return () => window.cancelAnimationFrame(h)
    }
  }, [searchOpen])

  // Track which message IDs were already present when this conversation
  // first opened — those get the "initial wave" stagger. Anything that lands
  // after that is brand-new and animates immediately (delay 0), so the thread
  // doesn't blink with empty space while the new row waits its turn.
  const initialIdsRef = useRef<Set<string> | null>(null)
  // Messages that have already played their rise-in fade this convo session.
  // Virtuoso unmounts/remounts rows as you scroll or jump to a quote, and a
  // remount replays the fade — that's the "the quoted message reloads / fades
  // back in after the flash" bug. Animate each message at most once per open.
  const animatedIdsRef = useRef<Set<string>>(new Set())
  const lastConvoRef = useRef<string | null>(null)
  // Sticky "first scroll for this convo hasn't happened yet" flag. The effect
  // below can't compare lastConvoRef to convoId because we sync the ref here
  // at render time — by the time the effect runs they're already equal. The
  // flag stays true until messages actually land and we do the instant snap.
  const pendingConvoSwitchRef = useRef(true)
  if (lastConvoRef.current !== convoId) {
    lastConvoRef.current = convoId
    initialIdsRef.current = new Set(list.map((m) => m.id))
    pendingConvoSwitchRef.current = true
    animatedIdsRef.current = new Set()
  } else if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(list.map((m) => m.id))
  }

  useEffect(() => {
    // Virtuoso's `followOutput` keeps appended messages glued to the bottom;
    // we only need to do an explicit jump when the user switches into a
    // conversation that already had messages loaded (initialTopMostItemIndex
    // only fires on first mount, not on convo switches within the same
    // mounted instance).
    if (list.length === 0) return
    const isConvoSwitch = pendingConvoSwitchRef.current
    pendingConvoSwitchRef.current = false
    if (isConvoSwitch) {
      virtuosoRef.current?.scrollToIndex({ index: list.length - 1, align: 'end', behavior: 'auto' })
    }
  }, [list.length, convoId])

  // IMPORTANT: every hook in this component must run on EVERY render —
  // React enforces a stable hook order. The "no conversation selected"
  // branch lives below the hooks, not in their middle. (Previously this
  // useMemo sat after an early return, so leaving a group / clearing
  // the selection dropped the hook count between renders and crashed
  // the tree with "Rendered fewer hooks than expected".)
  // Render the empty state until the selected conversation belongs to the
  // current list. During a company switch the old convoId can survive for
  // a render while the new tenant's conversations are loading; requiring
  // `c` here keeps the composer from flashing before the cloud appears.
  if (!convoId || !c) {
    return <OpenMausEmptyConversationState />
  }

  return (
    <main
      className="chat-surface grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] overflow-hidden"
    >
      <ConversationHeader
        conversationId={convoId}
        onBack={onBackToConversations}
        onOpenDetails={() => {
          const participantId = c.members.find((id) => byId[id]?.kind === 'agent')
          if (participantId) useSurface.getState().openAgentInfo(participantId)
        }}
        actions={(
          <>
            {c.kind === 'group' && onOpenGroupContext && <button
              type="button"
              onClick={onOpenGroupContext}
              title="打开知识库和 Canvas"
              aria-label="打开群聊上下文"
              className="grid size-10 place-items-center rounded-full text-ink-secondary transition hover:bg-raised hover:text-ink"
            >
              <ICanvas className="size-[18px]" />
            </button>}
            <button
              type="button"
              onClick={() => setSearchOpen((value) => !value)}
              title="搜索当前会话"
              aria-label="搜索当前会话"
              className={cn('grid size-10 place-items-center rounded-full transition', searchOpen ? 'bg-raised text-accent' : 'text-ink-secondary hover:bg-raised hover:text-ink')}
            >
              <ISearch className="size-[18px]" />
            </button>
          </>
        )}
      />
      {/* Keep optional chrome in one stable grid cell. ConversationActivity
          returns null when there are no events; rendering it as a top-level
          grid child used to shift the message list into an auto row and the
          composer into the flexible row, collapsing the chat. */}
      <div data-chat-auxiliary="true">
        <ConversationActivity conversationId={convoId} />
        {searchOpen && (
          <div className="chat-find-toolbar flex items-center gap-2 border-b border-hairline bg-panel px-5 py-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-raised/70 px-3 py-1.5 text-[13px] text-ink-secondary focus-within:ring-1 focus-within:ring-accent">
            <ISearch className="w-3.5 h-3.5" strokeWidth={2} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); return }
                const n = findMatches.length
                if (n === 0) return
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setMatchIdx((i) => (i + 1) % n); return }
                if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') { e.preventDefault(); setMatchIdx((i) => (i - 1 + n) % n); return }
                if (e.key === 'ArrowDown') { e.preventDefault(); setMatchIdx((i) => (i + 1) % n) }
              }}
              placeholder="搜索当前会话…"
              className="flex-1 min-w-0 bg-transparent outline-none text-ink-900 placeholder:text-ink-300"
            />
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-300">
              {findMatches.length === 0
                ? (searchQuery.trim() ? '无匹配' : '')
                : `${matchIdx + 1} / ${findMatches.length}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMatchIdx((i) => (i - 1 + findMatches.length) % Math.max(1, findMatches.length))}
            disabled={findMatches.length === 0}
            title="上一个匹配项（Shift+Enter / ↑）"
            className="size-10 rounded-[8px] grid shrink-0 place-items-center text-ink-500 hover:bg-sky2-50 hover:text-skype-deep transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMatchIdx((i) => (i + 1) % Math.max(1, findMatches.length))}
            disabled={findMatches.length === 0}
            title="下一个匹配项（Enter / ↓）"
            className="size-10 rounded-[8px] grid shrink-0 place-items-center text-ink-500 hover:bg-sky2-50 hover:text-skype-deep transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setSearchOpen(false); setSearchQuery('') }}
            title="关闭（Esc）"
            className="size-10 rounded-[8px] grid shrink-0 place-items-center text-ink-500 hover:bg-sky2-50 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          </div>
        )}
      </div>
      <div ref={streamRef} className="min-h-0 relative">
        {/* Empty-state branches: an error from the initial fetch wins over the
            loader (a stale spinner under an error message would be confusing).
            Both only render when the thread itself is empty — once any messages
            have landed we let the regular list take over so a transient WS
            reconnect blip doesn't yank the conversation out from under the
            user. */}
        {list.length === 0 && loadError ? (
          <div className="px-6 py-6">
            <ThreadError message={loadError} onRetry={() => retryLoad(convoId)} />
          </div>
        ) : list.length === 0 && showLoader ? (
          <div className="px-6 py-6">
            <ThreadLoader />
          </div>
        ) : (
          <MessageList
            virtuosoRef={virtuosoRef}
            messages={list}
            firstItemIndex={firstItemIndex}
            startReached={onStartReached}
            atBottomStateChange={setAtBottom}
            rangeChanged={refreshFindHighlights}
            // Initial-height hint so Virtuoso's first-pass sizing is
            // close to the real per-message height (avatar + 1-2 lines
            // of text). Without it the list starts assuming a tiny
            // default and every ResizeObserver tick pushes content
            // around, which compounds with image / OG-card lazy loads
            // into the scroll jitter users see.
            defaultItemHeight={96}
            increaseViewportBy={{ top: 800, bottom: 800 }}
            components={{
              Header: () => (
                <div className="mx-auto flex w-full max-w-[900px] flex-col gap-2 px-5 pt-6">
                  {hasMoreOlder ? (
                    <div className="self-center py-1 px-2.5 rounded-full text-[10.5px] font-medium text-ink-400">
                      {loadingOlder ? '正在加载更早的消息…' : ' '}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-ink-300 text-[11px] font-bold tracking-[0.08em] uppercase">
                      <span className="flex-1 h-px bg-gradient-to-r from-transparent via-ink-100 to-transparent" />
                      会话开始
                      <span className="flex-1 h-px bg-gradient-to-r from-transparent via-ink-100 to-transparent" />
                    </div>
                  )}
                </div>
              ),
              Footer: () => <div className="h-3" />,
            }}
            itemContent={(index) => (
              <DesktopRuntimeEntry
                index={index}
                initialIdsRef={initialIdsRef}
                animatedIdsRef={animatedIdsRef}
                searchOpen={searchOpen}
                matchedIds={matchedIds}
                currentMessageId={currentMatch?.messageId}
              />
            )}
          />
        )}
        {/* Bottom-right "scroll to latest" pill — appears once the user has
            scrolled up off the bottom. Fades in (animate-rise), tucks against
            the composer's top edge so it doesn't fight the typing area. */}
        <ScrollToLatestButton visible={!atBottom} onClick={scrollToLatest} zh />
      </div>
      <AgentTypingIndicator agents={typingAgents} className="mx-auto max-w-[900px]" />
      <Composer convoId={convoId} />
    </main>
  )
}
