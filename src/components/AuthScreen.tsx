import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi } from '@/auth/api'
import { ProductLogo } from '@/components/Avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WindowDragStrip } from './WindowDragStrip'

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify'

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    action: string
    theme: 'auto'
    size: 'flexible'
    callback: (token: string) => void
    'error-callback': () => void
    'expired-callback': () => void
  }) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
  || (import.meta.env.DEV ? '1x00000000000000000000AA' : '')

function TurnstileWidget({ onToken, onError }: { onToken: (token: string) => void; onError: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !TURNSTILE_SITE_KEY) return
    let widgetId: string | undefined
    let script = document.querySelector<HTMLScriptElement>('script[data-lingxiloop-turnstile]')
    const render = () => {
      if (!window.turnstile || widgetId || !container.isConnected) return
      widgetId = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'turnstile-spin-v1',
        theme: 'auto',
        size: 'flexible',
        callback: onToken,
        'error-callback': () => { onToken(''); onError() },
        'expired-callback': () => onToken(''),
      })
    }
    if (window.turnstile) render()
    else {
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        script.dataset.lingxiloopTurnstile = 'true'
        document.head.append(script)
      }
      script.addEventListener('load', render)
      script.addEventListener('error', onError)
    }
    return () => {
      script?.removeEventListener('load', render)
      script?.removeEventListener('error', onError)
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [onError, onToken])

  return <div ref={containerRef} className="min-h-16 w-full" />
}

function CaptchaField({ onToken, onError }: { onToken: (token: string) => void; onError: () => void }) {
  if (!TURNSTILE_SITE_KEY) {
    return <Alert variant="destructive"><AlertDescription>人机验证尚未配置，请联系管理员。</AlertDescription></Alert>
  }
  return <Field><TurnstileWidget onToken={onToken} onError={onError} /></Field>
}

