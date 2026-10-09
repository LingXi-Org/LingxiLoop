import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { ConversationAvatar } from '@/im/ConversationList'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function ConversationHeader({
  conversationId,
  variant = 'desktop',
  onBack,
  actions,
}: {
  conversationId: string
  variant?: 'desktop' | 'mobile'
  onBack?: () => void
  actions?: ReactNode
}) {
  const conversation = useConversations((state) => state.list.find((item) => item.id === conversationId))
  if (!conversation) return null

  const mobile = variant === 'mobile'

  return (
    <header
      className={cn(
        'im-conversation-header omb-drag z-20 flex shrink-0 items-center border-b border-[var(--im-divider-weak)] bg-sidebar text-sidebar-foreground',
        mobile ? 'min-h-16 gap-2 px-2' : 'omb-titlebar-safe min-h-16 gap-3 px-6',
      )}
    >
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          className={cn('omb-no-drag shrink-0 text-muted-foreground', mobile && 'size-11')}
          aria-label="返回会话列表"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
      )}
      <div className="omb-no-drag flex min-w-0 flex-1 items-center gap-2.5">
        <ConversationAvatar conversation={conversation} size={mobile ? 28 : 30} />
        <h1 className={cn('truncate font-heading font-semibold text-foreground', mobile ? 'text-base' : 'text-xl')}>{conversation.title}</h1>
      </div>
      {actions && <div className="omb-no-drag ms-auto flex items-center gap-1">{actions}</div>}
    </header>
  )
}
