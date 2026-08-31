import { useEffect } from 'react'
import { create } from 'zustand'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { getActiveCompanyId } from '@/stores/auth'
import { presentationsApi } from './api'
import {
  isPresentationActive,
  type PresentationDetailV1,
  type PresentationVersionSummaryV1,
} from './contracts'

interface PresentationEntry {
  scopeKey: string
  presentation: PresentationDetailV1 | null
  versions: PresentationVersionSummaryV1[]
  loaded: boolean
  loading: boolean
  error: string | null
}

interface PresentationsState {
  entries: Record<string, PresentationEntry>
  load: (id: string, options?: { force?: boolean }) => Promise<void>
  approveOutline: (id: string, expectedRevision: number) => Promise<PresentationDetailV1>
  cancel: (id: string) => Promise<PresentationDetailV1>
  retry: (id: string) => Promise<PresentationDetailV1>
  reset: (id?: string) => void
}

const EMPTY_ENTRY: PresentationEntry = {
  scopeKey: '',
  presentation: null,
  versions: [],
  loaded: false,
  loading: false,
  error: null,
}

const requestEpochs = new Map<string, number>()

function activeScopeKey(): string {
  const workspace = getWorkspaceSession()
  return `${getActiveCompanyId() ?? ''}:${workspace?.projectId ?? ''}`
}

function nextRequestEpoch(id: string): number {
  const next = (requestEpochs.get(id) ?? 0) + 1
  requestEpochs.set(id, next)
  return next
}

function currentRequest(id: string, epoch: number, scope: string): boolean {
  return requestEpochs.get(id) === epoch && activeScopeKey() === scope
}

function updateEntry(
  entries: Record<string, PresentationEntry>,
  id: string,
  patch: Partial<PresentationEntry>,
): Record<string, PresentationEntry> {
  return { ...entries, [id]: { ...(entries[id] ?? EMPTY_ENTRY), ...patch } }
}

function presentationError(error: unknown): string {
  return userFacingError(error, '暂时无法加载这份演示，请稍后重试。')
}

export const usePresentations = create<PresentationsState>((set, get) => ({
  entries: {},

  async load(id, options) {
    if (!id) return
    const scope = activeScopeKey()
    const stored = get().entries[id]
    const current = stored?.scopeKey === scope ? stored : undefined
    if (current?.loading || (current?.loaded && !options?.force)) return
    const epoch = nextRequestEpoch(id)
    set((state) => ({
      entries: current
        ? updateEntry(state.entries, id, { loading: true, error: null })
        : { ...state.entries, [id]: { ...EMPTY_ENTRY, scopeKey: scope, loading: true } },
    }))
    try {
      const resource = await presentationsApi.getResource(id)
      if (!currentRequest(id, epoch, scope)) return
      set((state) => ({
        entries: updateEntry(state.entries, id, {
          presentation: resource.presentation,
          versions: resource.versions,
          scopeKey: scope,
          loaded: true,
          loading: false,
          error: null,
        }),
      }))
    } catch (error) {
      if (!currentRequest(id, epoch, scope)) return
      set((state) => ({
        entries: updateEntry(state.entries, id, {
          loaded: true,
          loading: false,
          error: presentationError(error),
        }),
      }))
    }
  },

  async approveOutline(id, expectedRevision) {
    const scope = activeScopeKey()
    const presentation = await presentationsApi.approveOutline(id, expectedRevision)
    if (activeScopeKey() === scope) {
      set((state) => ({
        entries: updateEntry(state.entries, id, {
          presentation,
          scopeKey: scope,
          loaded: true,
          error: null,
        }),
      }))
    }
    return presentation
  },

  async cancel(id) {
    const scope = activeScopeKey()
    const presentation = await presentationsApi.cancel(id)
    if (activeScopeKey() === scope) {
      set((state) => ({ entries: updateEntry(state.entries, id, { presentation, scopeKey: scope, loaded: true, error: null }) }))
    }
    return presentation
  },

  async retry(id) {
    const scope = activeScopeKey()
    const presentation = await presentationsApi.retry(id)
    if (activeScopeKey() === scope) {
      set((state) => ({ entries: updateEntry(state.entries, id, { presentation, scopeKey: scope, loaded: true, error: null }) }))
    }
    return presentation
  },

  reset(id) {
    if (id) {
      nextRequestEpoch(id)
      set((state) => {
        const entries = { ...state.entries }
        delete entries[id]
        return { entries }
      })
      return
    }
    for (const key of requestEpochs.keys()) nextRequestEpoch(key)
    set({ entries: {} })
  },
}))

export function usePresentationResource(
  id: string | null,
  options: { pollIntervalMs?: number; refreshOnMount?: boolean } = {},
) {
  const scopeKey = activeScopeKey()
  const storedEntry = usePresentations((state) => id ? state.entries[id] : undefined)
  const entry = storedEntry?.scopeKey === scopeKey ? storedEntry : undefined
  const load = usePresentations((state) => state.load)
  const pollIntervalMs = options.pollIntervalMs ?? 5_000
  const refreshOnMount = options.refreshOnMount ?? false

  useEffect(() => {
    if (id) void load(id, { force: refreshOnMount })
  }, [id, load, refreshOnMount, scopeKey])

  const status = entry?.presentation?.status
  useEffect(() => {
    if (!id || !status || !isPresentationActive(status)) return
    const timer = window.setInterval(() => void load(id, { force: true }), pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [id, load, pollIntervalMs, status])

  return {
    presentation: entry?.presentation ?? null,
    versions: entry?.versions ?? EMPTY_ENTRY.versions,
    loaded: entry?.loaded ?? false,
    loading: entry?.loading ?? false,
    error: entry?.error ?? null,
    refresh: () => id ? load(id, { force: true }) : Promise.resolve(),
  }
}
