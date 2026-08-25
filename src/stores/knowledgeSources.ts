import { create } from 'zustand'
import { api } from '@/api/client'
import { useApp } from '@/stores/app'
import { useConversations } from '@/stores/conversations'
import type { ConversationSourceSelection, KnowledgeCitation, KnowledgeSource } from '@/types'

const mockTime = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const source = (value: Partial<KnowledgeSource> & Pick<KnowledgeSource, 'id' | 'kind' | 'title'>): KnowledgeSource => ({
  mimeType: value.kind === 'url' ? 'text/html' : 'text/plain', sizeBytes: 0, originalUrl: null,
  status: 'ready', stage: 'ready', error: null, isTruncated: false, createdBy: 'mock-me',
  createdAt: mockTime(180), updatedAt: mockTime(20), chunkCount: 0, extractedText: null, ...value,
})

const mockSourceCatalog: Record<string, KnowledgeSource[]> = {
  'mock-general': [
    source({ id: 'mock-source-brief', kind: 'file', title: 'NotebookLM 产品简报.pdf', mimeType: 'application/pdf', sizeBytes: 842_112, chunkCount: 18, originalFileUrl: 'data:text/plain;charset=utf-8,NotebookLM%20product%20brief', createdAt: mockTime(2880), extractedText: 'NotebookLM 将用户提供的来源作为回答依据，并通过行内引用帮助用户回到原始上下文。回答必须能定位到来源中的具体片段，来源不足时应清楚地区分通用知识。' }),
    source({ id: 'mock-source-interviews', kind: 'file', title: '用户访谈汇总.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 218_420, chunkCount: 12, createdAt: mockTime(1440), extractedText: '访谈对象希望先按项目选择知识空间，再进入多人对话。空白空间也必须可以直接使用，并且新加入的资料默认参与尚未显式排除它的会话。' }),
    source({ id: 'mock-source-notes', kind: 'text', title: '产品决策备忘录', sizeBytes: 6_842, chunkCount: 4, createdAt: mockTime(720), extractedText: '决策：保留 LingxiLoop 的多人 IM 与 Agent OS，将 Project 升级为资料、会话和工件的共享知识工作区。首版不做 OCR、音视频和跨工作区来源复用。' }),
    source({ id: 'mock-source-upload', kind: 'file', title: '待上传的定价数据.csv', mimeType: 'text/csv', sizeBytes: 1_248_902, status: 'upload_pending', stage: 'upload_pending', createdAt: mockTime(2) }),
    source({ id: 'mock-source-queued', kind: 'file', title: '市场扫描.json', mimeType: 'application/json', sizeBytes: 94_801, status: 'queued', stage: 'queued', createdAt: mockTime(4) }),
    source({ id: 'mock-source-parsing', kind: 'file', title: '技术白皮书.pdf', mimeType: 'application/pdf', sizeBytes: 4_842_112, status: 'processing', stage: 'parsing', createdAt: mockTime(7) }),
    source({ id: 'mock-source-chunking', kind: 'url', title: 'Open Notebook Architecture', originalUrl: 'https://github.com/lfnovo/open-notebook', status: 'processing', stage: 'chunking', createdAt: mockTime(12) }),
    source({ id: 'mock-source-indexing', kind: 'file', title: '功能对比矩阵.csv', mimeType: 'text/csv', sizeBytes: 184_902, status: 'processing', stage: 'indexing', chunkCount: 31, createdAt: mockTime(18) }),
    source({ id: 'mock-source-failed', kind: 'url', title: '受限内网页面', originalUrl: 'https://intranet.example.local/research', status: 'failed', stage: 'failed', error: 'URL 指向私有网络地址，已被 SSRF 安全策略阻止。', createdAt: mockTime(35) }),
  ],
  'mock-launch-room': [
    source({ id: 'mock-launch-brief', kind: 'file', title: '秋季发布简报.pdf', mimeType: 'application/pdf', sizeBytes: 1_202_004, chunkCount: 22, extractedText: '秋季版本聚焦知识工作区、可追溯回答和多人 Agent 协作。公开测试目标日期为 10 月 15 日。' }),
    source({ id: 'mock-launch-voice', kind: 'text', title: '客户之声摘录', sizeBytes: 18_204, chunkCount: 7, extractedText: '客户最看重快速找到依据、在原始资料中定位，以及不需要重新学习一套聊天工具。' }),
    source({ id: 'mock-launch-metrics', kind: 'file', title: '北极星指标.csv', mimeType: 'text/csv', sizeBytes: 42_118, chunkCount: 5, extractedText: '周活跃知识工作区、引用点击率、首次资料到首次有效回答耗时、通用知识回退率。' }),
    source({ id: 'mock-launch-web', kind: 'url', title: '发布候选版本说明', originalUrl: 'https://example.com/releases/fall', status: 'processing', stage: 'indexing', chunkCount: 9, createdAt: mockTime(6) }),
  ],
  'mock-general-lobby': [],
  'mock-empty': [],
}

const mockExcludedByConversation: Record<string, Set<string>> = {
  'mock-nova-dm': new Set(['mock-source-interviews']),
}

function mockSourcesFor(id: string): KnowledgeSource[] {
  return mockSourceCatalog[id] ?? (mockSourceCatalog[id] = [])
}

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
  list: [], loading: false, selectedSource: null, selectedCitation: null, conversationSelection: null,
  load: async () => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) {
      const list = [...mockSourcesFor(id)]
      set({ list, loading: false, selectedSource: null, selectedCitation: null, conversationSelection: null })
      scheduleSourcePoll(list, get().load)
      return
    }
    set({ loading: true })
    try {
      const list = await api.listSources(id)
      set({ list, loading: false })
      scheduleSourcePoll(list, get().load)
    } catch { set({ loading: false }) }
  },
  open: async (sourceId) => {
    const cached = get().list.find((source) => source.id === sourceId) ?? null
    set({ selectedSource: cached, selectedCitation: null })
    const id = groupConversationId()
    if (!id.startsWith('mock-')) set({ selectedSource: await api.getSource(id, sourceId) })
  },
  openCitation: async (citation) => {
    const cached = get().list.find((source) => source.id === citation.sourceId) ?? null
    set({ selectedSource: cached, selectedCitation: citation })
    const id = groupConversationId()
    if (!id.startsWith('mock-')) {
      try { set({ selectedSource: await api.getSource(id, citation.sourceId) }) }
      catch { /* keep the immutable citation snapshot when its source was deleted */ }
    }
  },
  close: () => set({ selectedSource: null, selectedCitation: null }),
  addText: async (title, text) => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) { mockSourcesFor(id).unshift(source({ id: `mock-source-${Date.now()}`, kind: 'text', title, sizeBytes: new Blob([text]).size, chunkCount: Math.max(1, Math.ceil(text.length / 1800)), extractedText: text, createdAt: new Date().toISOString() })); await get().load(); return }
    await api.addTextSource(id, { title, text }); await get().load()
  },
  addUrl: async (url, title) => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) { mockSourcesFor(id).unshift(source({ id: `mock-source-${Date.now()}`, kind: 'url', title: title || new URL(url).hostname, originalUrl: url, status: 'processing', stage: 'parsing', createdAt: new Date().toISOString() })); await get().load(); return }
    await api.addUrlSource(id, { url, title }); await get().load()
  },
  addFiles: async (files) => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) {
      for (const file of files) mockSourcesFor(id).unshift(source({ id: `mock-file-${Date.now()}-${file.name}`, kind: 'file', title: file.name, mimeType: file.type || 'text/plain', sizeBytes: file.size, status: 'queued', stage: 'queued', createdAt: new Date().toISOString() }))
      await get().load(); return
    }
    for (const file of files) await api.uploadKnowledgeFile(id, file)
    await get().load()
  },
  retry: async (sourceId) => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) { const item = mockSourcesFor(id).find((entry) => entry.id === sourceId); if (item) Object.assign(item, { status: 'ready', stage: 'ready', error: null, chunkCount: 6, extractedText: 'Mock 重试成功：该来源已完成解析与索引，可用于当前对话。', updatedAt: new Date().toISOString() }); await get().load(); return }
    await api.retrySource(id, sourceId); await get().load()
  },
  remove: async (sourceId) => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) { mockSourceCatalog[id] = mockSourcesFor(id).filter((source) => source.id !== sourceId); set({ selectedSource: null, selectedCitation: null }); await get().load(); return }
    await api.deleteSource(id, sourceId); set({ selectedSource: null, selectedCitation: null }); await get().load()
  },
  loadConversationSelection: async (conversationId) => {
    const id = groupConversationId()
    if (id !== conversationId) throw new Error('只能管理当前群聊的知识库')
    if (id.startsWith('mock-')) { const excluded = mockExcludedByConversation[conversationId] ?? new Set<string>(); set({ conversationSelection: { conversationId, sources: mockSourcesFor(id).map((item) => ({ sourceId: item.id, title: item.title, status: item.status, enabled: !excluded.has(item.id) })) } }); return }
    set({ conversationSelection: await api.getConversationSources(conversationId) })
  },
  setSourceEnabled: async (conversationId, sourceId, enabled) => {
    const id = groupConversationId()
    if (id.startsWith('mock-')) { const excluded = mockExcludedByConversation[conversationId] ?? (mockExcludedByConversation[conversationId] = new Set()); if (enabled) excluded.delete(sourceId); else excluded.add(sourceId); await get().loadConversationSelection(conversationId); return }
    const selection = get().conversationSelection ?? await api.getConversationSources(conversationId)
    const excluded = selection.sources.filter((source) => source.sourceId !== sourceId && !source.enabled).map((source) => source.sourceId)
    if (!enabled) excluded.push(sourceId)
    await api.updateConversationSources(conversationId, excluded)
    await get().loadConversationSelection(conversationId)
  },
}))
