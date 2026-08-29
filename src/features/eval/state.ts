import { create } from 'zustand'
import { registerAuthTeardown } from '@/stores/authTeardown'
import { evalApi } from './api'
import type { EvalDashboardPayload, EvalRunDetail } from './contracts'

interface EvalState {
  data: EvalDashboardPayload | null
  loading: boolean
  refreshing: boolean
  error: string | null
  sinceDays: number
  suiteFilter: string
  selectedId: string | null
  detail: EvalRunDetail | null
  detailError: string | null
  setSinceDays: (days: number) => void
  setSuiteFilter: (suite: string) => void
  loadDashboard: () => Promise<void>
  refreshDashboard: () => Promise<void>
  selectRun: (id: string | null) => Promise<void>
  reset: () => void
}

let dashboardRequest = 0
let detailRequest = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function requestDashboard(
  set: (patch: Partial<EvalState>) => void,
  get: () => EvalState,
  refreshing: boolean,
): Promise<void> {
  const request = ++dashboardRequest
  const { sinceDays, suiteFilter, data } = get()
  set({ loading: !data, refreshing, error: null })
  try {
    const next = await evalApi.dashboard({
      sinceDays,
      suiteKey: suiteFilter || undefined,
      limit: 120,
    })
    if (request === dashboardRequest) set({ data: next, loading: false, refreshing: false })
  } catch (error) {
    if (request === dashboardRequest) set({ error: errorMessage(error), loading: false, refreshing: false })
  }
}

export const useEvalState = create<EvalState>((set, get) => ({
  data: null,
  loading: true,
  refreshing: false,
  error: null,
  sinceDays: 90,
  suiteFilter: '',
  selectedId: null,
  detail: null,
  detailError: null,

  setSinceDays: (sinceDays) => set({ sinceDays }),
  setSuiteFilter: (suiteFilter) => set({ suiteFilter }),
  loadDashboard: () => requestDashboard(set, get, false),
  refreshDashboard: () => requestDashboard(set, get, true),

  async selectRun(selectedId) {
    const request = ++detailRequest
    if (!selectedId) {
      set({ selectedId: null, detail: null, detailError: null })
      return
    }
    set({ selectedId, detail: null, detailError: null })
    try {
      const detail = await evalApi.run(selectedId)
      if (request === detailRequest && get().selectedId === selectedId) set({ detail })
    } catch (error) {
      if (request === detailRequest && get().selectedId === selectedId) {
        set({ detailError: errorMessage(error) })
      }
    }
  },

  reset() {
    dashboardRequest += 1
    detailRequest += 1
    set({
      data: null,
      loading: true,
      refreshing: false,
      error: null,
      sinceDays: 90,
      suiteFilter: '',
      selectedId: null,
      detail: null,
      detailError: null,
    })
  },
}))

registerAuthTeardown(() => useEvalState.getState().reset())
