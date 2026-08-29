import { useState } from 'react'
import { GetDesktopAppLink } from '@/components/GetDesktopAppLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface CarriedSuspension { email: string | null; reason: string | null }
interface CarriedWaitlist { email: string | null }

export function consumeSuspendedFragment(): CarriedSuspension | null {
  const hash = location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  if (params.get('suspended') !== '1') return null
  const result = { email: params.get('email'), reason: params.get('reason') }
  history.replaceState(null, '', location.pathname + location.search)
  return result
}

export function consumeWaitlistFragment(): CarriedWaitlist | null {
  const search = new URLSearchParams(location.search)
  if (search.get('waitlist') !== '1') return null
  const email = search.get('email')
  search.delete('waitlist')
  search.delete('email')
  const query = search.toString()
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''))
  return { email }
}

function AuthStateSurface({ icon, title, description, children }: {
  icon: string
  title: string
  description: React.ReactNode
  children?: React.ReactNode
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) {
    location.reload()
    return null
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="text-4xl" aria-hidden>{icon}</span>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {children}
          <Button className="w-full" onClick={() => setDismissed(true)}>完成</Button>
        </CardContent>
      </Card>
    </main>
  )
}

export function SuspendedScreen({ email, reason }: { email: string | null; reason: string | null }) {
  return (
    <AuthStateSurface
      icon="🔒"
      title="您的帐户已被暂停"
      description={<>访问 <strong className="text-foreground">{email ?? '您的帐户'}</strong> 已被 LingxiLoop 管理员暂时禁用。</>}
    >
      {reason && (
        <section className="rounded-3xl border border-border bg-muted p-4" aria-label="管理员原因">
          <h2 className="text-xs font-medium text-muted-foreground">管理员原因</h2>
          <p className="mt-2 text-sm leading-relaxed">{reason}</p>
        </section>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">如果您认为这是一个错误，请联系您的工作区所有者。</p>
    </AuthStateSurface>
  )
}

export function WaitlistConfirmedScreen({ email }: { email: string | null }) {
  return (
    <AuthStateSurface
      icon="⏳"
      title="您已加入候补名单"
      description={<>我们保存了 <strong className="text-foreground">{email ?? '您的邮箱'}</strong>，帐户准备就绪时会通知您。</>}
    >
      <p className="text-center text-sm text-muted-foreground">想要提前准备？<GetDesktopAppLink variant="text" /></p>
    </AuthStateSurface>
  )
}
