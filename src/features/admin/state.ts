import { create } from 'zustand'
import { registerAuthTeardown } from '@/stores/authTeardown'
import { adminApi } from './api'
import type { AdminStats } from './contracts'

type AdminVerification = 'checking' | 'admin' | 'denied'

interface AdminState {
  verification: AdminVerification
  verifiedUserId: string | null
  stats: AdminStats | null
  verify: (userId: string) => Promise<void>
  refreshStats: () => Promise<void>
  reset: () => void
}

let verificationRequest = 0
let statsRequest = 0

export const useAdminState = create<AdminState>((set) => ({
  verification: 'checking',
  verifiedUserId: null,
  stats: null,

  async verify(userId) {
    const request = ++verificationRequest
    set({ verification: 'checking', verifiedUserId: null, stats: null })
    try {
      const result = await adminApi.me()
      if (request === verificationRequest && result.userId === userId) {
        set({ verification: 'admin', verifiedUserId: userId })
      }
    } catch {
      if (request === verificationRequest) set({ verification: 'denied', verifiedUserId: userId })
    }
  },

  async refreshStats() {
    const request = ++statsRequest
    try {
      const stats = await adminApi.stats()
      if (request === statsRequest) set({ stats })
    } catch {
      // Stats are a non-authoritative projection; pages retain their explicit errors.
    }
  },

  reset() {
    verificationRequest += 1
    statsRequest += 1
    set({ verification: 'checking', verifiedUserId: null, stats: null })
  },
}))

registerAuthTeardown(() => useAdminState.getState().reset())
