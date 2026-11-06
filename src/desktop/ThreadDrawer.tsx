import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider, getLingxiMessageMetadata, useConversationThreadSnapshot } from '@/features/chat/runtime'
import { useSurface } from '@/stores/surface'

function ThreadDrawerContent({ conversationId, rootId }: { conversationId: string; rootId: string }) {
  const snapshot = useConversationThreadSnapshot(conversationId, rootId)
  const root = snapshot.messages.find((message) => message.id === rootId)
  const authorName = root ? getLingxiMessageMetadata(root).senderName : '主题'
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <p className="m-0 flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
        <span aria-hidden="true" className="grid size-6 place-items-center rounded-[7px] bg-[rgb(59_111_216/12%)] text-[#3B6FD8]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></svg>
        </span>
        <span><span className="tabular-nums">{Math.max(0, snapshot.messages.length - 1)}</span> 条回复 · {authorName} 的主题</span>
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
