import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MessageSurface } from '@/components/assistant-ui/elements/surfaces'
import { Bubble, BubbleContent, BubbleReactions } from '@/components/ui/bubble'

interface ImBubbleProps {
  children: ReactNode
  reactions?: ReactNode
  isMine: boolean
}

/**
 * The native LingxiLoop IM text surface. assistant-ui owns the message part
 * context; this component only binds message ownership and reactions to the
 * source-compatible Bubble composition.
 */
export function ImBubble({
  children,
  reactions,
  isMine,
}: ImBubbleProps) {
  return (
    <MessageSurface variant="bubble" asChild>
      <Bubble
        variant={isMine ? 'default' : 'secondary'}
        align={isMine ? 'end' : 'start'}
        data-im-bubble
        className={cn(
          'aui-im-bubble',
          reactions && 'mb-3',
        )}
      >
        <BubbleContent>
          {children}
        </BubbleContent>
        {reactions && <BubbleReactions align={isMine ? 'start' : 'end'}>{reactions}</BubbleReactions>}
      </Bubble>
    </MessageSurface>
  )
}
