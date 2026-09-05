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
        mobile ? 'min-h-14 gap-2 px-2' : 'omb-titlebar-safe h-12 gap-3 px-4',
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
      <div className="omb-no-drag flex min-w-0 items-center gap-2.5">
        <ConversationAvatar conversation={conversation} size={mobile ? 28 : 30} variant={variant} />
        <span className={cn('truncate font-medium text-foreground', mobile ? 'text-base' : 'text-sm')}>{conversation.title}</span>
      </div>
      {actions && <div className="omb-no-drag ms-auto flex items-center gap-1">{actions}</div>}
    </header>
  )
}
