import { useState } from 'react'
import { authApi } from '@/auth/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { LoginForm } from './login-form'
import { SignupForm } from './signup-form'
import { WindowDragStrip } from './WindowDragStrip'

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify'

export function AuthScreen() {
  const parameters = new URLSearchParams(location.search)
  const requestedMode = parameters.get('mode')
  const [mode, setMode] = useState<Mode>(requestedMode === 'reset' || requestedMode === 'signup' ? requestedMode : 'login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  const run = async (work: () => Promise<unknown>, success?: () => void) => {
    setBusy(true); setError(null)
    try { await work(); success?.() } catch (reason) { setError(reason instanceof Error ? reason.message : '请求失败') } finally { setBusy(false) }
  }

  return (
    <main className="min-h-svh bg-muted flex items-center justify-center p-6">
      <WindowDragStrip />
      <div className="w-full max-w-sm">
        {mode === 'login' ? <LoginForm busy={busy} error={error} onSignup={() => setMode('signup')} onForgot={() => setMode('forgot')} onSubmit={(loginEmail, password) => {
          void run(async () => {
            const result = await authApi.signIn(loginEmail, password)
            if (result.error) throw new Error(result.error.message)
          }, () => location.assign(parameters.get('returnTo') ?? '/'))
        }} /> : null}
        {mode === 'signup' ? <SignupForm busy={busy} error={error} defaultInviteToken={parameters.get('invite') ?? ''} defaultInviteKind={parameters.get('inviteKind') === 'project' ? 'project' : 'company'} onLogin={() => setMode('login')} onSubmit={(input) => {
          void run(() => authApi.signUp(input), () => { setEmail(input.email); setMode('verify') })
        }} /> : null}
        {mode === 'verify' ? (
          <Card>
            <CardHeader><CardTitle>验证邮箱</CardTitle><CardDescription>验证成功后会自动创建 Personal Context 并消费邀请。</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <Alert><AlertTitle>验证邮件已发送</AlertTitle><AlertDescription>请检查 {email} 的收件箱。</AlertDescription></Alert>
              <Button variant="outline" disabled={busy} onClick={() => void run(() => authApi.sendVerification(email))}>{busy ? <Spinner /> : null}重新发送</Button>
              <Button variant="ghost" onClick={() => setMode('login')}>返回登录</Button>
            </CardContent>
          </Card>
        ) : null}
        {mode === 'forgot' ? (
          <Card>
            <CardHeader><CardTitle>忘记密码</CardTitle><CardDescription>我们会发送一次性重置链接。</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('email')); void run(() => authApi.requestPasswordReset(value), () => setEmail(value)) }}>
                <FieldGroup><Field><FieldLabel htmlFor="forgot-email">邮箱</FieldLabel><Input id="forgot-email" name="email" type="email" required /></Field>
                  {email ? <Alert><AlertDescription>若账号存在，重置邮件已发送。</AlertDescription></Alert> : null}
                  {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                  <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}发送重置邮件</Button><Button type="button" variant="ghost" onClick={() => setMode('login')}>返回登录</Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        ) : null}
        {mode === 'reset' ? (
          <Card>
            <CardHeader><CardTitle>设置新密码</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={(event) => { event.preventDefault(); const password = String(new FormData(event.currentTarget).get('password')); void run(() => authApi.resetPassword(password, parameters.get('token') ?? ''), () => setMode('login')) }}>
                <FieldGroup><Field><FieldLabel htmlFor="reset-password">新密码</FieldLabel><Input id="reset-password" name="password" type="password" minLength={8} required /></Field>
                  {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                  <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}保存新密码</Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  )
}
