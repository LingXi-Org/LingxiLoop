import { create } from 'zustand'
import { useConversations } from '@/features/conversations/store'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { knowledgeApi } from './api'
import type { ConversationSourceSelection, KnowledgeCitation, KnowledgeSource } from './contracts'

let sourcePollTimer: number | null = null
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
  selectedCitation: KnowledgeCitation | null
  detailLoading: boolean
  conversationSelection: ConversationSourceSelection | null
  load: () => Promise<void>
  open: (sourceId: string) => Promise<void>
  openCitation: (citation: KnowledgeCitation) => Promise<void>
  close: () => void
  addText: (title: string, text: string) => Promise<void>
  addUrl: (url: string, title?: string) => Promise<void>
  retry: (sourceId: string) => Promise<void>
  remove: (sourceId: string) => Promise<void>
  loadConversationSelection: (conversationId: string) => Promise<void>
  setSourceEnabled: (conversationId: string, sourceId: string, enabled: boolean) => Promise<void>
}

function currentConversationId(): string {
  const id = useApp.getState().selectedConversationId
  const conversation = useConversations.getState().list.find((item) => item.id === id)
  if (!id || (conversation?.kind !== 'group' && conversation?.kind !== 'direct')) throw new Error('请选择可使用资料的对话')
  return id
}

export const useKnowledgeSources = create<SourceState>((set, get) => ({
  list: [], loading: false, error: null, selectedSource: null, selectedCitation: null, detailLoading: false, conversationSelection: null,
  load: async () => {
    const id = currentConversationId()
    set({ loading: true, error: null })
    try {
      const list = await knowledgeApi.listSources(id)
      set({ list, loading: false })
      scheduleSourcePoll(list, get().load)
    } catch (error) {
      set({ loading: false, error: userFacingError(error, '暂时无法加载资料，请稍后重试。') })
      throw error
    }
  },
  open: async (sourceId) => {
    const cached = get().list.find((source) => source.id === sourceId) ?? null
    set({ selectedSource: cached, selectedCitation: null, detailLoading: !cached })
    try { set({ selectedSource: await knowledgeApi.getSource(currentConversationId(), sourceId) }) }
    finally { set({ detailLoading: false }) }
  },
  openCitation: async (citation) => {
    const cached = get().list.find((source) => source.id === citation.sourceId) ?? null
    set({ selectedSource: cached, selectedCitation: citation, detailLoading: !cached })
    try { set({ selectedSource: await knowledgeApi.getSource(currentConversationId(), citation.sourceId) }) }
    catch { /* the citation snapshot remains usable after source deletion */ }
    finally { set({ detailLoading: false }) }
  },
  close: () => set({ selectedSource: null, selectedCitation: null, detailLoading: false }),
  addText: async (title, text) => { await knowledgeApi.addTextSource(currentConversationId(), { title, text }); await get().load() },
  addUrl: async (url, title) => { await knowledgeApi.addUrlSource(currentConversationId(), { url, title }); await get().load() },
  retry: async (sourceId) => { await knowledgeApi.retrySource(currentConversationId(), sourceId); await get().load() },
  remove: async (sourceId) => {
    await knowledgeApi.deleteSource(currentConversationId(), sourceId)
    set({ selectedSource: null, selectedCitation: null, detailLoading: false })
    await get().load()
  },
  loadConversationSelection: async (conversationId) => {
    if (currentConversationId() !== conversationId) throw new Error('只能管理当前对话的资料')
    set({ conversationSelection: await knowledgeApi.getConversationSources(conversationId) })
  },
  setSourceEnabled: async (conversationId, sourceId, enabled) => {
    if (currentConversationId() !== conversationId) throw new Error('只能管理当前对话的资料')
    const selection = get().conversationSelection ?? await knowledgeApi.getConversationSources(conversationId)
    const excluded = selection.sources.filter((source) => source.sourceId !== sourceId && !source.enabled).map((source) => source.sourceId)
    if (!enabled) excluded.push(sourceId)
    await knowledgeApi.updateConversationSources(conversationId, excluded)
    await get().loadConversationSelection(conversationId)
  },
}))
