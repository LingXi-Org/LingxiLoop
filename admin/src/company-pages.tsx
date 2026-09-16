import { useCustom, useInvalidate } from '@refinedev/core'
import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import type { ApiCompanyMember } from '@/features/companies/contracts'
import { adminFetch, refreshManagementSession, useManagementSession } from './api'
import { recordPath } from './workspace-model'

export function CompanyDashboard() {
  const session = useManagementSession()
  const result = useCustom<{ companyName: string; metrics: Array<{ label: string; resource: string; value: number }> }>({ url: '/api/control/company/dashboard', method: 'get' })
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">{session?.companyName} · 本公司概览</h1>
    {result.query.isError ? <p role="alert">概览暂不可用 <Button onClick={() => void result.query.refetch()}>重试</Button></p> : !result.query.data ? <p aria-busy="true">正在加载…</p> : <div className="admin-kpi-grid">{result.query.data.data.metrics.map(metric => <Card key={metric.resource}><CardContent className="py-6"><Link to={recordPath(metric.resource)}><p>{metric.label}</p><strong className="text-3xl">{metric.value}</strong></Link></CardContent></Card>)}</div>}
    {session?.companyId && <Button asChild variant="outline"><Link to={recordPath('companies', session.companyId)}>查看公司资料</Link></Button>}
  </section>
}

export function CompanyUsage() {
  const result = useCustom<{ calls: number; inputTokens: number; outputTokens: number; costUsd: number }>({ url: '/api/control/company/usage', method: 'get' })
  const usage = result.query.data?.data
  return result.query.isError ? <p role="alert">用量暂不可用 <Button onClick={() => void result.query.refetch()}>重试</Button></p> : !usage ? <p aria-busy="true">正在加载…</p> : <div className="admin-kpi-grid">{[['调用次数', usage.calls], ['输入 Token', usage.inputTokens], ['输出 Token', usage.outputTokens], ['费用（USD）', usage.costUsd]].map(([label, value]) => <Card key={label}><CardContent className="py-6"><p>{label}</p><strong className="text-2xl">{Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}</strong></CardContent></Card>)}</div>
}

export function CompanyProfileEdit({ id, name, description }: { id: string; name: string; description: string }) {
  const session = useManagementSession(), invalidate = useInvalidate()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!session?.capabilities.updateCompany || session.companyId !== id) return null
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError('')
    void adminFetch(`/companies/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name: values.get('name'), description: values.get('description') }) })
      .then(async () => { await refreshManagementSession(); await invalidate({ invalidates: ['all'] }) })
      .catch((reason: { message?: string }) => setError(reason.message ?? '保存失败')).finally(() => setBusy(false))
  }}><h2 className="text-lg font-semibold">编辑公司资料</h2><label className="block">公司名称<Input name="name" defaultValue={name} maxLength={80} required /></label><label className="block">公司简介<Input name="description" defaultValue={description} maxLength={1000} /></label><Button disabled={busy}>保存资料</Button>{error && <p role="alert">{error}</p>}<Button asChild variant="outline"><Link to="/members">管理成员与邀请</Link></Button></form>
}

export function CompanyMembers() {
  const session = useManagementSession()
  const companyId = session?.companyId
  const result = useCustom<ApiCompanyMember[]>({ url: `/api/companies/${encodeURIComponent(companyId ?? '')}/members`, method: 'get', queryOptions: { enabled: !!companyId } })
  const invalidate = useInvalidate()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [invitation, setInvitation] = useState('')
  if (!companyId || session?.mode !== 'company') return <Navigate to="/" replace />
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await work(); await refreshManagementSession(); await invalidate({ invalidates: ['all'] }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : (reason as { message?: string }).message ?? '操作失败') }
    finally { setBusy(false) }
  }
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">公司成员</h1>
    {session.capabilities.invite && <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault(); const email = new FormData(event.currentTarget).get('email')
      void run(async () => { const invite = await adminFetch<{ url: string }>(`/companies/${encodeURIComponent(companyId)}/invitations`, { method: 'POST', body: JSON.stringify({ email, isAdmin: false, sendEmail: false }) }); setInvitation(invite.url) })
    }}><label className="space-y-2">教师邮箱<Input name="email" type="email" required /></label><Button disabled={busy}>邀请教师</Button></form>}
    {invitation && <label className="block">邀请链接<Input readOnly value={invitation} onFocus={event => event.target.select()} /></label>}
    {error && <p role="alert">{error}</p>}
    {result.query.isError ? <p role="alert">成员暂不可用 <Button onClick={() => void result.query.refetch()}>重试</Button></p> : !result.query.data ? <p aria-busy="true">正在加载…</p> : <ul className="space-y-3">{result.query.data.data.map(member => <li key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <div className="min-w-0 flex-1"><Link to={recordPath('users', member.id)} className="font-semibold underline">{member.name}</Link><p className="break-all text-sm">{member.email} · {member.role === 'teacher' ? '教师' : '学生'}{member.isAdmin ? ' · 管理员' : ''}</p></div>
      {member.role === 'teacher' && session.capabilities.updateMember && <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
        if (await confirmSensitiveAction({ title: member.isAdmin ? '撤销管理权限？' : '授予管理权限？', description: `此操作将立即更改 ${member.name} 的公司管理权限。最后一位管理员须先交接。`, confirmLabel: '确认' })) await adminFetch(`/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(member.id)}`, { method: 'PATCH', body: JSON.stringify({ isAdmin: !member.isAdmin }) })
      })}>{member.isAdmin ? '撤销管理权限' : '授予管理权限'}</Button>}
      {session.capabilities.removeMember && <Button variant="destructive" disabled={busy} onClick={() => void run(async () => {
        if (await confirmSensitiveAction({ title: `移除 ${member.name}？`, description: '账号将停用，所有访问权限立即撤销，公司历史记录保留。', confirmLabel: '移除成员', tone: 'destructive' })) await adminFetch(`/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' })
      })}>移除成员</Button>}
    </li>)}</ul>}
  </section>
}
