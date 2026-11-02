import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider, getLingxiMessageMetadata, useConversationThreadSnapshot } from '@/features/chat/runtime'
import { useSurface } from '@/stores/surface'

function ThreadDrawerContent({ conversationId, rootId }: { conversationId: string; rootId: string }) {
  const snapshot = useConversationThreadSnapshot(conversationId, rootId)
  const root = snapshot.messages.find((message) => message.id === rootId)
  const authorName = root ? getLingxiMessageMetadata(root).senderName : '主题'
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <p className="shrink-0 border-b border-[var(--im-divider-weak)] px-4 py-2 text-xs text-muted-foreground">
        {authorName} 的主题 · <span className="tabular-nums">{Math.max(0, snapshot.messages.length - 1)}</span> 条回复
      </p>
      <div className="min-h-0 flex-1">
        <ConversationThread conversationId={conversationId} threadRootId={rootId} compact />
      </div>
    </div>
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
