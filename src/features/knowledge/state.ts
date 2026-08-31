import { knowledgeApi } from './api'
import { create } from 'zustand'
import { useApp } from '@/stores/app'
import { useConversations } from '@/features/conversations/store'
import { userFacingError } from '@/lib/userFacingError'
import type { ConversationSourceSelection, KnowledgeCitation, KnowledgeSource } from './contracts'

let sourcePollTimer: number | null = null
function scheduleSourcePoll(sources: KnowledgeSource[], reload: () => Promise<void>): void {
  const pending = sources.some((item) => item.status === 'queued' || item.status === 'processing')
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
  conversationSelection: ConversationSourceSelection | null
  load: () => Promise<void>
  open: (sourceId: string) => Promise<void>
  openCitation: (citation: KnowledgeCitation) => Promise<void>
  close: () => void
  addText: (title: string, text: string) => Promise<void>
  addUrl: (url: string, title?: string) => Promise<void>
  addFiles: (files: File[]) => Promise<void>
  retry: (sourceId: string) => Promise<void>
  remove: (sourceId: string) => Promise<void>
  loadConversationSelection: (conversationId: string) => Promise<void>
  setSourceEnabled: (conversationId: string, sourceId: string, enabled: boolean) => Promise<void>
}

function groupConversationId(): string {
  const id = useApp.getState().selectedConversationId
  const conversation = useConversations.getState().list.find((item) => item.id === id)
  if (!id || conversation?.kind !== 'group') throw new Error('知识库仅适用于群聊')
  return id
}

export const useKnowledgeSources = create<SourceState>((set, get) => ({
  list: [], loading: false, error: null, selectedSource: null, selectedCitation: null, conversationSelection: null,
  load: async () => {
    const id = groupConversationId()
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
    set({ selectedSource: cached, selectedCitation: null })
    set({ selectedSource: await knowledgeApi.getSource(groupConversationId(), sourceId) })
  },
  openCitation: async (citation) => {
    const cached = get().list.find((source) => source.id === citation.sourceId) ?? null
    set({ selectedSource: cached, selectedCitation: citation })
    try { set({ selectedSource: await knowledgeApi.getSource(groupConversationId(), citation.sourceId) }) }
    catch { /* the citation snapshot remains usable after source deletion */ }
  },
  close: () => set({ selectedSource: null, selectedCitation: null }),
  addText: async (title, text) => { await knowledgeApi.addTextSource(groupConversationId(), { title, text }); await get().load() },
  addUrl: async (url, title) => { await knowledgeApi.addUrlSource(groupConversationId(), { url, title }); await get().load() },
  addFiles: async (files) => {
    const id = groupConversationId()
    for (const file of files) await knowledgeApi.uploadKnowledgeFile(id, file)
    await get().load()
  },
  retry: async (sourceId) => { await knowledgeApi.retrySource(groupConversationId(), sourceId); await get().load() },
  remove: async (sourceId) => {
    await knowledgeApi.deleteSource(groupConversationId(), sourceId)
    set({ selectedSource: null, selectedCitation: null })
    await get().load()
  },
  loadConversationSelection: async (conversationId) => {
    if (groupConversationId() !== conversationId) throw new Error('只能管理当前群聊的知识库')
    set({ conversationSelection: await knowledgeApi.getConversationSources(conversationId) })
  },
  setSourceEnabled: async (conversationId, sourceId, enabled) => {
    if (groupConversationId() !== conversationId) throw new Error('只能管理当前群聊的知识库')
    const selection = get().conversationSelection ?? await knowledgeApi.getConversationSources(conversationId)
    const excluded = selection.sources.filter((source) => source.sourceId !== sourceId && !source.enabled).map((source) => source.sourceId)
    if (!enabled) excluded.push(sourceId)
    await knowledgeApi.updateConversationSources(conversationId, excluded)
    await get().loadConversationSelection(conversationId)
  },
}))
