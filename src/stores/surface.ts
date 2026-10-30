import { create } from 'zustand'
import { useApp } from '@/stores/app'

export type ConversationSurface =
  | { kind: 'member'; participantId: string }
  | { kind: 'thread'; convoId: string; rootId: string }
  | { kind: 'document'; documentId: string }
  | { kind: 'design'; artifactId: string; title: string }
  | null

interface SurfaceState {
  surface: ConversationSurface
  openAgentInfo: (participantId: string) => void
  closeAgentInfo: () => void
  openThreadView: (convoId: string, rootId: string) => void
  closeThreadView: () => void
  openDocumentPeek: (documentId: string) => void
  closeDocumentPeek: () => void
  openDesign: (artifactId: string, title: string) => void
  closeDesign: () => void
  closeForConversationChange: () => void
  closeSurface: () => void
}

const showConversation = () => useApp.getState().setView('conversations')
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
  openDesign: (artifactId, title) => { showConversation(); set({ surface: { kind: 'design', artifactId, title } }) },
  closeDesign: () => set(closeKind('design')),
  closeForConversationChange: () => set((state) => state.surface?.kind === 'member' ? {} : { surface: null }),
  closeSurface: () => set({ surface: null }),
}))
