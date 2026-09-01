import { createAuthClient } from 'better-auth/react'
import { API, http } from '@/api/core/http'
import type { AuthMeResponse, DeleteAccountResponse } from './contracts'

export const authClient = createAuthClient({ baseURL: location.origin, basePath: '/api/auth' })

export const authApi = {
  session: () => authClient.getSession(),
  signIn: (email: string, password: string) => authClient.signIn.email({ email, password }),
  signUp: (input: { email: string; password: string; name: string; inviteToken: string; inviteKind: 'company' | 'project' }) => (
    fetch(`${API}/auth/sign-up/email`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(body.error ?? '注册失败')
        return body
      })
  ),
  signOut: () => authClient.signOut(),
  requestPasswordReset: (email: string) => authClient.requestPasswordReset({ email, redirectTo: `${location.origin}/?mode=reset` }),
  resetPassword: (newPassword: string, token: string) => authClient.resetPassword({ newPassword, token }),
  sendVerification: (email: string) => authClient.sendVerificationEmail({ email, callbackURL: location.origin }),
  deleteAccount: () => http<DeleteAccountResponse>('/me/account', { method: 'DELETE' }),
  me: () => http<AuthMeResponse>('/session'),
}
