import { http as rootHttp } from '@/api/core/http'
import type {
  AdminSettings,
  AdminStats,
  AdminUser,
  AdminUserDetail,
  AdminWaitlistEntry,
} from './contracts'

const http = <T>(path: string, init?: RequestInit) => rootHttp<T>(`/admin${path}`, init)

export const adminApi = {
  me: () => http<{ userId: string; isAdmin: true }>('/me'),
  stats: () => http<AdminStats>('/stats'),

  settings: () => http<AdminSettings>('/settings'),
  setSettings: (patch: Partial<AdminSettings>) =>
    http<AdminSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  listUsers: (params: { q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString()
    return http<{ items: AdminUser[]; total: number; limit: number; offset: number }>(
      suffix ? `/users?${suffix}` : '/users',
    )
  },
  getUser: (id: string) => http<AdminUserDetail>(`/users/${id}`),
  patchUser: (
    id: string,
    patch: { isAdmin?: boolean; suspended?: boolean; suspensionReason?: string | null },
  ) => http<AdminUser>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }),
  suspendUser: (id: string, reason: string | null) =>
    http<AdminUser>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ suspended: true, suspensionReason: reason }),
    }),
  unsuspendUser: (id: string) =>
    http<AdminUser>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ suspended: false }),
    }),

  listWaitlist: (params: {
    status?: 'pending' | 'approved' | 'rejected'
    q?: string
    limit?: number
    offset?: number
  } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.q) qs.set('q', params.q)
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString()
    return http<{ items: AdminWaitlistEntry[]; total: number; limit: number; offset: number }>(
      suffix ? `/waitlist?${suffix}` : '/waitlist',
    )
  },
  approveWaitlist: (id: string) =>
    http<{ userId: string; companyId: string | null }>(`/waitlist/${id}/approve`, {
      method: 'POST',
    }),
  rejectWaitlist: (id: string, note?: string) =>
    http<{ ok: true }>(`/waitlist/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
}
