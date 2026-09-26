import { useEffect, useRef, useState } from 'react'
import { CanvasPopover } from '@/features/canvas/components/CanvasPopover'
import { ConversationSearch } from '@/features/chat/components/ConversationSearch'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime'
import { useConversations } from '@/features/conversations/store'
import { ConversationHeader } from '@/im/ConversationHeader'
import { useApp } from '@/stores/app'
import { useUiCommand } from '@/stores/uiCommands'

function EmptyConversation() {
  const total = useConversations((state) => state.list.length)
  return (
    <main className="chat-surface omb-titlebar-safe omb-drag grid h-full min-w-0 place-items-center bg-background">
      <div className="omb-no-drag flex max-w-sm flex-col items-center gap-3 px-8 text-center">
        <img src="/logo.png" alt="" className="size-14 rounded-2xl opacity-90" draggable={false} />
        <h1 className="text-[17px] font-semibold text-foreground">选择一个会话开始交流</h1>
        <p className="text-[13px] leading-6 text-muted-foreground">
          {total > 0 ? `左侧共有 ${total} 个相关会话，你也可以搜索已有消息。` : '新消息和智能助教的实时进度会显示在这里。'}
        </p>
      </div>
    </main>
  )
}

export function ChatPane({
  onBackToConversations,
}: {
  onBackToConversations?: () => void
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
      <main ref={rootRef} className="chat-surface chat-pane grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-background">
        <ConversationHeader
          conversationId={conversationId}
          variant={onBackToConversations ? 'mobile' : 'desktop'}
          onBack={onBackToConversations}
          actions={<CanvasPopover key={conversationId} conversationId={conversationId} />}
        />
        <div data-chat-auxiliary="true">
          <ConversationSearch conversationId={conversationId} open={searchOpen} onClose={() => setSearchOpen(false)} rootRef={rootRef} />
        </div>
        <div className="chat-thread-layout min-h-0 min-w-0">
          <ConversationThread conversationId={conversationId} readOnly={conversation.readOnly} />
        </div>
      </main>
    </ConversationRuntimeProvider>
  )
}
