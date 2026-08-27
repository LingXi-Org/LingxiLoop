import { create } from 'zustand'

interface ConversationUiState {
  replyingTo: Record<string, string>
  pendingJumpMessageId: string | null
  setReplyingTo: (conversationId: string, messageId: string | null) => void
  jumpToMessage: (messageId: string) => void
  clearPendingJump: () => void
}

export const useConversationUi = create<ConversationUiState>((set) => ({
  replyingTo: {},
  pendingJumpMessageId: null,
  setReplyingTo: (conversationId, messageId) => set((state) => {
    const replyingTo = { ...state.replyingTo }
    if (messageId) replyingTo[conversationId] = messageId
    else delete replyingTo[conversationId]
    return { replyingTo }
  }),
  jumpToMessage: (messageId) => set({ pendingJumpMessageId: messageId }),
  clearPendingJump: () => set({ pendingJumpMessageId: null }),
}))
