import { create } from 'zustand'
import { useSurface } from '@/stores/surface'
import { chatLatency } from '@/features/chat/runtime/latency'
import type { ViewKey } from '@/types'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { beginWebNavigation, writeWebDestination } from '@/lib/webNavigation'

interface AppState {
  view: ViewKey['view']
  selectedConversationId: string | null
  mobileConversationOpen: boolean
  navigationReady: boolean
  navigationPending: boolean
  navigationError: string | null
  autoSelectConversation: boolean
  canManageWorkspace: boolean
  setView: (view: ViewKey['view']) => void
  selectConversation: (id: string | null) => void
  setSelectedIfNone: (id: string) => void
}

/** Shell navigation only. Conversation UI and right-rail surfaces live elsewhere. */
export const useApp = create<AppState>((set, get) => ({
  view: 'conversations',
  selectedConversationId: null,
  mobileConversationOpen: false,
  navigationReady: false,
  navigationPending: false,
  navigationError: null,
  autoSelectConversation: true,
  canManageWorkspace: false,
  setView: (view) => {
    const denied = get().navigationReady && !get().canManageWorkspace && ['courses', 'course-content', 'course-members', 'course-status'].includes(view)
    if (denied) view = 'learning'
    if (view !== 'conversations') useSurface.getState().closeSurface()
    beginWebNavigation()
    set({ view, mobileConversationOpen: view === 'conversations' && Boolean(get().selectedConversationId), navigationPending: false,
      navigationError: denied ? '你没有此页面的访问权限，已打开学习概览。' : null, autoSelectConversation: false })
    if (get().navigationReady) writeWebDestination({ projectId: getWorkspaceSession()?.projectId ?? null, view, conversationId: get().selectedConversationId }, denied ? 'replace' : 'push')
  },
  selectConversation: (id) => {
    chatLatency.opened(id)
    useSurface.getState().closeForConversationChange()
    beginWebNavigation()
    set({ view: 'conversations', selectedConversationId: id, mobileConversationOpen: Boolean(id), navigationPending: false, navigationError: null, autoSelectConversation: false })
    if (get().navigationReady) writeWebDestination({ projectId: getWorkspaceSession()?.projectId ?? null, view: 'conversations', conversationId: id }, 'push')
  },
  setSelectedIfNone: (id) => set((state) => {
    if (state.selectedConversationId || !state.autoSelectConversation || state.navigationPending) return {}
    chatLatency.opened(id)
    return { selectedConversationId: id }
  }),
}))
