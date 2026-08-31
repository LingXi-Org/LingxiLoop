import { create } from 'zustand'
import { useParticipants } from '@/features/agents/state'
import { useCalendar } from '@/features/calendar/state'
import { useConversations } from '@/features/conversations/store'
import { useDocuments } from '@/features/documents/state'
import { getWorkspaceSession, setWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import type { WorkspaceSummary } from '@/types'
import { knowledgeApi } from './api'

interface WorkspaceState {
  companyId: string | null
  list: WorkspaceSummary[]
  selectedId: string | null
  loaded: boolean
  loading: boolean
  error: string | null
  load: () => Promise<void>
  select: (projectId: string) => Promise<void>
  reset: () => void
  leave: () => void
  createBlank: (name: string, description?: string) => Promise<string>
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
  load: async () => {
    const companyId = getActiveCompanyId()
    const epoch = ++workspaceRequestEpoch
    set((state) => state.companyId === companyId
      ? { loading: true, error: null }
      : { ...emptyWorkspaceState, companyId, loading: true })
    try {
      const list = await knowledgeApi.listProjects()
      if (epoch !== workspaceRequestEpoch || getActiveCompanyId() !== companyId) return
      const stored = getWorkspaceSession()
      const restoredProjectId = stored?.companyId === companyId && list.some((workspace) => workspace.id === stored.projectId && workspace.status !== 'DELETED')
        ? stored.projectId : null
      // The default Project is the authority for the initial IM surface. A
      // fresh browser has no stored selection, but project-scoped endpoints
      // must never be called without this context.
      const selectedId = restoredProjectId ?? list.find((workspace) => workspace.isDefault && workspace.status !== 'DELETED')?.id ?? null
      if (selectedId && companyId) setWorkspaceSession({ companyId, projectId: selectedId })
      else if (stored) setWorkspaceSession(null)
      set({ companyId, list, selectedId, loaded: true, loading: false })
    } catch (error) {
      if (epoch !== workspaceRequestEpoch || getActiveCompanyId() !== companyId) return
      set({
        error: userFacingError(error, '暂时无法打开学习区，请稍后重试。'),
        loaded: true,
        loading: false,
      })
    }
  },
  select: async (projectId) => {
    const workspace = get().list.find((item) => item.id === projectId)
    if (!workspace || workspace.status === 'DELETED') throw new Error('工作区不可用')
    const companyId = getActiveCompanyId()
    if (!companyId) throw new Error('未选择组织')
    setWorkspaceSession({ companyId, projectId })
    set({ selectedId: projectId })
    useApp.getState().selectConversation(null)
    useCalendar.getState().reset()
    useDocuments.getState().reset()
    await Promise.all([
      knowledgeApi.openProject(projectId),
      useParticipants.getState().load(),
      useConversations.getState().load(),
    ])
  },
  reset: () => {
    workspaceRequestEpoch += 1
    set(emptyWorkspaceState)
  },
  leave: () => {
    setWorkspaceSession(null)
    set({ selectedId: null })
    useApp.getState().selectConversation(null)
  },
  createBlank: async (name, description = '') => {
    const created = await knowledgeApi.createProject({ name, description })
    await get().load()
    await get().select(created.id)
    return created.id
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
  const activeCompanyId = getActiveCompanyId()
  if (activeCompanyId === selection.companyId) {
    await useWorkspace.getState().select(selection.projectId)
    return
  }

  setWorkspaceSession(selection)
  useWorkspace.getState().reset()
  useParticipants.getState().reset()
  useConversations.getState().reset()
  useCalendar.getState().reset()
  useDocuments.getState().reset()
  useApp.setState({ selectedConversationId: null })
  useAuth.getState().setActiveCompany(selection.companyId)
}
