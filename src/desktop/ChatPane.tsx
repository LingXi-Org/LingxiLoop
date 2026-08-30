import { useEffect, useRef, useState } from 'react'
import { ICanvas, ISearch } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ConversationActivity } from '@/features/chat/components/ConversationActivity'
import { ConversationSearch } from '@/features/chat/components/ConversationSearch'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime'
import { ConversationHeader } from '@/im/ConversationHeader'
import { useApp } from '@/stores/app'
import { useUiCommand } from '@/stores/uiCommands'
import { useConversations } from '@/features/conversations/store'

function EmptyConversation() {
  const total = useConversations((state) => state.list.length)
  return (
    <main className="chat-surface omb-titlebar-safe omb-drag grid h-full min-w-0 place-items-center bg-background">
      <div className="omb-no-drag flex max-w-sm flex-col items-center gap-3 px-8 text-center">
        <img src="/logo.png" alt="" className="size-14 rounded-2xl opacity-90" draggable={false} />
        <h1 className="text-[17px] font-semibold text-foreground">选择一个会话开始交流</h1>
        <p className="text-[13px] leading-6 text-muted-foreground">
          {total > 0 ? `左侧共有 ${total} 个上下文会话。你也可以搜索已有消息。` : '新消息和 Agent 的实时进度会显示在这里。'}
        </p>
      </div>
    </main>
  )
}

export function ChatPane({
  onBackToConversations,
  onOpenGroupContext,
}: {
  onBackToConversations?: () => void
  onOpenGroupContext?: () => void
} = {}) {
  const conversationId = useApp((state) => state.selectedConversationId)
  const conversation = useConversations((state) => (
    conversationId ? state.list.find((item) => item.id === conversationId) : undefined
  ))
  const [searchOpen, setSearchOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const uiCommand = useUiCommand()

  useEffect(() => { setSearchOpen(false) }, [conversationId])
  useEffect(() => {
    if (uiCommand?.type === 'find-chat') setSearchOpen(true)
  }, [uiCommand])

  if (!conversationId || !conversation) return <EmptyConversation />
  return (
    <ConversationRuntimeProvider key={conversationId} conversationId={conversationId}>
      <main ref={rootRef} className="chat-surface grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-background">
        <ConversationHeader
          conversationId={conversationId}
          onBack={onBackToConversations}
          actions={(
            <>
              <Button type="button" variant="ghost" size="icon-lg" onClick={() => setSearchOpen((open) => !open)} aria-label="搜索当前会话" className="text-muted-foreground">
                <ISearch className="size-[18px]" />
              </Button>
              {conversation.kind === 'group' && onOpenGroupContext && (
                <Button type="button" variant="ghost" size="icon-lg" onClick={onOpenGroupContext} aria-label="打开群聊上下文" className="text-muted-foreground">
                  <ICanvas className="size-[18px]" />
                </Button>
              )}
            </>
          )}
        />
        <div data-chat-auxiliary="true">
          <ConversationActivity conversationId={conversationId} />
          <ConversationSearch conversationId={conversationId} open={searchOpen} onClose={() => setSearchOpen(false)} rootRef={rootRef} />
        </div>
        <ConversationThread conversationId={conversationId} />
      </main>
    </ConversationRuntimeProvider>
  )
}
