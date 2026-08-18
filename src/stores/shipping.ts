import { create } from 'zustand'
import {
  api,
  type ShippingFeatureDetail,
  type ShippingFeatureStatus,
  type ShippingOverview,
} from '@/api/client'

interface ShippingState {
  overview: ShippingOverview | null
  selectedId: string | null
  details: Record<string, ShippingFeatureDetail>
  loadingOverview: boolean
  loadingFeatureId: string | null
  saving: boolean
  error: string | null
  load: (force?: boolean) => Promise<void>
  select: (id: string | null) => Promise<void>
  refreshSelected: () => Promise<void>
  createFeature: (input: Parameters<typeof api.createShippingFeature>[0]) => Promise<void>
  updateFeature: (input: Parameters<typeof api.updateShippingFeature>[1]) => Promise<void>
  transition: (status: ShippingFeatureStatus) => Promise<void>
  mutateSelected: (operation: (id: string) => Promise<ShippingFeatureDetail>) => Promise<void>
  reset: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useShipping = create<ShippingState>((set, get) => ({
  overview: null,
  selectedId: null,
  details: {},
  loadingOverview: false,
  loadingFeatureId: null,
  saving: false,
  error: null,

  load: async (force = false) => {
    if (get().loadingOverview || (get().overview && !force)) return
    set({ loadingOverview: true, error: null })
    try {
      const overview = await api.getShippingOverview()
      const selectedId = get().selectedId && overview.features.some((f) => f.id === get().selectedId)
        ? get().selectedId
        : overview.features[0]?.id ?? null
      set({ overview, selectedId })
      if (selectedId && !get().details[selectedId]) void get().select(selectedId)
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingOverview: false })
    }
  },

  select: async (id) => {
    set({ selectedId: id, error: null })
    if (!id || get().details[id]) return
    set({ loadingFeatureId: id })
    try {
      const detail = await api.getShippingFeature(id)
      set((state) => ({ details: { ...state.details, [id]: detail } }))
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set((state) => ({ loadingFeatureId: state.loadingFeatureId === id ? null : state.loadingFeatureId }))
    }
  },

  refreshSelected: async () => {
    const id = get().selectedId
    if (!id) return
    set({ loadingFeatureId: id, error: null })
    try {
      const [detail, overview] = await Promise.all([api.getShippingFeature(id), api.getShippingOverview()])
      set((state) => ({ details: { ...state.details, [id]: detail }, overview }))
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingFeatureId: null })
    }
  },

  createFeature: async (input) => {
    set({ saving: true, error: null })
    try {
      const detail = await api.createShippingFeature(input)
      const overview = await api.getShippingOverview()
      set((state) => ({
        overview,
        selectedId: detail.id,
        details: { ...state.details, [detail.id]: detail },
      }))
    } catch (error) {
      set({ error: message(error) })
      throw error
    } finally {
      set({ saving: false })
    }
  },

  updateFeature: async (input) => {
    const id = get().selectedId
    if (!id) return
    await get().mutateSelected((featureId) => api.updateShippingFeature(featureId, input))
  },

  transition: async (status) => {
    await get().mutateSelected((id) => api.transitionShippingFeature(id, status))
  },

  mutateSelected: async (operation) => {
    const id = get().selectedId
    if (!id) return
    set({ saving: true, error: null })
    try {
      const detail = await operation(id)
      const overview = await api.getShippingOverview()
      set((state) => ({ details: { ...state.details, [id]: detail }, overview }))
    } catch (error) {
      set({ error: message(error) })
      throw error
    } finally {
      set({ saving: false })
    }
  },

  reset: () => set({
    overview: null,
    selectedId: null,
    details: {},
    loadingOverview: false,
    loadingFeatureId: null,
    saving: false,
    error: null,
  }),
}))
