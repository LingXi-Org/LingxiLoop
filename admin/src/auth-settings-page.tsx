import { useCustom } from '@refinedev/core'
import { CheckCircle2Icon, KeyRoundIcon, MailCheckIcon, ShieldCheckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toastAction } from '@/lib/actionToast'
import { promptSensitiveAction } from '@/lib/confirmAction'
import { adminFetch, API_URL } from './api'
import { PageHeading } from './pages'

interface AuthSettings {
  sessionExpiresIn: number
  otpExpiresIn: number
  rateLimitWindow: number
  rateLimitMax: number
  locked: {
    defaultRole: string
    requireEmailVerification: boolean
    captchaProvider: string
    captchaEndpoints: string[]
  }
  secrets: { smtp: boolean; turnstile: boolean }
}

const EDITABLE_FIELDS = [
  { name: 'sessionExpiresIn', label: '会话有效期（秒）', min: 3600, max: 2592000, description: '1 小时至 30 天；新创建的会话使用该值。' },
  { name: 'otpExpiresIn', label: '邮箱验证码有效期（秒）', min: 60, max: 1800, description: '1 至 30 分钟；仅影响新发送的验证码。' },
  { name: 'rateLimitWindow', label: '限流窗口（秒）', min: 10, max: 3600, description: 'Better Auth 统计请求次数的时间窗口。' },
  { name: 'rateLimitMax', label: '窗口最大请求数', min: 5, max: 1000, description: '超出后由 Better Auth 拒绝请求。' },
] as const

export function AuthSettingsPage() {
  const settings = useCustom<AuthSettings>({ url: `${API_URL}/control/auth-settings`, method: 'get' })
  const [form, setForm] = useState<AuthSettings | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (settings.query.data?.data) setForm(settings.query.data.data)
  }, [settings.query.data?.data])

  if (settings.query.isLoading && !form) return <ResourceSkeleton variant="detail" label="正在加载身份认证配置" />
  if (settings.query.isError || !form) {
    return <Card><CardHeader><CardTitle>无法加载身份认证配置</CardTitle><CardDescription>请确认当前账号拥有平台管理员权限。</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void settings.query.refetch()}>重新加载</Button></CardContent></Card>
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const reason = await promptSensitiveAction({
      title: '保存身份认证配置？',
      description: '新配置将在下一次认证请求时生效，并写入控制面审计记录。',
      confirmLabel: '保存配置',
      tone: 'warning',
      inputLabel: '变更原因',
      inputPlaceholder: '请输入 1–280 字原因',
      inputRequired: true,
    })
    if (reason === null) return
    setPending(true)
    try {
      await toastAction(adminFetch('/control/auth-settings', {
        method: 'PUT',
        headers: { 'x-control-reason': reason },
        body: JSON.stringify({
          sessionExpiresIn: form.sessionExpiresIn,
          otpExpiresIn: form.otpExpiresIn,
          rateLimitWindow: form.rateLimitWindow,
          rateLimitMax: form.rateLimitMax,
        }),
      }), { loading: '正在保存身份认证配置…', success: '身份认证配置已更新', error: '保存身份认证配置失败' })
      await settings.query.refetch()
    } finally { setPending(false) }
  }

  return <div className="space-y-6">
    <PageHeading title="身份认证" description="管理 Better Auth 的运行参数并检查关键安全依赖。" />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatusCard icon={MailCheckIcon} label="邮件服务" ready={form.secrets.smtp} detail="阿里企业邮箱 SMTP" />
      <StatusCard icon={ShieldCheckIcon} label="人机验证" ready={form.secrets.turnstile} detail="Cloudflare Turnstile" />
      <StatusCard icon={KeyRoundIcon} label="邮箱验证" ready={form.locked.requireEmailVerification} detail="Email OTP" />
      <StatusCard icon={CheckCircle2Icon} label="默认角色" ready detail={form.locked.defaultRole} />
    </section>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
      <Card>
        <CardHeader><CardTitle>运行参数</CardTitle><CardDescription>数值经过服务端范围校验；保存后无需重新部署 Worker。</CardDescription></CardHeader>
        <CardContent><form onSubmit={(event) => void save(event)}><FieldGroup>
          {EDITABLE_FIELDS.map((field) => <Field key={field.name}>
            <FieldLabel htmlFor={`auth-${field.name}`}>{field.label}</FieldLabel>
            <Input id={`auth-${field.name}`} type="number" min={field.min} max={field.max} step={1} required value={form[field.name]} onChange={(event) => setForm({ ...form, [field.name]: Number(event.target.value) })} />
            <FieldDescription>{field.description}</FieldDescription>
          </Field>)}
          <Button type="submit" disabled={pending}>{pending ? '保存中…' : '保存配置'}</Button>
        </FieldGroup></form></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>安全锁定项</CardTitle><CardDescription>这些契约不可从控制面关闭，避免误操作削弱注册安全。</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <LockedRow label="注册默认角色" value={form.locked.defaultRole} />
          <LockedRow label="邮箱验证" value="必须完成" />
          <LockedRow label="验证码提供方" value={form.locked.captchaProvider} />
          <div><p className="font-medium">Turnstile 保护端点</p><div className="mt-2 flex flex-wrap gap-2">{form.locked.captchaEndpoints.map((endpoint) => <Badge key={endpoint} variant="secondary" className="font-mono">{endpoint}</Badge>)}</div></div>
          <p className="rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground">密钥继续通过 Wrangler Secret 管理；控制面只返回是否已配置，不读取或回显 Secret。</p>
        </CardContent>
      </Card>
    </div>
  </div>
}

function StatusCard({ icon: Icon, label, ready, detail }: { icon: React.ComponentType<{ className?: string }>; label: string; ready: boolean; detail: string }) {
  return <Card size="sm"><CardContent className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="grid size-9 place-items-center rounded-xl bg-muted"><Icon className="size-4" /></span><Badge variant={ready ? 'secondary' : 'destructive'}>{ready ? '已就绪' : '未配置'}</Badge></CardContent></Card>
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>
}
