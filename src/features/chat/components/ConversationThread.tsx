import { ThreadPrimitive } from '@assistant-ui/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AgentTypingIndicator } from '@/components/messages/AgentTypingIndicator'
import { Button } from '@/components/ui/button'
import { useParticipants } from '@/features/agents/state'
import type { Participant } from '@/types'
import { useConversationUi } from '@/stores/conversationUi'
import { chatTransport, useConversationThreadSnapshot } from '../runtime'
import { getLingxiMessageMetadata } from '../runtime/model'
import { ConversationComposer } from './ConversationComposer'
import { ConversationMessage } from './ConversationMessage'

const MESSAGE_COMPONENTS = { Message: ConversationMessage }

export function ConversationThread({
  conversationId,
  threadRootId = null,
  compact = false,
}: {
  conversationId: string
  threadRootId?: string | null
  compact?: boolean
}) {
  const snapshot = useConversationThreadSnapshot(conversationId, threadRootId)
  const viewportRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingOlderRef = useRef(false)
  const lastReadSequenceRef = useRef(0)
  const pendingJumpId = useConversationUi((state) => state.pendingJumpMessageId)
  const clearPendingJump = useConversationUi((state) => state.clearPendingJump)
  const participants = useParticipants((state) => state.byId)
  const typingAgents = useMemo(() => snapshot.typingAgentIds
    .map((id) => participants[id])
    .filter((participant): participant is Participant => participant?.kind === 'agent'), [participants, snapshot.typingAgentIds])

  useEffect(() => {
    lastReadSequenceRef.current = 0
  }, [conversationId])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || snapshot.messages.length === 0) return
    const sequenceById = new Map(snapshot.messages.map((message) => [
      getLingxiMessageMetadata(message).clientMessageId,
      getLingxiMessageMetadata(message).sequence,
    ]))
    const observer = new IntersectionObserver((entries) => {
      const visibleSequence = Math.max(0, ...entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => sequenceById.get((entry.target as HTMLElement).dataset.msgId ?? '') ?? 0))
      if (visibleSequence <= lastReadSequenceRef.current) return
      lastReadSequenceRef.current = visibleSequence
      void chatTransport.markRead(conversationId, visibleSequence)
    }, { root: viewport, threshold: 0.6 })
    viewport.querySelectorAll<HTMLElement>('[data-msg-id]').forEach((element) => {
      observer.observe(element)
    })
    return () => observer.disconnect()
  }, [conversationId, snapshot.messages])

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
    <ThreadPrimitive.Root className="assistant-ui-scope aui-thread-root flex h-full min-h-0 flex-col bg-background text-foreground" data-lingxi-assistant-thread>
      <ThreadPrimitive.Viewport ref={viewportRef} data-chat-viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {!threadRootId && (
          <div ref={sentinelRef} className="flex h-10 w-full items-center justify-center px-3 text-[10.5px] text-muted-foreground sm:px-4">
            {snapshot.isLoadingOlder ? '正在加载更早的消息…' : snapshot.hasMoreOlder ? '' : '会话开始'}
          </div>
        )}
        <ThreadPrimitive.Empty>
          <div className="grid flex-1 place-items-center px-8 py-20 text-center text-sm text-muted-foreground">
            {snapshot.error ? (
              <div className="grid gap-3">
                <span>{snapshot.error}</span>
                <Button size="sm" onClick={() => void chatTransport.reloadConversation(conversationId)}>重试</Button>
              </div>
            ) : snapshot.isLoading ? '正在加载消息…' : threadRootId ? '尚无回复' : '开始一段新对话'}
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-4">
          <AgentTypingIndicator agents={typingAgents} className="w-full px-3 sm:px-4" />
          <ConversationComposer
            conversationId={conversationId}
            compact={compact}
            placeholder={threadRootId ? '在帖子中回复…' : undefined}
          />
        </ThreadPrimitive.ViewportFooter>
        <ThreadPrimitive.ScrollToBottom asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute bottom-24 end-5 z-10 rounded-full border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground disabled:invisible"
            aria-label="滚动到底部"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
          </Button>
        </ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}
