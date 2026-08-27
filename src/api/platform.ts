
import { API, http } from '@/api/core/http'
import type { ApiQuotaResponse, ApiSearchResults, MeResponse, } from './contracts'

export const platformApi = {
  health: () => http<{ ok: boolean; ts: number }>('/health'),
  me: () => http<{ id: string; name: string; kind: string }>('/me'),
  authStartUrl: (provider: 'lingxi', opts?: { inviteToken?: string | null; inviteKind?: 'company' | 'course' | null; returnUrl?: string | null }) => {
    const params = new URLSearchParams()
    if (opts?.returnUrl) params.set('return', opts.returnUrl)
    if (opts?.inviteToken) params.set('invite', opts.inviteToken)
    if (opts?.inviteKind) params.set('inviteKind', opts.inviteKind)
    const qs = params.toString()
    return `${API}/auth/start/${provider}${qs ? `?${qs}` : ''}`
  },
  authLogout: () =>
    http<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  deleteAccount: () =>
    http<{ ok: boolean }>('/me/account', { method: 'DELETE' }),
  authMe: () =>
    http<MeResponse>('/auth/me'),
  getQuota: () =>
    http<ApiQuotaResponse>('/me/quota'),
  search: (q: string, signal?: AbortSignal) =>
    http<ApiSearchResults>(`/search?q=${encodeURIComponent(q)}`, { signal })
}
