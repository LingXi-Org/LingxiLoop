import { ThreadPrimitive } from '@assistant-ui/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useConversationUi } from '@/stores/conversationUi'
import { useConversations } from '@/features/conversations/store'
import { userFacingError } from '@/lib/userFacingError'
import { messagesApi } from '../api'
import { chatTransport, useConversationThreadSnapshot } from '../runtime'
import { ConversationActivity } from './ConversationActivity'
import { ConversationComposer } from './ConversationComposer'
import { ConversationMessage } from './ConversationMessage'

const MESSAGE_COMPONENTS = { Message: ConversationMessage }

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
  const isMobile = useIsMobile()
  const snapshot = useConversationThreadSnapshot(conversationId, threadRootId)
  const viewportRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingOlderRef = useRef(false)
  const lastReadSequenceRef = useRef(0)
  const pendingJumpId = useConversationUi((state) => state.pendingJumpMessageId)
  const clearPendingJump = useConversationUi((state) => state.clearPendingJump)

  const loadOlder = useCallback(async () => {
    const viewport = viewportRef.current
    if (!viewport || loadingOlderRef.current || !snapshot.hasMoreOlder) return
    loadingOlderRef.current = true
    const anchor = viewport.querySelector<HTMLElement>('[data-msg-id]')
    const anchorId = anchor?.dataset.msgId
    const anchorTop = anchor?.getBoundingClientRect().top ?? 0
    await chatTransport.loadOlder(conversationId)
    window.requestAnimationFrame(() => {
      if (anchorId) {
        const restored = viewport.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(anchorId)}"]`)
        if (restored) viewport.scrollTop += restored.getBoundingClientRect().top - anchorTop
      }
      loadingOlderRef.current = false
    })
  }, [conversationId, snapshot.hasMoreOlder])

  useEffect(() => {
    const viewport = viewportRef.current
    const sentinel = sentinelRef.current
    if (!viewport || !sentinel || threadRootId) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadOlder()
    }, { root: viewport, rootMargin: '240px 0px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadOlder, threadRootId])

  useEffect(() => { lastReadSequenceRef.current = 0 }, [conversationId])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || threadRootId) return
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
  }, [conversationId, snapshot.messages, threadRootId])

  useEffect(() => {
    if (!pendingJumpId) return
    const viewport = viewportRef.current
    const element = viewport?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(pendingJumpId)}"]`)
    if (!element) return
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    element.classList.add('quote-jump-flash')
    window.setTimeout(() => element.classList.remove('quote-jump-flash'), 1_100)
    clearPendingJump()
  }, [clearPendingJump, pendingJumpId, snapshot.messages])

  return (
    <ThreadPrimitive.Root className="assistant-ui-scope aui-thread-root relative flex h-full min-h-0 flex-col bg-background text-foreground" data-lingxi-assistant-thread>
      <ThreadPrimitive.Viewport ref={viewportRef} data-chat-viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {!threadRootId && (
          <div ref={sentinelRef} className="flex h-10 w-full shrink-0 items-center justify-center px-3 text-[10.5px] text-muted-foreground sm:px-4">
            {snapshot.isLoadingOlder ? '正在加载更早的消息…' : snapshot.hasMoreOlder ? '' : '会话开始'}
          </div>
        )}
        <ThreadPrimitive.Empty>
          <div className="grid flex-1 place-items-center px-8 py-20 text-center text-sm text-muted-foreground">
            {snapshot.error ? (
              <div className="grid gap-3">
                <span>{userFacingError(snapshot.error, '消息加载失败，请稍后重试。')}</span>
                <Button size="sm" onClick={() => void chatTransport.reloadConversation(conversationId)}>重试</Button>
              </div>
            ) : snapshot.isLoading ? '正在加载消息…' : threadRootId ? '尚无回复' : '开始一段新对话'}
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
        {!threadRootId && <ConversationActivity conversationId={conversationId} />}
      </ThreadPrimitive.Viewport>
      {!readOnly && <div className={isMobile ? 'shrink-0 bg-background pt-2' : 'shrink-0 bg-gradient-to-t from-background via-background to-transparent pt-4'} data-chat-composer-bar>
        <ConversationComposer
          conversationId={conversationId}
          compact={compact}
          placeholder={threadRootId ? '在帖子中回复…' : undefined}
        />
      </div>}
      <ThreadPrimitive.ScrollToBottom asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute bottom-24 end-5 z-10 size-11 rounded-full border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground disabled:invisible md:size-9"
          aria-label="滚动到底部"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
        </Button>
      </ThreadPrimitive.ScrollToBottom>
    </ThreadPrimitive.Root>
  )
}
