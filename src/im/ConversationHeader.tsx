import { ConversationMembersButton } from '@/features/conversations/components/ConversationMembersDialog'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { ConversationAvatar } from '@/im/ConversationList'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useShellNavTrigger } from '@/components/shell/ShellNav'

export function ConversationHeader({
  conversationId,
  variant = 'desktop',
  onBack,
  actions,
  onSearch,
}: {
  conversationId: string
  variant?: 'desktop' | 'mobile'
  onBack?: () => void
  actions?: ReactNode
  onSearch?: () => void
}) {
  const navTrigger = useShellNavTrigger()
  const conversation = useConversations((state) => state.list.find((item) => item.id === conversationId))
  if (!conversation) return null

  const mobile = variant === 'mobile'

  return (
    <header
      className={cn(
        'im-conversation-header select-none z-20 flex min-h-14 min-w-0 shrink-0 items-center bg-background text-foreground',
        mobile ? 'gap-2 px-2' : 'h-[52px] min-h-[52px] gap-2 ps-2 pe-3',
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
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ConversationAvatar conversation={conversation} size={20} />
        <h1 className="truncate font-heading text-sm font-semibold tracking-[-0.01em] text-foreground">{conversation.title}</h1>
        {conversation.subtitle && <span className="truncate text-[13px] text-muted-foreground max-sm:hidden">{conversation.subtitle}</span>}
      </div>
      {conversation.kind === 'group' && <ConversationMembersButton conversation={conversation} />}
      {actions && <div className="ms-auto flex items-center gap-1">{actions}</div>}
      {onSearch && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="更多" className={cn('shrink-0 rounded-[9px] text-muted-foreground hover:bg-accent', mobile ? 'size-11' : 'size-9')}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[18px]"><circle cx="5" cy="12" r="0.6" /><circle cx="12" cy="12" r="0.6" /><circle cx="19" cy="12" r="0.6" /></svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
          <DropdownMenuItem onSelect={onSearch}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            在对话中搜索<DropdownMenuShortcut>Ctrl F</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </header>
  )
}
