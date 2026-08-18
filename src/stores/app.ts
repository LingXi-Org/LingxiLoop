import { create } from 'zustand'
import type { ViewKey } from '@/types'

interface AppState {
  view: ViewKey['view']
  setView: (v: ViewKey['view']) => void

  selectedConversationId: string | null
  selectConversation: (id: string | null) => void
  setSelectedIfNone: (id: string) => void

  /** mobile-only: which level of the navigation stack we're on */
  mobileStack: 'list' | 'chat' | 'info'
  pushMobileStack: (s: 'list' | 'chat' | 'info') => void

  /**
   * Right info pane on desktop. null = pane is closed. Set to an agent id to
   * pin that specific agent's profile open. Closing happens explicitly (× in
   * the pane); the pane no longer rotates as agent statuses change.
   */
  infoAgentId: string | null
  openAgentInfo: (agentId: string) => void
  closeAgentInfo: () => void

  /**
   * Composer state — currently-quoted message id, keyed by conversation.
   * `{ convoId: messageId }` so switching rooms doesn't drop another room's
   * reply draft. Cleared on send / explicit dismiss.
   */
  replyingTo: Record<string, string>
  setReplyingTo: (convoId: string, messageId: string | null) => void

  /**
   * Centralized "scroll to a message" — set this and the active ChatPane (or
   * MobileChat) picks it up, calls Virtuoso scrollToIndex (which MOUNTS
   * off-screen rows reliably, unlike getElementById), flashes the row, then
   * clears the field. Quote-jumps and `#N` chips both go through here so
   * neither silently no-ops when the target isn't currently mounted.
   */
  pendingJumpMessageId: string | null
  jumpToMessage: (messageId: string) => void
  clearPendingJump: () => void

  /**
   * Per-conversation composer text drafts. Mobile lives or dies by this:
   * navigating from chat → list → chat unmounts MobileChat, which would
   * blow away a local useState draft. We persist it here so a half-typed
   * message survives the trip. Cleared on send.
   */
  composerDrafts: Record<string, string>
  setComposerDraft: (convoId: string, text: string) => void

  /**
   * Thread drawer state — when set, the right pane shows the thread view
   * for `{ convoId, rootId }`. Null means closed. Only one open at a time;
   * opening a new thread replaces the previous.
   */
  openThread: { convoId: string; rootId: string } | null
  openThreadView: (convoId: string, rootId: string) => void
  closeThreadView: () => void

  /**
   * Conversation-side artifact peeks. Artifacts opened from chat messages
   * occupy the same right rail as threads / agent profiles so the user can
   * inspect the work without leaving the conversation.
   */
  openDocumentId: string | null
  openDocumentPeek: (documentId: string) => void
  closeDocumentPeek: () => void
  openBoardId: string | null
  openBoardCardId: string | null
  openBoardPeek: (boardId: string, cardId?: string | null) => void
  closeBoardPeek: () => void
  openCalendarEventId: string | null
  openCalendarEventPeek: (eventId: string) => void
  closeCalendarEventPeek: () => void

  /**
   * Email composer state — when set, an overlay drawer is rendered on top
   * of the chat pane. `mode='new'` is a fresh thread; `mode='reply'` is
   * pre-filled from an existing email message (the server derives subject
   * Re:, In-Reply-To, and the recipient list from `replyToMessageId`).
   * Null = composer closed.
   */
  composeEmail: { mode: 'new' } | { mode: 'reply'; replyToMessageId: string } | null
  openComposeNew: () => void
  openComposeReply: (replyToMessageId: string) => void
  closeCompose: () => void
}

export const useApp = create<AppState>((set) => ({
  view: 'conversations',
  setView: (v) => set({ view: v }),

  // Starts unselected — the real conversations list arrives async from the
  // server. Seeding with a mock id here used to fire a 404 messages fetch
  // before the user picked anything.
  selectedConversationId: null,
  selectConversation: (id) => set({ selectedConversationId: id, mobileStack: id ? 'chat' : 'list' }),
  setSelectedIfNone: (id) => set((s) => s.selectedConversationId ? {} : { selectedConversationId: id }),

  mobileStack: 'list',
  pushMobileStack: (s) => set({ mobileStack: s }),

  infoAgentId: null,
  // Opening agent info closes any open thread — they share the same right
  // slot in DesktopApp. Keeping both states in sync here means the UI never
  // sees both flags on at once.
  openAgentInfo: (agentId) =>
    set({ infoAgentId: agentId, openThread: null, openDocumentId: null, openBoardId: null, openBoardCardId: null, openCalendarEventId: null }),
  closeAgentInfo: () => set({ infoAgentId: null }),

  replyingTo: {},
  setReplyingTo: (convoId, messageId) => set((s) => {
    const next = { ...s.replyingTo }
    if (messageId) next[convoId] = messageId
    else delete next[convoId]
    return { replyingTo: next }
  }),

  pendingJumpMessageId: null,
  // The ChatPane effect clears this after consuming it (scrollToIndex + flash),
  // so repeated jumps to the same id transition null→id each time and re-fire.
  jumpToMessage: (messageId) => set({ pendingJumpMessageId: messageId }),
  clearPendingJump: () => set({ pendingJumpMessageId: null }),

  composerDrafts: {},
  setComposerDraft: (convoId, text) => set((s) => {
    const next = { ...s.composerDrafts }
    if (text) next[convoId] = text
    else delete next[convoId]
    return { composerDrafts: next }
  }),

  openThread: null,
  openThreadView: (convoId, rootId) =>
    set({ openThread: { convoId, rootId }, infoAgentId: null, openDocumentId: null, openBoardId: null, openBoardCardId: null, openCalendarEventId: null }),
  closeThreadView: () => set({ openThread: null }),

  openDocumentId: null,
  openDocumentPeek: (documentId) =>
    set({ openDocumentId: documentId, openBoardId: null, openBoardCardId: null, openCalendarEventId: null, openThread: null, infoAgentId: null }),
  closeDocumentPeek: () => set({ openDocumentId: null }),
  openBoardId: null,
  openBoardCardId: null,
  openBoardPeek: (boardId, cardId = null) =>
    set({ openBoardId: boardId, openBoardCardId: cardId, openDocumentId: null, openCalendarEventId: null, openThread: null, infoAgentId: null }),
  closeBoardPeek: () => set({ openBoardId: null, openBoardCardId: null }),
  openCalendarEventId: null,
  openCalendarEventPeek: (eventId) =>
    set({ openCalendarEventId: eventId, openDocumentId: null, openBoardId: null, openBoardCardId: null, openThread: null, infoAgentId: null }),
  closeCalendarEventPeek: () => set({ openCalendarEventId: null }),

  composeEmail: null,
  openComposeNew: () => set({ composeEmail: { mode: 'new' } }),
  openComposeReply: (replyToMessageId) => set({ composeEmail: { mode: 'reply', replyToMessageId } }),
  closeCompose: () => set({ composeEmail: null }),
}))
