import { create } from 'zustand'
import { useConversations } from '@/features/conversations/store'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { knowledgeApi } from './api'
import type { ConversationSourceSelection, KnowledgeSource } from './contracts'

let sourcePollTimer: number | null = null
let sourceRequestEpoch = 0
let selectionRequestEpoch = 0
const sourceScope = () => {
  const workspace = getWorkspaceSession()
  return `${workspace?.companyId}:${workspace?.projectId}:${useApp.getState().selectedConversationId}`
}
function scheduleSourcePoll(sources: KnowledgeSource[], reload: () => Promise<void>): void {
  const pending = sources.some((item) => item.status === 'upload_pending' || item.status === 'queued' || item.status === 'processing')
  if (!pending || sourcePollTimer || typeof window === 'undefined') return
  sourcePollTimer = window.setTimeout(() => {
    sourcePollTimer = null
    void reload()
  }, 2_000)
}

interface SourceState {
  list: KnowledgeSource[]
  loading: boolean
  error: string | null
  selectedSource: KnowledgeSource | null
  detailLoading: boolean
  conversationSelection: ConversationSourceSelection | null
  load: () => Promise<void>
  open: (sourceId: string) => Promise<void>
  close: () => void
  addText: (title: string, text: string) => Promise<void>
  addUrl: (url: string, title?: string) => Promise<void>
  retry: (sourceId: string) => Promise<void>
  remove: (sourceId: string) => Promise<void>
  loadConversationSelection: (conversationId: string) => Promise<void>
  setSourceEnabled: (conversationId: string, sourceId: string, enabled: boolean) => Promise<void>
  reset: () => void
}

function currentConversationId(): string {
  const id = useApp.getState().selectedConversationId
  const conversation = useConversations.getState().list.find((item) => item.id === id)
  if (!id || (conversation?.kind !== 'group' && conversation?.kind !== 'direct')) throw new Error('请选择可使用资料的对话')
  return id
}

export const useKnowledgeSources = create<SourceState>((set, get) => ({
  list: [], loading: false, error: null, selectedSource: null, detailLoading: false, conversationSelection: null,
  load: async () => {
    const id = currentConversationId()
    const epoch = ++sourceRequestEpoch
    const scope = sourceScope()
    set({ loading: true, error: null })
    try {
      const list = await knowledgeApi.listSources(id)
      if (epoch !== sourceRequestEpoch || scope !== sourceScope()) return
      set({ list, loading: false })
      scheduleSourcePoll(list, get().load)
    } catch (error) {
      if (epoch !== sourceRequestEpoch || scope !== sourceScope()) return
      set({ loading: false, error: userFacingError(error, '暂时无法加载资料，请稍后重试。') })
      throw error
    }
  },
  open: async (sourceId) => {
    const scope = sourceScope()
    const epoch = sourceRequestEpoch
    const cached = get().list.find((source) => source.id === sourceId) ?? null
    set({ selectedSource: cached, detailLoading: !cached })
    try {
      const selectedSource = await knowledgeApi.getSource(currentConversationId(), sourceId)
      if (scope === sourceScope() && epoch === sourceRequestEpoch) set({ selectedSource })
    } finally {
      if (scope === sourceScope() && epoch === sourceRequestEpoch) set({ detailLoading: false })
    }
  },
  close: () => set({ selectedSource: null, detailLoading: false }),
  addText: async (title, text) => { await knowledgeApi.addTextSource(currentConversationId(), { title, text }); await get().load() },
  addUrl: async (url, title) => { await knowledgeApi.addUrlSource(currentConversationId(), { url, title }); await get().load() },
  retry: async (sourceId) => { await knowledgeApi.retrySource(currentConversationId(), sourceId); await get().load() },
  remove: async (sourceId) => {
    await knowledgeApi.deleteSource(currentConversationId(), sourceId)
    set({ selectedSource: null, detailLoading: false })
    await get().load()
  },
  loadConversationSelection: async (conversationId) => {
    if (currentConversationId() !== conversationId) throw new Error('只能管理当前对话的资料')
    const epoch = ++selectionRequestEpoch
    const scope = sourceScope()
    const conversationSelection = await knowledgeApi.getConversationSources(conversationId)
    if (epoch === selectionRequestEpoch && scope === sourceScope()) set({ conversationSelection })
  },
  setSourceEnabled: async (conversationId, sourceId, enabled) => {
    if (currentConversationId() !== conversationId) throw new Error('只能管理当前对话的资料')
    const scope = sourceScope()
    const cached = get().conversationSelection
    const selection = cached?.conversationId === conversationId ? cached : await knowledgeApi.getConversationSources(conversationId)
    if (scope !== sourceScope()) return
    if (!selection.sources.some((source) => source.sourceId === sourceId && source.status === 'ready')) throw new Error('当前对话无法使用这份资料')
    const excluded = selection.sources.filter((source) => source.sourceId !== sourceId && !source.enabled).map((source) => source.sourceId)
    if (!enabled) excluded.push(sourceId)
    await knowledgeApi.updateConversationSources(conversationId, excluded)
    if (scope === sourceScope()) await get().loadConversationSelection(conversationId)
  },
  reset: () => {
    sourceRequestEpoch += 1
    selectionRequestEpoch += 1
    if (sourcePollTimer !== null) window.clearTimeout(sourcePollTimer)
    sourcePollTimer = null
    set({ list: [], loading: false, error: null, selectedSource: null, detailLoading: false, conversationSelection: null })
  },
}))
