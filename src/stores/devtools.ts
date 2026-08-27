import { observabilityApi } from '@/api/observability'
import { setDevModeEnabled } from '@/api/core/http'
import type { ApiDevtoolsCapabilities } from '@/api/contracts'
import { create } from 'zustand'
interface DevtoolsState extends ApiDevtoolsCapabilities {
  loaded: boolean
  load: () => Promise<void>
  setDevMode: (enabled: boolean) => Promise<void>
}

const DEFAULT_CAPS: ApiDevtoolsCapabilities = {
  enabled: false,
  canEnable: false,
  localDev: false,
  productionDevMode: false,
  role: 'member',
}

export const useDevtools = create<DevtoolsState>((set) => ({
  ...DEFAULT_CAPS,
  loaded: false,
  async load() {
    try {
      const caps = await observabilityApi.getDevtoolsCapabilities()
      set({ ...caps, loaded: true })
    } catch (err) {
      console.warn('[devtools] capability check failed', err)
      set({ ...DEFAULT_CAPS, loaded: true })
    }
  },
  async setDevMode(enabled) {
    setDevModeEnabled(enabled)
    const caps = await observabilityApi.getDevtoolsCapabilities()
    set({ ...caps, loaded: true })
  },
}))
