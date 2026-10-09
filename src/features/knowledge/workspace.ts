import { create } from 'zustand'
import { bootParticipants, useParticipants } from '@/features/agents/state'
import { useCalendar } from '@/features/calendar/state'
import { bootConversations, useConversations } from '@/features/conversations/store'
import { chatTransport } from '@/features/chat/runtime/transport'
import { useDocuments } from '@/features/documents/state'
import { useCanvas } from '@/features/canvas/state'
import { useKnowledgeSources } from './state'
import { getWorkspaceSession, setWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import type { WorkspaceSummary } from '@/types'
import { knowledgeApi } from './api'
import { beginWebNavigation, currentWebNavigation, isCurrentWebNavigation } from '@/lib/webNavigation'

interface WorkspaceState {
  companyId: string | null
  list: WorkspaceSummary[]
  selectedId: string | null
  loaded: boolean
  loading: boolean
  error: string | null
  load: (preferredProjectId?: string) => Promise<void>
  select: (projectId: string) => Promise<void>
  reset: () => void
  leave: () => void
}

let workspaceRequestEpoch = 0

const emptyWorkspaceState = {
  companyId: null,
  list: [] as WorkspaceSummary[],
  selectedId: null,
  loaded: false,
  loading: false,
  error: null,
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ...emptyWorkspaceState,
  load: async (preferredProjectId) => {
    const navigationEpoch = currentWebNavigation()
    const companyId = getActiveCompanyId()
    const userId = useAuth.getState().user?.id
    const epoch = ++workspaceRequestEpoch
    set((state) => state.companyId === companyId
      ? { loading: true, error: null }
      : { ...emptyWorkspaceState, companyId, loading: true })
    try {
      const list = await knowledgeApi.listProjects()
      if (epoch !== workspaceRequestEpoch || !isCurrentWebNavigation(navigationEpoch) || getActiveCompanyId() !== companyId || useAuth.getState().user?.id !== userId) return
      const stored = getWorkspaceSession()
      const restoredProjectId = stored?.companyId === companyId && list.some((workspace) => workspace.id === stored.projectId && workspace.status !== 'DELETED')
        ? stored.projectId : null
      // The default Project is the authority for the initial IM surface. A
      // fresh browser has no stored selection, but project-scoped endpoints
      // must never be called without this context.
      const selectedId = preferredProjectId
        ? list.find((workspace) => workspace.id === preferredProjectId && workspace.status !== 'DELETED')?.id ?? null
        : restoredProjectId ?? list.find((workspace) => workspace.status === 'ACTIVE')?.id ?? null
      if (selectedId && companyId) setWorkspaceSession({ companyId, projectId: selectedId })
      else if (stored) setWorkspaceSession(null)
      set({ companyId, list, selectedId, loaded: true, loading: false })
    } catch (error) {
      if (epoch !== workspaceRequestEpoch || !isCurrentWebNavigation(navigationEpoch) || getActiveCompanyId() !== companyId || useAuth.getState().user?.id !== userId) return
      set({
        error: userFacingError(error, '暂时无法打开学习区，请稍后重试。'),
        loaded: true,
        loading: false,
      })
    } finally {
      if (epoch === workspaceRequestEpoch && getActiveCompanyId() === companyId && useAuth.getState().user?.id === userId) set({ loading: false })
    }
  },
  select: async (projectId) => {
    const navigationEpoch = currentWebNavigation()
    const workspace = get().list.find((item) => item.id === projectId)
    if (!workspace || workspace.status === 'DELETED') throw new Error('工作区不可用')
    const companyId = getActiveCompanyId()
    const userId = useAuth.getState().user?.id
    if (!companyId) throw new Error('未选择组织')
    const epoch = ++workspaceRequestEpoch
    // Verify the destination before changing the project header used by IM.
    await knowledgeApi.openProject(projectId)
    if (epoch !== workspaceRequestEpoch || !isCurrentWebNavigation(navigationEpoch) || getActiveCompanyId() !== companyId || useAuth.getState().user?.id !== userId) return
    setWorkspaceSession({ companyId, projectId })
    set({ selectedId: projectId })
    useApp.setState({ selectedConversationId: null, mobileConversationOpen: false, autoSelectConversation: false,
      canManageWorkspace: Boolean(workspace.courseId && workspace.canManage && useAuth.getState().companies.find((company) => company.id === companyId)?.role === 'teacher') })
    useParticipants.getState().reset()
    useConversations.getState().reset()
    useCanvas.getState().reset()
    useKnowledgeSources.getState().reset()
    useCalendar.getState().reset()
    useDocuments.getState().reset()
    await Promise.all([
      useParticipants.getState().load(),
      useConversations.getState().load(),
    ])
    if (epoch !== workspaceRequestEpoch || !isCurrentWebNavigation(navigationEpoch) || getActiveCompanyId() !== companyId || useAuth.getState().user?.id !== userId) return
    const conversations = useConversations.getState()
    if (conversations.projectId !== projectId || !conversations.loaded || conversations.error) throw new Error(conversations.error ?? '暂时无法加载对话，请稍后重试。')
    // Every authorized entry point, including recovery from an empty workspace,
    // starts the same live subscriptions after its scoped channel list is ready.
    chatTransport.boot()
    bootParticipants(false)
    bootConversations(false)
  },
  reset: () => {
    workspaceRequestEpoch += 1
    set(emptyWorkspaceState)
  },
  leave: () => {
    workspaceRequestEpoch += 1
    setWorkspaceSession(null)
    set({ selectedId: null })
    useApp.setState({ selectedConversationId: null, mobileConversationOpen: false, autoSelectConversation: false, canManageWorkspace: false })
    useParticipants.getState().reset()
    useConversations.getState().reset()
    useCalendar.getState().reset()
    useDocuments.getState().reset()
    useCanvas.getState().reset()
    useKnowledgeSources.getState().reset()
  },

}))

export function activeWorkspace(): WorkspaceSummary | null {
  const state = useWorkspace.getState()
  return state.list.find((workspace) => workspace.id === state.selectedId) ?? null
}

export interface LearningSpaceSelection {
  companyId: string
  projectId: string
}

/**
 * Select an accessible learning space without ever rendering data from the
 * previously active company in the new context. Same-company changes retain
 * the existing project-open workflow; cross-company changes are restored by
 * AuthedApp after its company-keyed remount.
 */
export async function selectLearningSpace(selection: LearningSpaceSelection): Promise<void> {
  if (!useAuth.getState().companies.some((company) => company.id === selection.companyId)) throw new Error('仅可使用当前公司')
  const epoch = beginWebNavigation()
  useApp.setState({ navigationPending: true, navigationError: null, autoSelectConversation: false })
  const activeCompanyId = getActiveCompanyId()
  if (activeCompanyId === selection.companyId) {
    try {
      if (!useWorkspace.getState().list.some((workspace) => workspace.id === selection.projectId)) {
        await useWorkspace.getState().load(selection.projectId)
      }
      if (!isCurrentWebNavigation(epoch)) return
      await useWorkspace.getState().select(selection.projectId)
    } finally {
      if (isCurrentWebNavigation(epoch)) useApp.setState({ navigationPending: false })
    }
    return
  }

  setWorkspaceSession(selection)
  useWorkspace.getState().reset()
  useParticipants.getState().reset()
  useConversations.getState().reset()
  useCalendar.getState().reset()
  useDocuments.getState().reset()
  useCanvas.getState().reset()
  useKnowledgeSources.getState().reset()
  useApp.setState({ selectedConversationId: null })
  useAuth.getState().setActiveCompany(selection.companyId)
}
