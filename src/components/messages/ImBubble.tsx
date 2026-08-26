import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { field, paper } from '@/components/assistant-ui/elements/surfaces'

interface ImBubbleProps {
  children: ReactNode
  isMine: boolean
  openMaus: boolean
  continuedFromPrevious: boolean
  continuedToNext: boolean
}

/**
 * The native LingxiLoop IM text surface. assistant-ui owns the message part
 * context; this component owns only the established bubble geometry and
 * adjacency seams.
 */
export function ImBubble({
  children,
  isMine,
  openMaus,
  continuedFromPrevious,
  continuedToNext,
}: ImBubbleProps) {
  return (
    <div
      data-im-bubble
      className={cn(
        'aui-im-bubble inline-block break-words py-2',
        openMaus || isMine
          ? 'max-w-full px-3.5 text-sm leading-relaxed'
          : 'max-w-[min(100%,620px)] px-3.5 text-sm leading-relaxed',
        isMine
          ? field
          : paper,
        isMine ? 'text-foreground/90' : 'text-foreground',
        !continuedFromPrevious && !continuedToNext && 'rounded-2xl',
        continuedFromPrevious && continuedToNext && (isMine ? 'rounded-l-2xl rounded-r-md' : 'rounded-r-2xl rounded-l-md'),
        continuedFromPrevious && !continuedToNext && (isMine ? 'rounded-l-2xl rounded-tr-md rounded-br-2xl' : 'rounded-r-2xl rounded-tl-md rounded-bl-2xl'),
        !continuedFromPrevious && continuedToNext && (isMine ? 'rounded-l-2xl rounded-tr-2xl rounded-br-md' : 'rounded-r-2xl rounded-tl-2xl rounded-bl-md'),
      )}
    >
      {children}
    </div>
  )
}
