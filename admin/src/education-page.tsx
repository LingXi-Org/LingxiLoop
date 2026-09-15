import { Link } from 'react-router'
import { recordPath } from './workspace-model'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminFetch } from './api'

export function EducationPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ companyId: string; invitation: { url: string } | null } | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  return <section className="mx-auto max-w-xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">创建教育公司</h1>
    <p className="text-muted-foreground">运营创建公司及合同，首位教师管理员通过指定邮箱邀请开户。</p>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setBusy(true); setError('')
      void adminFetch<{ companyId: string; invitation: { url: string } | null }>('/control/platform/education-companies', {
        method: 'POST', body: JSON.stringify({ name: data.get('name'), slug: data.get('slug'), initialAdminEmail: data.get('email'), planId: 'plan-education', idempotencyKey,
          contract: { startsAt: new Date(String(data.get('startsAt'))).toISOString(), endsAt: new Date(String(data.get('endsAt'))).toISOString(), seatLimit: Number(data.get('seats')), config: {} } }),
      }).then(setResult).catch((reason) => setError(reason.message ?? '创建失败')).finally(() => setBusy(false))
    }}>
      <label className="block space-y-1">公司名称<Input name="name" required maxLength={100} /></label>
      <label className="block space-y-1">公司标识<Input name="slug" required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="example-school" /></label>
      <label className="block space-y-1">首位管理员邮箱<Input name="email" type="email" required /></label>
      <label className="block space-y-1">席位数<Input name="seats" type="number" min={1} defaultValue={100} required /></label>
      <label className="block space-y-1">合同开始<Input name="startsAt" type="date" defaultValue={new Date().toISOString().slice(0,10)} required /></label>
      <label className="block space-y-1">合同结束<Input name="endsAt" type="date" required /></label>
      <Button disabled={busy || Boolean(result)} type="submit">{busy ? '创建中…' : '创建公司并生成邀请'}</Button>
    </form>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {result && <div className="space-y-3" role="status"><p>公司已创建：<Link className="underline" to={recordPath("companies", result.companyId)}>查看组织详情</Link></p>
      {result.invitation ? <label className="block">管理员邀请链接<Input aria-label="管理员邀请链接" readOnly value={result.invitation.url} onFocus={(event) => event.target.select()} /></label> : <p>此请求已完成，可在下方重新签发管理员邀请。</p>}
      <Button onClick={() => { setResult(null); setIdempotencyKey(crypto.randomUUID()) }}>创建另一家公司</Button>
    </div>}

  </section>
}
export function AdministratorInvitation({ companyId }: { companyId: string }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  return <form className="space-y-3 border-t pt-5" onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('')
    void adminFetch<{ url: string }>(`/control/platform/companies/${encodeURIComponent(companyId)}/administrator-invitations`, { method: 'POST', body: JSON.stringify({ email: data.get('email') }) })
      .then((result) => setUrl(result.url)).catch((reason) => setError(reason.message ?? '邀请失败')).finally(() => setBusy(false))
  }}><h2 className="text-lg font-semibold">邀请替任管理员</h2>

    <label className="block">教师邮箱<Input name="email" type="email" required /></label>
    <Button disabled={busy}>生成单次邀请</Button>
    {url && <Input aria-label="替任管理员邀请链接" readOnly value={url} onFocus={(event) => event.target.select()} />}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </form>
}
