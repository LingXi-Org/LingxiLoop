import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type ConversationViewProps = PropsWithChildren<HTMLAttributes<HTMLElement>>

/** Responsive, overflow-safe conversation viewport boundary. */
export function ConversationView({ children, className, ...props }: ConversationViewProps) {
  return (
    <section
      className={cn('im-conversation-view chat-surface h-full min-h-0 min-w-0 overflow-hidden', className)}
      {...props}
    >
      {children}
    </section>
  )
}
