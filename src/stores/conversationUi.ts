import { create } from 'zustand'

export interface ReplyBranchSelection { messageId: string; latestId: string }

interface ConversationUiState {
  replyingTo: Record<string, string>
  pendingJumpMessageId: string | null
  selectedReplyBranches: Record<string, ReplyBranchSelection>
  selectReplyBranch: (key: string, messageId: string, latestId: string) => void
  setReplyingTo: (conversationId: string, messageId: string | null) => void
  jumpToMessage: (messageId: string) => void
  clearPendingJump: () => void
}

export const useConversationUi = create<ConversationUiState>((set) => ({
  replyingTo: {},
  pendingJumpMessageId: null,
  selectedReplyBranches: {},
  selectReplyBranch: (key, messageId, latestId) => set(state => {
    const selected = { ...state.selectedReplyBranches }
    delete selected[key]
    selected[key] = { messageId, latestId }
    return { selectedReplyBranches: Object.fromEntries(Object.entries(selected).slice(-256)) }
  }),
  setReplyingTo: (conversationId, messageId) => set((state) => {
    const replyingTo = { ...state.replyingTo }
    if (messageId) replyingTo[conversationId] = messageId
    else delete replyingTo[conversationId]
    return { replyingTo }
  }),
  jumpToMessage: (messageId) => set({ pendingJumpMessageId: messageId }),
  clearPendingJump: () => set({ pendingJumpMessageId: null }),
}))
