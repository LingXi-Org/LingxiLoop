import { create } from 'zustand'
import { useSurface } from '@/stores/surface'
import type { ViewKey } from '@/types'

interface AppState {
  view: ViewKey['view']
  selectedConversationId: string | null
  setView: (view: ViewKey['view']) => void
  selectConversation: (id: string | null) => void
  setSelectedIfNone: (id: string) => void
}

/** Shell navigation only. Conversation UI and right-rail surfaces live elsewhere. */
export const useApp = create<AppState>((set) => ({
  view: 'conversations',
  selectedConversationId: null,
  setView: (view) => {
    if (view !== 'conversations') useSurface.getState().closeSurface()
    set({ view })
  },
  selectConversation: (id) => {
    useSurface.getState().closeForConversationChange()
    set({ view: 'conversations', selectedConversationId: id })
  },
  setSelectedIfNone: (id) => set((state) => state.selectedConversationId ? {} : { selectedConversationId: id }),
}))
