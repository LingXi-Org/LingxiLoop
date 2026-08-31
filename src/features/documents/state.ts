import { documentsApi } from './api'
import type { DocumentRecord } from './contracts'
import { create } from 'zustand'
import { ws } from '@/api/core/realtime'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId } from '@/stores/auth'

interface DocumentsState {
  list: DocumentRecord[]
  loaded: boolean
  selectedId: string | null
  select: (id: string | null) => void
  load: () => Promise<void>
  reload: () => Promise<void>
  /** Wipe local state — used when switching company/workspace so the
   *  next view doesn't briefly render the previous tenant's documents
   *  before the API call lands. */
  reset: () => void
  create: (input?: { title?: string; conversationId?: string | null }) => Promise<DocumentRecord>
  rename: (id: string, title: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

let documentsRequestEpoch = 0

function activeScopeKey(): string {
  const workspace = getWorkspaceSession()
  return `${getActiveCompanyId() ?? ''}:${workspace?.projectId ?? ''}`
}

export const useDocuments = create<DocumentsState>((set, get) => ({
  list: [],
  loaded: false,
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  load: async () => {
    if (get().loaded) return
    const epoch = ++documentsRequestEpoch
    const scope = activeScopeKey()
    const { documents } = await documentsApi.listDocuments()
    if (epoch !== documentsRequestEpoch || scope !== activeScopeKey()) return
    set({ list: documents, loaded: true })
  },
  reload: async () => {
    const epoch = ++documentsRequestEpoch
    const scope = activeScopeKey()
    const { documents } = await documentsApi.listDocuments()
    if (epoch !== documentsRequestEpoch || scope !== activeScopeKey()) return
    set((s) => ({
      list: documents,
      loaded: true,
      selectedId: s.selectedId && documents.some((d) => d.id === s.selectedId) ? s.selectedId : null,
    }))
  },
  reset: () => {
    documentsRequestEpoch += 1
    set({ list: [], loaded: false, selectedId: null })
  },
  create: async (input) => {
    const scope = activeScopeKey()
    const doc = await documentsApi.createDocument(input ?? {})
    if (scope !== activeScopeKey()) return doc
    set((s) => ({ list: [doc, ...s.list.filter((d) => d.id !== doc.id)], selectedId: doc.id }))
    return doc
  },
  rename: async (id, title) => {
    const scope = activeScopeKey()
    await documentsApi.renameDocument(id, title)
    if (scope !== activeScopeKey()) return
    set((s) => ({
      list: s.list.map((d) => d.id === id ? { ...d, title, updatedAt: new Date().toISOString() } : d),
    }))
  },
  remove: async (id) => {
    const scope = activeScopeKey()
    await documentsApi.deleteDocument(id)
    if (scope !== activeScopeKey()) return
    set((s) => ({
      list: s.list.filter((d) => d.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },
}))

ws.on((ev) => {
  if (ev.type !== 'doc.changed') return
  const state = useDocuments.getState()
  if (!state.loaded) return
  void state.reload()
})
