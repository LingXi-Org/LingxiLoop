import { ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { useConversationUi } from '@/stores/conversationUi'
import { messagesApi } from '../api'
import { chatLatency } from '../runtime/latency'
import type { LingxiMessageMetadata } from '../runtime/model'
import { messageKey, useChatThreadStore } from '../runtime/store'
import { chatTransport } from '../runtime/transport'
import { ConversationComposer } from './ConversationComposer'
import { ConversationLoadState } from './ConversationLoadState'
import { ConversationMessage } from './ConversationMessage'
import { ConversationQuestionIndex } from './ConversationQuestionIndex'
import { ConversationStart } from './ConversationStart'
import { createThreadChromeSelector } from './thread-chrome'
import { ScrollFadeContainer } from './ScrollFadeContainer'
import { useClaudeScrollPinning } from './useClaudeScrollPinning'

const MESSAGE_COMPONENTS = { Message: ConversationMessage }

const ConversationMessages = memo(function ConversationMessages({ rows }: { rows: ReturnType<ReturnType<typeof createThreadChromeSelector>>['rows'] }) {
  return rows.map(row => <ThreadPrimitive.MessageByIndex key={row.key} index={row.index} components={MESSAGE_COMPONENTS} />)
})

export function ConversationThread({
  conversationId,
  threadRootId = null,
  compact = false,
  readOnly = false,
}: {
  conversationId: string
  threadRootId?: string | null
  compact?: boolean
  readOnly?: boolean
}) {
  const snapshot = useChatThreadStore(useShallow(state => {
    const value = state.conversations[conversationId]
    return { isLoading: !value || value.isLoading || (!value.loaded && !value.error), isLoadingOlder: value?.isLoadingOlder ?? false,
      hasMoreOlder: value?.hasMoreOlder ?? true, error: value?.error ?? null, isRecovering: value?.isRecovering,
      isRunning: Object.values(value?.activeRuns ?? {}).some(run => run.state === 'queued' || run.state === 'running') }
  }))
  const aui = useAui()
  const selectChrome = useMemo(() => createThreadChromeSelector(messageKey), [conversationId, threadRootId])
  const chrome = useAuiState(state => selectChrome(state.thread.messages))
  const readReceiptKey = chrome.readReceiptKey
  const scope = `${conversationId}:${threadRootId ?? ''}`
  const { containerRef: viewportRef, showJumpControl, markUserInput, pauseFollowing, handleScroll, scrollToBottom } = useClaudeScrollPinning([scope])
  const entranceTail = useRef<{ scope: string; id: string | null } | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingOlderRef = useRef(false)
  const lastReadSequenceRef = useRef(0)
  const pendingJumpId = useConversationUi((state) => state.pendingJumpMessageId)
  const clearPendingJump = useConversationUi((state) => state.clearPendingJump)
  const selectReplyBranch = useConversationUi(state => state.selectReplyBranch)
  useEffect(() => {
    const scope = `${conversationId}:${threadRootId ?? ''}`
    const messages = chrome.rows
    if (snapshot.isLoading || snapshot.isLoadingOlder) {
      entranceTail.current = null
      return
    }
    const previous = entranceTail.current
    const last = messages.at(-1)
    entranceTail.current = { scope, id: last ? last.key : null }
    // Establish a baseline after history reconciliation; only appended live messages enter.
    if (!previous || previous.scope !== scope) return
    const anchor = previous.id === null ? -1 : messages.findIndex(message => message.key === previous.id)
    if (previous.id !== null && anchor < 0) return
    for (const message of messages.slice(anchor + 1)) {
      const id = message.id
      viewportRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`)?.classList.add('ui-enter')
    }
  }, [conversationId, threadRootId, chrome.rows, snapshot.isLoading, snapshot.isLoadingOlder])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || threadRootId || snapshot.isLoading || snapshot.error || (!chrome.messageCount && snapshot.hasMoreOlder)) return
    return chatLatency.ready(conversationId, 'history_visible', viewport)
  }, [conversationId, threadRootId, snapshot.isLoading, snapshot.error, chrome.messageCount, snapshot.hasMoreOlder])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const preserveSelection = () => {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && selection.rangeCount
        && viewport.contains(selection.getRangeAt(0).commonAncestorContainer)) pauseFollowing()
    }
    const preserveDisclosure = (event: Event) => {
      if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return
      const target = event.target
      if (target instanceof Element && target.closest('[aria-expanded], summary')) {
        pauseFollowing()
      }
    }
    document.addEventListener('selectionchange', preserveSelection)
    viewport.addEventListener('click', preserveDisclosure, true)
    viewport.addEventListener('keydown', preserveDisclosure, true)
    return () => {
      document.removeEventListener('selectionchange', preserveSelection)
      viewport.removeEventListener('click', preserveDisclosure, true)
      viewport.removeEventListener('keydown', preserveDisclosure, true)
    }
  }, [scope, pauseFollowing, viewportRef])

  const loadOlder = useCallback(async () => {
    const viewport = viewportRef.current
    const current = useChatThreadStore.getState().conversations[conversationId]
    // An intersecting skeleton sentinel is not a reader requesting pagination.
    // Transport would no-op before initial history is loaded; don't leave a
    // reading lock behind and prevent that history from following to latest.
    if (!viewport || snapshot.isLoading || !current?.loaded || current.isLoadingOlder
      || loadingOlderRef.current || !snapshot.hasMoreOlder) return true
    pauseFollowing()
    loadingOlderRef.current = true
    const before = useChatThreadStore.getState().conversations[conversationId]?.messages
    try {
      // The official viewport controller preserves the reader's message anchor
      // through prepend and subsequent image/font growth in the loaded history.
      await chatTransport.loadOlder(conversationId)
    } finally {
      loadingOlderRef.current = false
    }
    const after = useChatThreadStore.getState().conversations[conversationId]
    return !after?.hasMoreOlder || (after.messages[0] && messageKey(after.messages[0])) !== (before?.[0] && messageKey(before[0]))
  }, [conversationId, snapshot.isLoading, snapshot.hasMoreOlder, pauseFollowing, viewportRef])

  const navigateToQuestion = useCallback((id: string) => {
    const viewport = viewportRef.current
    const element = viewport?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`)
    if (!viewport || !element) return
    // Disable following before the first scroll frame, including when the last
    // question is too close to the bottom to move the viewport yet.
    pauseFollowing()
    viewport.scrollTo({ top: viewport.scrollTop + element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [pauseFollowing, viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    const sentinel = sentinelRef.current
    if (!viewport || !sentinel || threadRootId || snapshot.isLoading) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadOlder()
    }, { root: viewport, rootMargin: '240px 0px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadOlder, threadRootId, snapshot.isLoading])

  useEffect(() => { lastReadSequenceRef.current = 0 }, [conversationId])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || threadRootId || readReceiptKey === '[]') return
    const messages = [...viewport.querySelectorAll<HTMLElement>('[data-msg-seq]')]
    if (messages.length === 0) return
    const markVisibleMessagesRead = () => {
      if (document.visibilityState !== 'visible') return
      const viewportBounds = viewport.getBoundingClientRect()
      let readThroughSeq = lastReadSequenceRef.current
      for (const message of messages) {
        const bounds = message.getBoundingClientRect()
        if (bounds.bottom <= viewportBounds.top || bounds.top >= viewportBounds.bottom) continue
        const sequence = Number(message.dataset.msgSeq)
        if (Number.isSafeInteger(sequence)) readThroughSeq = Math.max(readThroughSeq, sequence)
      }
      if (readThroughSeq <= lastReadSequenceRef.current) return
      const previousSequence = lastReadSequenceRef.current
      lastReadSequenceRef.current = readThroughSeq
      void messagesApi.markRead(conversationId, readThroughSeq).then(({ latestSeq }) => {
        if (lastReadSequenceRef.current !== readThroughSeq) return
        const unread = Math.max(0, latestSeq - readThroughSeq)
        useConversations.setState((state) => ({
          list: state.list.map((conversation) => (
            conversation.id === conversationId ? { ...conversation, unread: unread || undefined } : conversation
          )),
        }))
      }).catch((error) => {
        if (lastReadSequenceRef.current === readThroughSeq) lastReadSequenceRef.current = previousSequence
        console.warn('[chat.read-receipt] failed to advance visible cursor', error)
      })
    }
    let settleTimer: number | undefined
    const scheduleReadReceipt = () => {
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(markVisibleMessagesRead, 120)
    }
    const observer = new IntersectionObserver(scheduleReadReceipt, { root: viewport })
    for (const message of messages) observer.observe(message)
    document.addEventListener('visibilitychange', scheduleReadReceipt)
    markVisibleMessagesRead()
    return () => {
      window.clearTimeout(settleTimer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', scheduleReadReceipt)
    }
  }, [conversationId, readReceiptKey, threadRootId])

  useEffect(() => {
    if (!pendingJumpId) return
    const viewport = viewportRef.current
    const element = viewport?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(pendingJumpId)}"]`)
    if (!element) {
      const branch = aui.thread().getState().messages.map(message => (message.metadata.custom as LingxiMessageMetadata).replyBranches)
        .find(branch => branch?.clientIds.includes(pendingJumpId))
      if (branch) selectReplyBranch(branch.key, branch.ids[branch.clientIds.indexOf(pendingJumpId)], branch.ids.at(-1)!)
      return
    }
    pauseFollowing()
    element.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    element.classList.add('quote-jump-flash')
    window.setTimeout(() => element.classList.remove('quote-jump-flash'), 1_100)
    clearPendingJump()
  }, [clearPendingJump, pendingJumpId, pauseFollowing, selectReplyBranch, chrome.branchKey, chrome.rows, aui])

  return (
    <ThreadPrimitive.Root className="assistant-ui-scope aui-thread-root relative flex h-full min-h-0 flex-col bg-background text-foreground" data-lingxi-assistant-thread data-density="comfortable">
      <div className="relative flex min-h-0 flex-1 [container-type:size]" data-chat-reading-area>
        <ConversationQuestionIndex key={scope} viewportRef={viewportRef} hasMoreOlder={!threadRootId && snapshot.hasMoreOlder}
          isLoadingOlder={snapshot.isLoadingOlder} onLoadOlder={async () => { pauseFollowing(); return loadOlder() }} onNavigate={navigateToQuestion} />
        {/* The hook owns bottom following. The primitive only retains history prepend
            anchoring; disable every automatic bottom-scroll trigger. asChild
            gives the mask and primitive the same scroll element. */}
        <ThreadPrimitive.Viewport asChild autoScroll={false} scrollToBottomOnRunStart={false} scrollToBottomOnInitialize={false} scrollToBottomOnThreadSwitch={false}>
        <ScrollFadeContainer ref={viewportRef} data-chat-viewport tabIndex={0} aria-label="对话消息" onScroll={handleScroll}
          onFocusCapture={event => {
            pauseFollowing()
            if (event.target === event.currentTarget) return
            const bounds = event.target.getBoundingClientRect(), viewport = event.currentTarget
            const area = viewport.getBoundingClientRect()
            const delta = bounds.top < area.top + 28 ? bounds.top - area.top - 28
              : bounds.bottom > area.bottom - 28 ? bounds.bottom - area.bottom + 28 : 0
            if (delta) viewport.scrollTo({ top: viewport.scrollTop + delta, behavior: 'auto' })
          }}
          onWheelCapture={markUserInput} onTouchStartCapture={markUserInput} onTouchMoveCapture={markUserInput}
          onPointerDownCapture={event => { if (event.target === event.currentTarget) markUserInput() }}
          onKeyDownCapture={event => {
            if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return
            if ((event.target as Element).closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]')) return
            markUserInput()
          }}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          <div data-chat-message-column className="@container/chat flex min-h-full shrink-0 flex-col [--chat-extra-space:2rem]">
            {!threadRootId && (
              <div ref={sentinelRef} className="flex h-10 w-full shrink-0 items-center justify-center px-3 text-xs text-muted-foreground sm:px-4">
                {snapshot.isLoadingOlder ? '正在加载更早的消息…' : !snapshot.hasMoreOlder && !snapshot.isLoading && (
                  <ConversationStart createdAt={chrome.first?.createdAt} timestampMissing={chrome.first?.timestampMissing === true} />
                )}
              </div>
            )}
            <ConversationLoadState loading={snapshot.isLoading} empty={chrome.messageCount === 0}
              running={snapshot.isRunning} recovering={snapshot.isRecovering} error={snapshot.error} thread={Boolean(threadRootId)}
              onRetry={() => void chatTransport.reloadConversation(conversationId)} />
            <ConversationMessages rows={chrome.rows} />
          </div>
        </ScrollFadeContainer>
        </ThreadPrimitive.Viewport>
      {showJumpControl && <Button type="button" variant="outline" size="icon"
        className="absolute bottom-3 end-5 z-30 size-11 rounded-full border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground md:size-9"
        aria-label="滚动到底部" data-chat-scroll-bottom onClick={() => scrollToBottom(false)}>
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
      </Button>}
      </div>
      {!readOnly && <div className="relative z-20 shrink-0 bg-background pt-2 md:pt-4" data-chat-composer-bar>
        <ConversationComposer
          conversationId={conversationId}
          compact={compact}
          placeholder={threadRootId ? '在帖子中回复…' : undefined}
        />
      </div>}
    </ThreadPrimitive.Root>
  )
}
