import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { ConversationAvatar } from '@/im/ConversationList'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { useShellNavTrigger } from '@/components/shell/ShellNav'

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
  const navTrigger = useShellNavTrigger()
  const conversation = useConversations((state) => state.list.find((item) => item.id === conversationId))
  if (!conversation) return null

  const mobile = variant === 'mobile'

  return (
    <header
      className={cn(
        'im-conversation-header select-none z-20 flex min-h-14 min-w-0 shrink-0 items-center bg-background text-foreground',
        mobile ? 'gap-2 px-2' : 'gap-2 px-2.5',
      )}
    >
      {!mobile && navTrigger}
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          className={cn('shrink-0 text-muted-foreground', mobile && 'size-11')}
          aria-label="返回会话列表"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <ConversationAvatar conversation={conversation} size={22} />
        <h1 className="truncate font-heading text-sm font-semibold text-foreground">{conversation.title}</h1>
        {conversation.subtitle && <span className="truncate text-xs text-muted-foreground max-sm:hidden">{conversation.subtitle}</span>}
      </div>
      {actions && <div className="ms-auto flex items-center gap-1">{actions}</div>}
    </header>
  )
}
