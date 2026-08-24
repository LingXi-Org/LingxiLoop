import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type ConversationViewProps = PropsWithChildren<{
  variant?: 'desktop' | 'mobile'
} & HTMLAttributes<HTMLElement>>

/** Shared conversation viewport boundary. Platform controllers retain native
 * gestures and transport orchestration; all message/header/composer surfaces
 * mount inside this common responsive, overflow-safe IM contract. */
export function ConversationView({ children, variant = 'desktop', className, ...props }: ConversationViewProps) {
  return (
    <section
      className={cn('im-conversation-view chat-surface h-full min-h-0 min-w-0 overflow-hidden', className)}
      data-im-variant={variant}
      {...props}
    >
      {children}
    </section>
  )
}
