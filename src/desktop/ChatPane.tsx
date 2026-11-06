import { lazy, Suspense, useEffect, useState } from 'react'
import { useEntrance } from '@/hooks/use-entrance'
import { DesignButton } from '@/features/design/DesignButton'
import { DesignWorkspace } from '@/features/design/DesignWorkspace'
import { ConversationSearch } from '@/features/chat/components/ConversationSearch'
import { ConversationSkeleton } from '@/features/chat/components/ConversationSkeleton'
import { ConversationRuntimeProvider } from '@/features/chat/runtime'
import { useConversations } from '@/features/conversations/store'
import { ConversationHeader } from '@/im/ConversationHeader'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { useUiCommand } from '@/stores/uiCommands'
import { useAuth } from '@/stores/auth'
import { useWorkspace } from '@/features/knowledge/workspace'
import { NewConversationDialog } from '@/features/conversations/components/NewConversationDialog'
import { Avatar } from '@/components/Avatar'
import { useParticipants } from '@/features/agents/state'

const ConversationThread = lazy(() => import('@/features/chat/components/ConversationThread').then(module => ({ default: module.ConversationThread })))

function EmptyConversation({ onChooseWorkspace }: { onChooseWorkspace?: () => void }) {
  const conversations = useConversations((state) => state.list)
  const companyId = useAuth((state) => state.activeCompanyId)
  const projectId = useWorkspace((state) => state.selectedId)
  const canCreate = useWorkspace((state) => state.list.find((project) => project.id === state.selectedId)?.status === 'ACTIVE')
  const total = conversations.length
  const participants = useParticipants((state) => state.byId)
  const agents = Object.values(participants).filter(person => person.kind === 'agent').slice(0, 3)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const secondary = 'h-9 rounded-[10px] bg-card px-3.5 text-[13.5px] font-medium text-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
  const primary = 'h-9 rounded-[10px] bg-brand px-4 text-[13.5px] font-medium text-brand-foreground hover:bg-[color-mix(in_srgb,var(--brand)_90%,var(--foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  return (
    <main className="chat-surface grid h-full min-w-0 place-items-center bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px]">
      <div data-empty-conversation className="flex max-w-sm flex-col items-center gap-3.5 px-8 text-center">
        {agents.length > 0 ? <div aria-hidden="true" className="flex">
          {agents.map((agent, index) => <span key={agent.id} className="inline-flex" style={{ marginInlineStart: index ? -10 : 0, transform: `rotate(${[-8, 4, -4][index]}deg)` }}>
            <Avatar p={agent} size={44} animated={false} ringColor="var(--background)" />
          </span>)}
        </div> : <img src="/logo.png" alt="" className="size-14 rounded-2xl opacity-90" draggable={false} />}
        <h1 className="m-0 text-xl font-semibold tracking-[-0.01em] text-foreground">{total > 0 ? '选一个会话开始' : '开始一段新对话'}</h1>
        <p className="m-0 text-[13.5px] text-muted-foreground">{total > 0 ? '或者直接问智能助教，从一道题开始' : '选择一位伙伴交流，或邀请多位成员一起讨论'}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {total > 0 && <button type="button" className={primary} onClick={() => useApp.getState().selectConversation(conversations[0].id)}>打开最近对话</button>}
          {companyId && projectId && canCreate ? <NewConversationDialog companyId={companyId} projectId={projectId} isMobile={false} onCreated={(id) => useApp.getState().selectConversation(id)}
            trigger={<button type="button" className={total > 0 ? secondary : primary}>新建对话</button>} />
            : total === 0 && onChooseWorkspace ? <button type="button" className={primary} onClick={onChooseWorkspace}>选择工作区</button> : null}
        </div>
        {total > 0 && <span className="text-xs text-muted-foreground">{mac ? '⌘ K' : 'Ctrl K'} 搜索与命令</span>}
      </div>
    </main>
  )
}

export function ChatPane({
  onBackToConversations,
  onChooseWorkspace,
  visible = true,
}: {
  onBackToConversations?: () => void
  onChooseWorkspace?: () => void
  visible?: boolean
} = {}) {
  const conversationId = useApp((state) => state.selectedConversationId)
  const userId = useAuth(state => state.user?.id)
  const companyId = useAuth(state => state.activeCompanyId)
  const projectId = useWorkspace(state => state.selectedId)
  const design = useSurface(state => state.surface?.kind === 'design' ? state.surface : null)
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
    <DesignWorkspace key={JSON.stringify([userId, companyId, projectId, conversationId])} visible={visible} design={design} onClose={() => useSurface.getState().closeDesign()}>
    <ConversationRuntimeProvider key={conversationId} conversationId={conversationId}>
      <main ref={rootRef} className="chat-surface chat-pane grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-background">
        <ConversationHeader
          conversationId={conversationId}
          variant={onBackToConversations ? 'mobile' : 'desktop'}
          onBack={onBackToConversations}
          onSearch={() => setSearchOpen(true)}
          actions={<DesignButton key={conversationId} conversationId={conversationId} />}
        />
        <div data-chat-auxiliary="true">
          <ConversationSearch conversationId={conversationId} open={searchOpen} onClose={() => setSearchOpen(false)} rootRef={rootRef} />
        </div>
        <div className="chat-thread-layout min-h-0 min-w-0">
          <Suspense fallback={<div className="mx-auto flex h-full w-full max-w-[848px] flex-col overflow-hidden px-6 max-sm:px-3"><ConversationSkeleton /></div>}>
            <ConversationThread conversationId={conversationId} readOnly={conversation.readOnly} />
          </Suspense>
        </div>
      </main>
    </ConversationRuntimeProvider>
    </DesignWorkspace>
  )
}
