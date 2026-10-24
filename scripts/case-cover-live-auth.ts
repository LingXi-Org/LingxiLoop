// Frontend fixture identity only. The API independently verifies its signed
// gateway assertion, active database user and real organization permissions.
import { create } from 'zustand'
export const useAuth = create<{ user: { id: string } | null; activeCompanyId: string | null; clear: () => void }>(set => ({
  user: null, activeCompanyId: null, clear: () => set({ user: null, activeCompanyId: null }),
}))
export const getActiveCompanyId = () => useAuth.getState().activeCompanyId
