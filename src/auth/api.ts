import { API, http } from '@/api/core/http'
import type { AuthMeResponse, AuthStartOptions } from './contracts'

export const authApi = {
  startUrl(options: AuthStartOptions = {}) {
    const params = new URLSearchParams()
    if (options.returnUrl) params.set('return', options.returnUrl)
    if (options.inviteToken) params.set('invite', options.inviteToken)
    if (options.inviteKind) params.set('inviteKind', options.inviteKind)
    const query = params.toString()
    return `${API}/auth/start/lingxi${query ? `?${query}` : ''}`
  },
  logout: () => http<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => http<AuthMeResponse>('/auth/me'),
}
