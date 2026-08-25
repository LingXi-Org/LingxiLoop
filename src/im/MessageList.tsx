import type React from 'react'
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso'
import type { Message } from '@/types'

interface MessageListProps {
  messages: Message[]
  virtuosoRef: React.RefObject<VirtuosoHandle>
  firstItemIndex: number
  itemContent: (index: number, message: Message) => React.ReactNode
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
      rangeChanged={rangeChanged}
      components={components}
      context={context}
      itemContent={itemContent}
      computeItemKey={computeItemKey}
      defaultItemHeight={defaultItemHeight}
      increaseViewportBy={increaseViewportBy}
    />
  )
}
