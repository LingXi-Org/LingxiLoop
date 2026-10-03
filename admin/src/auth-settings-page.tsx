import { useCustom } from '@refinedev/core'
import { CheckCircle2Icon, KeyRoundIcon, LockKeyholeIcon, MailCheckIcon, SaveIcon, ShieldCheckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AdminTabSkeleton } from './loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toastAction } from '@/lib/actionToast'
import { promptSensitiveAction } from '@/lib/confirmAction'
import { adminFetch, API_URL } from './api'
import { ErrorPanel, PageHeading } from './pages'

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
  const settings = useCustom<AuthSettings>({ url: `${API_URL}/control/auth-settings`, method: 'get', queryOptions: { refetchOnWindowFocus: false } })
  const [form, setForm] = useState<AuthSettings | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (settings.query.data?.data) setForm(settings.query.data.data)
  }, [settings.query.data?.data])

  if (settings.query.isLoading && !form) return <AdminTabSkeleton tab="authentication" />
  if (!form) {
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

  return <div className="ui-enter space-y-6">
    {settings.query.isError && <ErrorPanel message="身份配置刷新失败，已保留当前表单。" retry={() => void settings.query.refetch()} />}
    <PageHeading title="身份与安全" description="管理登录体验、会话有效期与访问保护策略。" />
    <div className="admin-overview-tabs"><a href="#auth-parameters">会话与验证</a><a href="#auth-security">安全策略</a></div>
    <section className="admin-kpi-grid" aria-label="身份认证状态">
      <StatusCard icon={MailCheckIcon} label="邮件服务" ready={form.secrets.smtp} detail="阿里企业邮箱 SMTP" />
      <StatusCard icon={ShieldCheckIcon} label="人机验证" ready={form.secrets.turnstile} detail="Cloudflare Turnstile" />
      <StatusCard icon={KeyRoundIcon} label="邮箱验证" ready={form.locked.requireEmailVerification} detail="Email OTP" />
      <StatusCard icon={CheckCircle2Icon} label="默认角色" ready detail={form.locked.defaultRole} />
    </section>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
      <Card id="auth-parameters">
        <CardHeader className="border-b"><CardTitle>会话与验证</CardTitle><CardDescription>设置用户登录后的有效期，以及认证请求的访问频率。</CardDescription></CardHeader>
        <CardContent><form onSubmit={(event) => void save(event)}><fieldset disabled={pending}><FieldGroup>
          {EDITABLE_FIELDS.map((field) => <Field key={field.name}>
            <FieldLabel htmlFor={`auth-${field.name}`}>{field.label}</FieldLabel>
            <Input className="max-w-sm" id={`auth-${field.name}`} type="number" min={field.min} max={field.max} step={1} required value={form[field.name]} onChange={(event) => setForm({ ...form, [field.name]: Number(event.target.value) })} />
            <FieldDescription>{field.description}</FieldDescription>
          </Field>)}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><p className="text-xs text-muted-foreground">变更将写入审计记录</p><Button type="submit" disabled={pending}><SaveIcon />{pending ? '保存中…' : '保存更改'}</Button></div>
        </FieldGroup></fieldset></form></CardContent>
      </Card>
      <Card id="auth-security">
        <CardHeader><span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyholeIcon className="size-5" /></span><CardTitle>始终开启的安全保护</CardTitle><CardDescription>平台统一保护策略，确保账号注册与登录安全。</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <LockedRow label="注册默认角色" value={form.locked.defaultRole} />
          <LockedRow label="邮箱验证" value="必须完成" />
          <LockedRow label="验证码提供方" value={form.locked.captchaProvider} />
          <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">查看人机验证保护范围</summary><div className="mt-3 flex flex-wrap gap-2">{form.locked.captchaEndpoints.map((endpoint) => <Badge key={endpoint} variant="secondary" className="max-w-full break-all whitespace-normal font-mono">{endpoint}</Badge>)}</div></details>
          <p className="rounded-xl bg-muted p-4 text-xs leading-6 text-muted-foreground">凭据由平台统一安全管理。此处展示配置状态，更新密钥请联系运维负责人。</p>
        </CardContent>
      </Card>
    </div>
  </div>
}

function StatusCard({ icon: Icon, label, ready, detail }: { icon: React.ComponentType<{ className?: string }>; label: string; ready: boolean; detail: string }) {
  return <Card className="admin-kpi"><CardContent><div className="mb-4 flex items-center justify-between gap-2"><span className="admin-kpi-icon" data-color={ready ? 'blue' : 'amber'}><Icon className="size-5" /></span><Badge variant="outline" className="admin-status-badge" data-tone={ready ? 'success' : 'warning'}>{ready ? '已就绪' : '未配置'}</Badge></div><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>
}
