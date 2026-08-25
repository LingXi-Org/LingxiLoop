import { create } from 'zustand'
import { api } from '@/api/client'
import { getWorkspaceSession, setWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { getActiveCompanyId } from '@/stores/auth'
import type { WorkspaceSummary } from '@/types'

interface WorkspaceState {
  list: WorkspaceSummary[]
  selectedId: string | null
  loaded: boolean
  loading: boolean
  error: string | null
  load: (mockMode?: boolean) => Promise<void>
  select: (projectId: string) => Promise<void>
  leave: () => void
  createBlank: (name: string, description?: string) => Promise<string>
}

const mockIso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
const mockWorkspaces: WorkspaceSummary[] = [
  { id: 'mock-research', name: 'AI 产品研究', description: 'NotebookLM、Open Notebook、访谈与产品决策依据', color: '#5266d6', status: 'active', createdBy: 'mock-me', isGeneral: false, createdAt: mockIso(24 * 36), updatedAt: mockIso(0.4), archivedAt: null, lastVisitedAt: mockIso(0.5), sourceCount: 9, conversationCount: 3, documentCount: 2, boardCount: 1, calendarEventCount: 2, canvasCount: 1, canManage: true },
  { id: 'mock-launch', name: '秋季发布计划', description: '发布简报、客户反馈、指标与上市节奏', color: '#d97706', status: 'active', createdBy: 'mock-me', isGeneral: false, createdAt: mockIso(24 * 18), updatedAt: mockIso(8), archivedAt: null, lastVisitedAt: mockIso(26), sourceCount: 4, conversationCount: 2, documentCount: 3, boardCount: 1, calendarEventCount: 4, canvasCount: 0, canManage: true },
  { id: 'mock-general', name: '通用工作区', description: '未归类对话、入站邮件与临时资料', color: '#64748b', status: 'active', createdBy: 'mock-me', isGeneral: true, createdAt: mockIso(24 * 90), updatedAt: mockIso(31), archivedAt: null, lastVisitedAt: mockIso(72), sourceCount: 2, conversationCount: 1, documentCount: 1, boardCount: 0, calendarEventCount: 0, canvasCount: 0, canManage: true },
  { id: 'mock-empty', name: '空白工作区', description: '没有资料、对话或 Agent；可从任一入口开始', color: '#0f9f86', status: 'active', createdBy: 'mock-me', isGeneral: false, createdAt: mockIso(2), updatedAt: mockIso(2), archivedAt: null, lastVisitedAt: null, sourceCount: 0, conversationCount: 0, documentCount: 0, boardCount: 0, calendarEventCount: 0, canvasCount: 0, canManage: true },
  { id: 'mock-archive', name: '2025 市场扫描', description: '已归档的行业报告与竞品快照', color: '#8b5cf6', status: 'archived', createdBy: 'mock-me', isGeneral: false, createdAt: mockIso(24 * 240), updatedAt: mockIso(24 * 120), archivedAt: mockIso(24 * 90), lastVisitedAt: mockIso(24 * 100), sourceCount: 12, conversationCount: 5, documentCount: 4, boardCount: 2, calendarEventCount: 0, canvasCount: 1, canManage: true },
]

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  list: [], selectedId: null, loaded: false, loading: false, error: null,
  load: async (mockMode = false) => {
    set({ loading: true, error: null })
    try {
      const companyId = getActiveCompanyId() ?? (mockMode ? 'mock-company' : null)
      const list = mockMode ? mockWorkspaces : await api.listProjects()
      const stored = getWorkspaceSession()
      const selectedId = stored?.companyId === companyId && list.some((workspace) => workspace.id === stored.projectId && workspace.status === 'active')
        ? stored.projectId : null
      if (!selectedId && stored) setWorkspaceSession(null)
      set({ list, selectedId, loaded: true, loading: false })
      if (mockMode && selectedId) {
        const { activateMockWorkspace } = await import('@/dev/mockIm')
        activateMockWorkspace(selectedId)
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loaded: true, loading: false })
    }
  },
  select: async (projectId) => {
    const workspace = get().list.find((item) => item.id === projectId)
    if (!workspace || workspace.status !== 'active') throw new Error('工作区不可用')
    const companyId = getActiveCompanyId() ?? 'mock-company'
    setWorkspaceSession({ companyId, projectId })
    set({ selectedId: projectId })
    useApp.getState().selectConversation(null)
    if (projectId.startsWith('mock-')) {
      const { activateMockWorkspace } = await import('@/dev/mockIm')
      activateMockWorkspace(projectId)
    } else await api.openProject(projectId)
  },
  leave: () => {
    setWorkspaceSession(null)
    set({ selectedId: null })
    useApp.getState().selectConversation(null)
  },
  createBlank: async (name, description = '') => {
    if ((getActiveCompanyId() ?? '').startsWith('mock-')) {
      const id = `mock-custom-${Date.now()}`
      const now = new Date().toISOString()
      set((state) => ({ list: [{ id, name, description, color: '#0f9f86', status: 'active', createdBy: 'mock-me', isGeneral: false, createdAt: now, updatedAt: now, archivedAt: null, lastVisitedAt: null, sourceCount: 0, conversationCount: 0, documentCount: 0, boardCount: 0, calendarEventCount: 0, canvasCount: 0, canManage: true }, ...state.list] }))
      await get().select(id)
      return id
    }
    const created = await api.createProject({ name, description })
    await get().load(false)
    await get().select(created.id)
    return created.id
  },
}))

export function activeWorkspace(): WorkspaceSummary | null {
  const state = useWorkspace.getState()
  return state.list.find((workspace) => workspace.id === state.selectedId) ?? null
}
