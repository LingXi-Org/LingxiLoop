import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime'
import { useConversations } from '@/features/conversations/store'

export function SlidesConversation({ conversationId, beforeSend }: { conversationId: string | null; beforeSend(): Promise<void> }) {
  const readOnly = useConversations(state => state.list.find(item => item.id === conversationId)?.readOnly)
  if (!conversationId) return <ResourceSkeleton variant="media" label="正在打开演示文稿助手" />
  return <ConversationRuntimeProvider conversationId={conversationId} beforeSend={beforeSend}>
    <ConversationThread conversationId={conversationId} readOnly={readOnly} />
  </ConversationRuntimeProvider>
}
