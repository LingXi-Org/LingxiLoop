import { useEffect, useState } from 'react'
import { useEntrance } from '@/hooks/use-entrance'
import { CanvasPopover } from '@/features/canvas/components/CanvasPopover'
import { ConversationSearch } from '@/features/chat/components/ConversationSearch'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime'
import { useConversations } from '@/features/conversations/store'
import { ConversationHeader } from '@/im/ConversationHeader'
import { useApp } from '@/stores/app'
import { useUiCommand } from '@/stores/uiCommands'
import { useAuth } from '@/stores/auth'
import { useWorkspace } from '@/features/knowledge/workspace'
import { NewConversationDialog } from '@/features/conversations/components/NewConversationDialog'
import { Button } from '@/components/ui/button'

function EmptyConversation({ onChooseWorkspace }: { onChooseWorkspace?: () => void }) {
  const conversations = useConversations((state) => state.list)
  const companyId = useAuth((state) => state.activeCompanyId)
  const projectId = useWorkspace((state) => state.selectedId)
  const canCreate = useWorkspace((state) => state.list.find((project) => project.id === state.selectedId)?.status === 'ACTIVE')
  const total = conversations.length
  return (
    <main className="chat-surface omb-titlebar-safe omb-drag grid h-full min-w-0 place-items-center bg-background">
      <div data-empty-conversation className="omb-no-drag flex max-w-sm flex-col items-center gap-3 px-8 text-center">
        <img src="/logo.png" alt="" className="size-14 rounded-2xl opacity-90" draggable={false} />
        <h1 className="text-xl font-semibold text-foreground">{total > 0 ? '选择一个会话开始交流' : '开始一段新对话'}</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {total > 0 ? `共有 ${total} 个会话，你也可以搜索已有消息。` : '选择一位伙伴交流，或邀请多位成员一起讨论。'}
        </p>
        {total > 0 ? <Button className="mt-2 min-h-11" onClick={() => useApp.getState().selectConversation(conversations[0].id)}>打开最近对话</Button>
          : companyId && projectId && canCreate ? <NewConversationDialog companyId={companyId} projectId={projectId} isMobile={false} onCreated={(id) => useApp.getState().selectConversation(id)} trigger={<Button className="mt-2 min-h-11">新建对话</Button>} />
            : onChooseWorkspace ? <Button className="mt-2 min-h-11" onClick={onChooseWorkspace}>选择工作区</Button> : null}
      </div>
    </main>
  )
}

export function ChatPane({
  onBackToConversations,
  onChooseWorkspace,
}: {
  onBackToConversations?: () => void
  onChooseWorkspace?: () => void
} = {}) {
  const conversationId = useApp((state) => state.selectedConversationId)
  const conversation = useConversations((state) => (
    conversationId ? state.list.find((item) => item.id === conversationId) : undefined
  ))
  const [searchOpen, setSearchOpen] = useState(false)
  const rootRef = useEntrance<HTMLElement>(conversation?.id ?? null)
  const uiCommand = useUiCommand()

  useEffect(() => { setSearchOpen(false) }, [conversationId])
  useEffect(() => {
    if (uiCommand?.type === 'find-chat') setSearchOpen(true)
  }, [uiCommand])

  if (!conversationId || !conversation) return <EmptyConversation onChooseWorkspace={onChooseWorkspace} />
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
