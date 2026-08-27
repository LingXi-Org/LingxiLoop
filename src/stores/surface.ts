import { create } from 'zustand'
import { useApp } from '@/stores/app'

export type ConversationSurface =
  | { kind: 'member'; participantId: string }
  | { kind: 'thread'; convoId: string; rootId: string }
  | { kind: 'document'; documentId: string }
  | { kind: 'board'; boardId: string; cardId: string | null }
  | { kind: 'calendar'; eventId: string }
  | { kind: 'canvas'; canvasId: string }
  | null

interface SurfaceState {
  surface: ConversationSurface
  openAgentInfo: (participantId: string) => void
  closeAgentInfo: () => void
  openThreadView: (convoId: string, rootId: string) => void
  closeThreadView: () => void
  openDocumentPeek: (documentId: string) => void
  closeDocumentPeek: () => void
  openBoardPeek: (boardId: string, cardId?: string | null) => void
  closeBoardPeek: () => void
  openCalendarEventPeek: (eventId: string) => void
  closeCalendarEventPeek: () => void
  openCanvasPeek: (canvasId: string) => void
  closeCanvasPeek: () => void
  closeForConversationChange: () => void
  closeSurface: () => void
}

const showConversation = () => useApp.setState({ view: 'conversations' })
const closeKind = (kind: NonNullable<ConversationSurface>['kind']) =>
  (state: SurfaceState) => state.surface?.kind === kind ? { surface: null } : {}

export const useSurface = create<SurfaceState>((set) => ({
  surface: null,
  openAgentInfo: (participantId) => { showConversation(); set({ surface: { kind: 'member', participantId } }) },
  closeAgentInfo: () => set(closeKind('member')),
  openThreadView: (convoId, rootId) => { showConversation(); set({ surface: { kind: 'thread', convoId, rootId } }) },
  closeThreadView: () => set(closeKind('thread')),
  openDocumentPeek: (documentId) => { showConversation(); set({ surface: { kind: 'document', documentId } }) },
  closeDocumentPeek: () => set(closeKind('document')),
  openBoardPeek: (boardId, cardId = null) => { showConversation(); set({ surface: { kind: 'board', boardId, cardId } }) },
  closeBoardPeek: () => set(closeKind('board')),
  openCalendarEventPeek: (eventId) => { showConversation(); set({ surface: { kind: 'calendar', eventId } }) },
  closeCalendarEventPeek: () => set(closeKind('calendar')),
  openCanvasPeek: (canvasId) => { showConversation(); set({ surface: { kind: 'canvas', canvasId } }) },
  closeCanvasPeek: () => set(closeKind('canvas')),
  closeForConversationChange: () => set((state) => state.surface?.kind === 'member' ? {} : { surface: null }),
  closeSurface: () => set({ surface: null }),
}))
