import { create } from 'zustand'
import { adminApi } from './api'
import type { AdminStats } from './contracts'

type AdminVerification = 'checking' | 'admin' | 'denied'

interface AdminState {
  verification: AdminVerification
  stats: AdminStats | null
  verify: () => Promise<void>
  refreshStats: () => Promise<void>
  reset: () => void
}

let verificationRequest = 0
let statsRequest = 0

export const useAdminState = create<AdminState>((set) => ({
  verification: 'checking',
  stats: null,

  async verify() {
    const request = ++verificationRequest
    set({ verification: 'checking', stats: null })
    try {
      await adminApi.me()
      if (request === verificationRequest) set({ verification: 'admin' })
    } catch {
      if (request === verificationRequest) set({ verification: 'denied' })
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
    set({ verification: 'checking', stats: null })
  },
}))
