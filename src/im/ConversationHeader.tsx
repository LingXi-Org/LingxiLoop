import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { ConversationAvatar } from '@/im/ConversationList'
import { cn } from '@/lib/utils'

export function ConversationHeader({
  conversationId,
  variant = 'desktop',
  onBack,
}: {
  conversationId: string
  variant?: 'desktop' | 'mobile'
  onBack?: () => void
}) {
  const conversation = useConversations((state) => state.list.find((item) => item.id === conversationId))
  if (!conversation) return null

  const mobile = variant === 'mobile'

  return (
    <header
      className={cn(
        'im-conversation-header omb-drag z-20 flex shrink-0 items-center border-b border-[var(--im-divider-weak)] bg-card text-card-foreground',
        mobile ? 'min-h-12 gap-2 px-2' : 'omb-titlebar-safe h-12 gap-3 px-4',
      )}
      style={mobile ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
    >
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="omb-no-drag shrink-0 text-muted-foreground"
          aria-label="返回会话列表"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
      )}
      <div className="omb-no-drag flex min-w-0 items-center gap-2.5">
        <ConversationAvatar conversation={conversation} size={mobile ? 28 : 30} variant={variant} />
        <span className="truncate text-sm font-medium text-foreground">{conversation.title}</span>
      </div>
    </header>
  )
}