export function AuthScreen() {
  const parameters = new URLSearchParams(location.search)
  const requestedMode = parameters.get('mode')
  const [mode, setMode] = useState<Mode>(requestedMode === 'reset' || requestedMode === 'signup' ? requestedMode : 'login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaRound, setCaptchaRound] = useState(0)
  const projectInviteToken = parameters.get('inviteKind') === 'project' ? parameters.get('invite') ?? undefined : undefined

  const changeMode = (next: Mode) => {
    if (next === 'forgot') setEmail('')
    setMode(next); setError(null); setCaptchaToken(''); setCaptchaRound((round) => round + 1)
  }
  const captchaError = useCallback(() => setError('人机验证失败，请重试。'), [])
  const run = async (work: () => Promise<unknown>, success?: () => void, resetCaptcha = false) => {
    setBusy(true); setError(null)
    try { await work(); success?.() } catch (reason) { setError(reason instanceof Error ? reason.message : '请求失败') } finally {
      setBusy(false)
      if (resetCaptcha) { setCaptchaToken(''); setCaptchaRound((round) => round + 1) }
    }
  }

  const copy = {
    login: ['欢迎回来', '登录后继续你的学习与协作。'],
    signup: ['创建普通用户账号', '注册后使用邮箱验证码激活账号。'],
    verify: ['验证邮箱', `输入发送至 ${email || '你的邮箱'} 的 6 位验证码。`],
    forgot: ['找回密码', '我们会向账号邮箱发送一次性重置链接。'],
    reset: ['设置新密码', '新密码至少需要 8 个字符。'],
  }[mode]

  return (
    <main className="flex min-h-svh items-center justify-center overflow-y-auto bg-muted p-4 sm:p-6 lg:p-10">
      <WindowDragStrip />
      <div className="w-full max-w-lg">
        <Card className="w-full self-center">
          <CardHeader>
            <div className="mb-4 flex items-center gap-3 font-heading font-medium">
              <ProductLogo size={36} rounded />
              <span>LingxiLoop</span>
            </div>
            <CardTitle className="text-xl">{copy[0]}</CardTitle>
            <CardDescription>{copy[1]}</CardDescription>
          </CardHeader>
          <CardContent>
            {mode === 'login' || mode === 'signup' ? (
              <Tabs value={mode} onValueChange={(value) => changeMode(value as Mode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">登录</TabsTrigger>
                  <TabsTrigger value="signup">注册</TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="pt-5">
                  <form onSubmit={(event) => {
                    event.preventDefault()
                    const data = new FormData(event.currentTarget)
                    void run(async () => {
                      const result = await authApi.signIn(String(data.get('email')), String(data.get('password')), captchaToken)
                      if (result.error) throw new Error(result.error.message)
                    }, () => location.assign(parameters.get('returnTo') ?? '/'), true)
                  }}>
                    <FieldGroup className="gap-5">
                      <Field><FieldLabel htmlFor="login-email">邮箱</FieldLabel><Input id="login-email" name="email" type="email" autoComplete="email" placeholder="m@example.com" required /></Field>
                      <Field>
                        <div className="flex items-center"><FieldLabel htmlFor="login-password">密码</FieldLabel><Button type="button" variant="link" size="sm" className="ms-auto" onClick={() => changeMode('forgot')}>忘记密码？</Button></div>
                        <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
                      </Field>
                      <CaptchaField key={`login-${captchaRound}`} onToken={setCaptchaToken} onError={captchaError} />
                      {error ? <FieldDescription role="alert" className="text-destructive">{error}</FieldDescription> : null}
                      <Button className="w-full" type="submit" disabled={busy || !captchaToken}>{busy ? <Spinner /> : null}{busy ? '登录中…' : '登录'}</Button>
                    </FieldGroup>
                  </form>
                </TabsContent>
                <TabsContent value="signup" className="pt-5">
                  <form onSubmit={(event) => {
                    event.preventDefault()
                    const data = new FormData(event.currentTarget)
                    const password = String(data.get('password'))
                    if (password !== String(data.get('confirmPassword'))) { setError('两次输入的密码不一致。'); return }
                    const signupEmail = String(data.get('email'))
                    void run(() => authApi.signUp({
                      name: String(data.get('name')),
                      email: signupEmail,
                      password,
                      inviteToken: projectInviteToken,
                      inviteKind: projectInviteToken ? 'project' : undefined,
                    }, captchaToken), () => { setEmail(signupEmail); changeMode('verify') }, true)
                  }}>
                    <FieldGroup className="gap-5">
                      {projectInviteToken ? <Alert><AlertTitle>课程邀请已关联</AlertTitle><AlertDescription>邮箱验证后会自动加入受邀课程。</AlertDescription></Alert> : null}
                      <Field><FieldLabel htmlFor="signup-name">姓名</FieldLabel><Input id="signup-name" name="name" autoComplete="name" required /></Field>
                      <Field><FieldLabel htmlFor="signup-email">邮箱</FieldLabel><Input id="signup-email" name="email" type="email" autoComplete="email" placeholder="m@example.com" required /></Field>
                      <Field><FieldLabel htmlFor="signup-password">密码</FieldLabel><Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><FieldDescription>至少 8 个字符。</FieldDescription></Field>
                      <Field><FieldLabel htmlFor="confirm-password">确认密码</FieldLabel><Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></Field>
                      <CaptchaField key={`signup-${captchaRound}`} onToken={setCaptchaToken} onError={captchaError} />
                      {error ? <FieldDescription role="alert" className="text-destructive">{error}</FieldDescription> : null}
                      <Button className="w-full" type="submit" disabled={busy || !captchaToken}>{busy ? <Spinner /> : null}{busy ? '创建中…' : '创建账号'}</Button>
                    </FieldGroup>
                  </form>
                </TabsContent>
              </Tabs>
            ) : null}

            {mode === 'verify' ? (
              <form onSubmit={(event) => {
                event.preventDefault()
                const otp = String(new FormData(event.currentTarget).get('otp'))
                void run(async () => {
                  const result = await authApi.verifyEmail(email, otp)
                  if (result.error) throw new Error(result.error.message)
                }, () => changeMode('login'))
              }}>
                <FieldGroup className="gap-5">
                  <Alert><AlertTitle>验证码已发送</AlertTitle><AlertDescription>验证码将在短时间内失效，请检查收件箱。</AlertDescription></Alert>
                  <Field><FieldLabel htmlFor="verification-code">邮箱验证码</FieldLabel><Input id="verification-code" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /></Field>
                  {error ? <FieldDescription role="alert" className="text-destructive">{error}</FieldDescription> : null}
                  <Button className="w-full" type="submit" disabled={busy}>{busy ? <Spinner /> : null}验证邮箱</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => {
                    const result = await authApi.sendVerification(email)
                    if (result.error) throw new Error(result.error.message)
                  })}>重新发送验证码</Button>
                  <Button type="button" variant="ghost" onClick={() => changeMode('login')}>返回登录</Button>
                </FieldGroup>
              </form>
            ) : null}

            {mode === 'forgot' ? (
              <form onSubmit={(event) => {
                event.preventDefault()
                const value = String(new FormData(event.currentTarget).get('email'))
                void run(async () => {
                  const result = await authApi.requestPasswordReset(value, captchaToken)
                  if (result.error) throw new Error(result.error.message)
                }, () => setEmail(value), true)
              }}>
                <FieldGroup className="gap-5">
                  <Field><FieldLabel htmlFor="forgot-email">邮箱</FieldLabel><Input id="forgot-email" name="email" type="email" autoComplete="email" required /></Field>
                  <CaptchaField key={`forgot-${captchaRound}`} onToken={setCaptchaToken} onError={captchaError} />
                  {email ? <Alert><AlertDescription>若账号存在，重置邮件已发送。</AlertDescription></Alert> : null}
                  {error ? <FieldDescription role="alert" className="text-destructive">{error}</FieldDescription> : null}
                  <Button className="w-full" type="submit" disabled={busy || !captchaToken}>{busy ? <Spinner /> : null}发送重置邮件</Button>
                  <Button type="button" variant="ghost" onClick={() => changeMode('login')}>返回登录</Button>
                </FieldGroup>
              </form>
            ) : null}

            {mode === 'reset' ? (
              <form onSubmit={(event) => {
                event.preventDefault()
                const password = String(new FormData(event.currentTarget).get('password'))
                void run(async () => {
                  const result = await authApi.resetPassword(password, parameters.get('token') ?? '')
                  if (result.error) throw new Error(result.error.message)
                }, () => changeMode('login'))
              }}>
                <FieldGroup className="gap-5">
                  <Field><FieldLabel htmlFor="reset-password">新密码</FieldLabel><Input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
                  {error ? <FieldDescription role="alert" className="text-destructive">{error}</FieldDescription> : null}
                  <Button className="w-full" type="submit" disabled={busy}>{busy ? <Spinner /> : null}保存新密码</Button>
                </FieldGroup>
              </form>
            ) : null}
          </CardContent>
        </Card>

      </div>
    </main>
  )
}
