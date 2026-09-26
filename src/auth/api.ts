import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'
import { API, http } from '@/api/core/http'
import type { AuthMeResponse } from './contracts'

export const authClient = createAuthClient({
  baseURL: location.origin,
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
})

export const authApi = {
  invitation: async (token: string, kind: 'project' | 'company') => {
    const response = await fetch(`/api/registration/invitation?${new URLSearchParams({ token, kind })}`, { credentials: 'include' })
    if (!response.ok) throw new Error('邀请无效、已过期或已撤销')
    return response.json() as Promise<{ valid: boolean; email: string | null; companyName: string; role: string; isAdmin: boolean; courseName: string | null }>
  },
  acceptInvitation: async (inviteToken: string, inviteKind: 'project' | 'company') => {
    const response = await fetch('/api/registration/accept', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inviteToken, inviteKind }) })
    if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? '接受邀请失败') }
  },
  session: () => authClient.getSession(),
  signIn: async (email: string, password: string, captchaToken: string, invitation?: { token: string; kind: 'project' | 'company' }) => {
    const result = await authClient.signIn.email({
      email,
      password,
      fetchOptions: { headers: { 'x-captcha-response': captchaToken } },
    })
    if (!result.error && invitation) {
      try {
        await authApi.acceptInvitation(invitation.token, invitation.kind)
      } catch (error) {
        if (!(error instanceof Error) || ![
          'invitation email mismatch', 'invitation not found',
          'invitation no longer active', 'invitation is no longer active',
        ].includes(error.message)) throw error
        // An old invitation must not block login to an existing, authorized workspace.
        const me = await authApi.me()
        if (!me.activeCompanyId || !me.companies.some((company) => company.id === me.activeCompanyId)) throw error
      }
    }
    return result
  },
  signUp: (input: { email: string; password: string; name: string; inviteToken?: string; inviteKind?: 'project' | 'company' }, captchaToken: string) => (
    fetch(`${API}/auth/sign-up/email`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-captcha-response': captchaToken }, body: JSON.stringify(input) })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { error?: string | { message?: string }; message?: string }
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : body.error?.message ?? body.message ?? '注册失败')
        return body
      })
  ),
  signOut: () => authClient.signOut(),
  requestPasswordReset: (email: string, captchaToken: string) => authClient.requestPasswordReset({
    email,
    redirectTo: `${location.origin}/?mode=reset`,
    fetchOptions: { headers: { 'x-captcha-response': captchaToken } },
  }),
  resetPassword: (newPassword: string, token: string) => authClient.resetPassword({ newPassword, token }),
  sendVerification: (email: string) => authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }),
  verifyEmail: (email: string, otp: string) => authClient.emailOtp.verifyEmail({ email, otp }),
  me: () => http<AuthMeResponse>('/session'),
}
