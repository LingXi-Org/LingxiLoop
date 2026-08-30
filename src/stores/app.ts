import { create } from 'zustand'
import { useSurface } from '@/stores/surface'
import type { ViewKey } from '@/types'

interface AppState {
  view: ViewKey['view']
  trustProjectId: string | null
  selectedConversationId: string | null
  setView: (view: ViewKey['view']) => void
  openTrust: (projectId?: string) => void
  selectConversation: (id: string | null) => void
  setSelectedIfNone: (id: string) => void
}

/** Shell navigation only. Conversation UI and right-rail surfaces live elsewhere. */
export const useApp = create<AppState>((set) => ({
  view: 'conversations',
  trustProjectId: null,
  selectedConversationId: null,
  setView: (view) => {
    if (view !== 'conversations') useSurface.getState().closeSurface()
    set({ view, ...(view === 'trust' ? {} : { trustProjectId: null }) })
  },
  openTrust: (projectId) => {
    useSurface.getState().closeSurface()
    set({ view: 'trust', trustProjectId: projectId ?? null })
  },
  selectConversation: (id) => {
    useSurface.getState().closeForConversationChange()
    set({ view: 'conversations', selectedConversationId: id })
  },
  setSelectedIfNone: (id) => set((state) => state.selectedConversationId ? {} : { selectedConversationId: id }),
}))
