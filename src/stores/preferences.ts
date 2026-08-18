import { create } from 'zustand'
import { api, type ApiAutonomy } from '@/api/client'
import { useAuth } from '@/stores/auth'

interface PrefsState {
  prefs: Record<string, unknown>
  autonomy: Record<string, ApiAutonomy>
  loaded: boolean
  load: () => Promise<void>
  setPref: (key: string, value: unknown) => Promise<void>
  setAutonomy: (agentId: string, threshold: number) => Promise<void>
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: {},
  autonomy: {},
  loaded: false,
  async load() {
    try {
      const [prefs, auto] = await Promise.all([api.getPreferences(), api.getAllAutonomy()])
      const map: Record<string, ApiAutonomy> = {}
      for (const a of auto) map[a.agentId] = a
      set({ prefs, autonomy: map, loaded: true })
    } catch (err) {
      console.warn('[prefs] load failed', err)
    }
  },
  async setPref(key, value) {
    const next = { ...get().prefs, [key]: value }
    set({ prefs: next })
    try {
      await api.putPreferences(next)
    } catch (err) {
      console.warn('[prefs] save failed', err)
    }
  },
  async setAutonomy(agentId, threshold) {
    set((s) => ({
      autonomy: {
        ...s.autonomy,
        [agentId]: {
          ...(s.autonomy[agentId] ?? { userId: useAuth.getState().user?.id ?? '', agentId, pulled: 0, led: 0, dissolved: 0, threshold: 0.6 }),
          threshold,
        },
      },
    }))
    try {
      await api.putAutonomy(agentId, threshold)
    } catch (err) {
      console.warn('[prefs] autonomy save failed', err)
    }
  },
}))
