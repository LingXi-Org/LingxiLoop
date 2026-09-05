import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'
import { API, http } from '@/api/core/http'
import type { AuthMeResponse, DeleteAccountResponse } from './contracts'

export const authClient = createAuthClient({
  baseURL: location.origin,
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
})

export const authApi = {
  session: () => authClient.getSession(),
  signIn: (email: string, password: string, captchaToken: string) => authClient.signIn.email({
    email,
    password,
    fetchOptions: { headers: { 'x-captcha-response': captchaToken } },
  }),
  signUp: (input: { email: string; password: string; name: string; inviteToken?: string; inviteKind?: 'project' }, captchaToken: string) => (
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
  deleteAccount: () => http<DeleteAccountResponse>('/me/account', { method: 'DELETE' }),
  me: () => http<AuthMeResponse>('/session'),
}
