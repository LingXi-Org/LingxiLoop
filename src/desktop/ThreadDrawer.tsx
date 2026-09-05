import { Button } from '@/components/ui/button'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider, getLingxiMessageMetadata, useConversationThreadSnapshot } from '@/features/chat/runtime'
import { useSurface } from '@/stores/surface'

function ThreadDrawerContent({ conversationId, rootId }: { conversationId: string; rootId: string }) {
  const close = useSurface((state) => state.closeThreadView)
  const snapshot = useConversationThreadSnapshot(conversationId, rootId)
  const root = snapshot.messages.find((message) => message.id === rootId)
  const authorName = root ? getLingxiMessageMetadata(root).senderName : '主题'
  return (
    <aside className="relative flex min-h-0 flex-col overflow-hidden border-s border-border bg-background">
      <header className="mx-2 mt-2 flex min-h-12 items-center justify-between rounded-2xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sidebar-foreground shadow-sm backdrop-blur-xl">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">主题 · {authorName}</div>
          <div className="mt-0.5 text-[13px] font-semibold text-foreground">{Math.max(0, snapshot.messages.length - 1)} 回复</div>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="关闭线程" className="text-muted-foreground">×</Button>
      </header>
      <div className="min-h-0 flex-1">
        <ConversationThread conversationId={conversationId} threadRootId={rootId} compact />
      </div>
    </aside>
  )
}

export function ThreadDrawer() {
  const surface = useSurface((state) => state.surface)
  if (surface?.kind !== 'thread') return null
  return (
    <ConversationRuntimeProvider key={`${surface.convoId}:${surface.rootId}`} conversationId={surface.convoId} threadRootId={surface.rootId}>
      <ThreadDrawerContent conversationId={surface.convoId} rootId={surface.rootId} />
    </ConversationRuntimeProvider>
  )
}
