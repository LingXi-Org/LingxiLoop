import { create } from 'zustand'
import { getWorkspaceSession, setWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { getActiveCompanyId } from '@/stores/auth'
import type { WorkspaceSummary } from '@/types'
import { knowledgeApi } from './api'

interface WorkspaceState {
  list: WorkspaceSummary[]
  selectedId: string | null
  loaded: boolean
  loading: boolean
  error: string | null
  load: () => Promise<void>
  select: (projectId: string) => Promise<void>
  leave: () => void
  createBlank: (name: string, description?: string) => Promise<string>
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  list: [], selectedId: null, loaded: false, loading: false, error: null,
  load: async () => {
    set({ loading: true, error: null })
    try {
      const companyId = getActiveCompanyId()
      const list = await knowledgeApi.listProjects()
      const stored = getWorkspaceSession()
      const restoredProjectId = stored?.companyId === companyId && list.some((workspace) => workspace.id === stored.projectId && workspace.status !== 'DELETED')
        ? stored.projectId : null
      // The default Project is the authority for the initial IM surface. A
      // fresh browser has no stored selection, but project-scoped endpoints
      // must never be called without this context.
      const selectedId = restoredProjectId ?? list.find((workspace) => workspace.isDefault && workspace.status !== 'DELETED')?.id ?? null
      if (selectedId && companyId) setWorkspaceSession({ companyId, projectId: selectedId })
      else if (stored) setWorkspaceSession(null)
      set({ list, selectedId, loaded: true, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loaded: true, loading: false })
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
    await knowledgeApi.openProject(projectId)
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
