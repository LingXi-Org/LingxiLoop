import { createAuthClient } from 'better-auth/react'
import { getGlobalBroadcastChannel } from 'better-auth/client'
import { emailOTPClient } from 'better-auth/client/plugins'
import { API, http } from '@/api/core/http'
import { clearPendingVerification, publicRegistrationError, RegistrationApiError, registrationFetch, registrationResponse } from './registration'
import type { AuthMeResponse } from './contracts'

export const authClient = createAuthClient({
  baseURL: location.origin,
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
})

export const authApi = {
  invitation: async (token: string, kind: 'project' | 'company') => {
    const response = await registrationFetch(`/api/registration/invitation?${new URLSearchParams({ token, kind })}`, { credentials: 'include' })
    return registrationResponse(response) as Promise<{ valid: boolean; email: string | null; companyName: string; role: string; isAdmin: boolean; courseName: string | null }>
  },
  acceptInvitation: async (inviteToken: string, inviteKind: 'project' | 'company') => {
    const response = await registrationFetch('/api/registration/accept', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inviteToken, inviteKind }) })
    await registrationResponse(response)
  },
  recoverRegistration: async () => {
    const response = await registrationFetch('/api/registration/recover', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })
    await registrationResponse(response)
  },
  session: () => authClient.getSession(),
  signIn: async (email: string, password: string, captchaToken: string, invitation?: { token: string; kind: 'project' | 'company' }) => {
    const result = await authClient.signIn.email({
      email,
      password,
      fetchOptions: { headers: { 'x-captcha-response': captchaToken } },
    })
    // Better Auth 1.7.2 broadcasts sign-out, but not sign-in. Wake peers using
    // its public session channel; each tab rechecks its own cookie with the server.
    if (!result.error) clearPendingVerification()
    if (!result.error) getGlobalBroadcastChannel().post({ event: 'session', data: { trigger: 'getSession' }, clientId: crypto.randomUUID() })
    if (!result.error && invitation) {
      try {
        await authApi.acceptInvitation(invitation.token, invitation.kind)
      } catch (error) {
        if (!(error instanceof RegistrationApiError) || error.code !== 'INVITATION_REJECTED') throw error
        // An old invitation must not block login to an existing, authorized workspace.
        const me = await authApi.me().catch(error => { throw publicRegistrationError(error) })
        if (!me.activeCompanyId || !me.companies.some((company) => company.id === me.activeCompanyId)) throw error
      }
    }
    return result
  },
  signUp: (input: { email: string; password: string; name: string; inviteToken?: string; inviteKind?: 'project' | 'company' }, captchaToken: string) => (
    registrationFetch(`${API}/auth/sign-up/email`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-captcha-response': captchaToken }, body: JSON.stringify(input) })
      .then(response => registrationResponse<{ ok: true; nextAction: 'verify_email' }>(response))
  ),
  signOut: () => { clearPendingVerification(); return authClient.signOut() },
  requestPasswordReset: (email: string, captchaToken: string) => authClient.requestPasswordReset({
    email,
    redirectTo: `${location.origin}/?mode=reset`,
    fetchOptions: { headers: { 'x-captcha-response': captchaToken } },
  }),
  resetPassword: (newPassword: string, token: string) => authClient.resetPassword({ newPassword, token }),
  sendVerification: (email: string) => authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }),
  verifyEmail: (email: string, otp: string) => authClient.emailOtp.verifyEmail({ email, otp }),
  me: (signal?: AbortSignal) => http<AuthMeResponse>('/session', { signal }),
  // AuthGate owns this check's failure; invitation and login reads keep the default.
  verifySession: (signal: AbortSignal) => http<AuthMeResponse>('/session', { signal }, { sessionRejection: 'caller' }),
}
