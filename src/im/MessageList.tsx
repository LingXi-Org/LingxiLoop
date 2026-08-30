import { ThreadPrimitive } from '@assistant-ui/react'
import { useCallback, useEffect, useRef } from 'react'
import type React from 'react'
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso'
import type { Message } from '@/types'
import { markMessagesVisibleThrough } from '@/features/chat/state/messages'

interface MessageListProps {
  messages: Message[]
  virtuosoRef: React.RefObject<VirtuosoHandle | null>
  firstItemIndex: number
  itemContent: (index: number) => React.ReactNode
  computeItemKey?: (index: number, message: Message) => React.Key
  startReached?: () => void
  atBottomStateChange?: (atBottom: boolean) => void
  rangeChanged?: (range: ListRange) => void
  components?: any
  context?: any
  defaultItemHeight?: number
  increaseViewportBy?: number | { top: number; bottom: number }
  className?: string
}

/** The shared virtual transcript used by desktop, web, iOS, and Android.
 * Platform hosts provide row interaction shells, while Virtuoso ownership,
 * follow behavior, and identity are centralized here. */
export function MessageList({
  messages,
  virtuosoRef,
  firstItemIndex,
  itemContent,
  computeItemKey = (_index, message) => message.clientId ?? message.id,
  startReached,
  atBottomStateChange,
  rangeChanged,
  components,
  context,
  defaultItemHeight = 104,
  increaseViewportBy = { top: 1000, bottom: 800 },
  className = 'h-full',
}: MessageListProps) {
  const visibleThrough = useRef<{ conversationId: string; sequence: number } | null>(null)
  const handleRangeChanged = useCallback((range: ListRange) => {
    rangeChanged?.(range)
    const normalize = (index: number) => index >= firstItemIndex ? index - firstItemIndex : index
    const start = Math.max(0, normalize(range.startIndex))
    const end = Math.min(messages.length - 1, normalize(range.endIndex))
    let candidate: { conversationId: string; sequence: number } | null = null
    for (let index = start; index <= end; index += 1) {
      const message = messages[index]
      if (!message || message.pending || message.streaming || !Number.isSafeInteger(message.sequence) || (message.sequence ?? 0) <= 0) continue
      if (!candidate || message.sequence! > candidate.sequence) {
        candidate = { conversationId: message.conversationId, sequence: message.sequence! }
      }
    }
    if (!candidate) return
    visibleThrough.current = candidate
    markMessagesVisibleThrough(candidate.conversationId, candidate.sequence)
  }, [firstItemIndex, messages, rangeChanged])

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return
      const candidate = visibleThrough.current
      if (candidate) markMessagesVisibleThrough(candidate.conversationId, candidate.sequence)
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
    }
  }, [])

  return (
      <Virtuoso
        ref={virtuosoRef}
        className={className}
        data={messages}
        firstItemIndex={firstItemIndex}
        followOutput="auto"
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        startReached={startReached}
        atBottomStateChange={atBottomStateChange}
        rangeChanged={handleRangeChanged}
        components={components}
        context={context}
        itemContent={(index, message) => (
          <ThreadPrimitive.Unstable_MessageById
            messageId={message.id}
            components={{
              Message: () => itemContent(index),
            }}
          />
        )}
        computeItemKey={computeItemKey}
        defaultItemHeight={defaultItemHeight}
        increaseViewportBy={increaseViewportBy}
      />
  )
}
