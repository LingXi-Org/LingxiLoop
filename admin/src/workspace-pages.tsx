import { useCustom } from '@refinedev/core'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { ArrowUpRightIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { API_URL, canReadResource, useManagementSession } from './api'
import { PageHeading } from './pages'
import { AdministratorInvitation } from './education-page'
import { CompanyProfileEdit, CompanyUsage } from './company-pages'
import { RecordAvatar, RecordValue } from './record-components'
import { accountStatus, fieldLabel, recordColumns, recordTitle, type AdminRecord } from './record-presentation'
import { resourceDefinition } from './resources'
import { AI, SYSTEM, WORKSPACES, listParameters, recordPath, relationFilter, relationGroups, resourceArea } from './workspace-model'

const Observability = lazy(() => import('./observability-page').then(m => ({ default: m.ObservabilityPage })))
const Status = lazy(() => import('./status-page').then(m => ({ default: m.ServiceStatusPage })))
const Authentication = lazy(() => import('./auth-settings-page').then(m => ({ default: m.AuthSettingsPage })))

export function LegacyResource() {
  const { resource, id } = useParams()
  const { search } = useLocation()
  return <Navigate replace to={resource && resourceDefinition(resource) ? `${recordPath(resource, id)}${search}` : '/'} />
}

export function WorkspacePage({ area }: { area: string }) {
  const companyMode = useManagementSession()?.mode === 'company'
  const [params, setParams] = useSearchParams()
  const workspace = WORKSPACES.find(item => item.path === area)
  if (!workspace) return <Navigate to="/" replace />
  if ('resource' in workspace) return <RecordList key={workspace.resource} resource={workspace.resource} />
  const choices = area === '/ai' ? (companyMode ? ['usage', ...AI.filter(canReadResource)] : ['overview', ...AI]) : ['status', 'authentication', ...SYSTEM]
  const tab = choices.includes(params.get('tab') ?? '') ? params.get('tab')! : choices[0]
  return <div className="space-y-8"><PageHeading title={workspace.label} description={workspace.description} />
    <nav className="admin-workspace-tabs" aria-label={`${workspace.label}分区`}>{choices.map(value => <Button key={value} variant={tab === value ? 'secondary' : 'ghost'} aria-current={tab === value ? 'page' : undefined} onClick={() => setParams({ tab: value })}>{({ usage: '公司用量', overview: '运行分析', status: '服务状态', authentication: '身份与安全' } as Record<string, string>)[value] ?? resourceDefinition(value)?.label}</Button>)}</nav>
    <Suspense fallback={<ResourceSkeleton variant="detail" />}>
      {tab === 'usage' ? <CompanyUsage /> : tab === 'overview' ? <Observability /> : tab === 'status' ? <Status /> : tab === 'authentication' ? <Authentication /> : <RecordList key={tab} resource={tab} embedded />}
    </Suspense>
  </div>
}

export function ResourceListPage() {
  const { resource } = useParams()
  return resource && resourceDefinition(resource) ? <RecordList key={resource} resource={resource} /> : <Navigate to="/" replace />
}

interface ListResult { data: AdminRecord[]; nextCursor: string | null; total?: number }
export function RecordList({ resource, scope = {}, embedded = false }: { resource: string; scope?: Record<string, string>; embedded?: boolean }) {
  const companyMode = useManagementSession()?.mode === 'company'
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [search, setSearch] = useState(params.get('search') ?? '')
  useEffect(() => setSearch(params.get('search') ?? ''), [params])
  const query = listParameters(params, scope)
  if (!query.has("limit")) query.set("limit", "20")
  if (!query.has("sort")) query.set("sort", "newest")
  if (['users', 'companies', 'projects'].includes(resource) && !query.has('status')) query.set('current', 'true')
  const result = useCustom<ListResult>({ url: `${API_URL}/control/platform/resources/${encodeURIComponent(resource)}?${query}`, method: 'get', queryOptions: { placeholderData: undefined } })
  const payload = result.query.data?.data
  const rows = (payload?.data ?? []).map(row => resource === 'users' ? { ...row, status: accountStatus(row) } : row)
  const columns = recordColumns([], resource)
  const definition = resourceDefinition(resource)!
  const change = (key: string, value: string) => setParams(current => {
    const next = new URLSearchParams(current)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'cursor') { next.delete('cursor'); next.delete('previous') }
    return next
  })
  const previous = (params.get('previous') ?? '').split(',').filter(Boolean)
  const nextPage = () => setParams(current => {
    const next = new URLSearchParams(current)
    next.set('previous', [...previous, current.get('cursor') ?? '-'].join(','))
    next.set('cursor', payload?.nextCursor ?? '')
    return next
  })
  const previousPage = () => setParams(current => {
    const next = new URLSearchParams(current), stack = [...previous], cursor = stack.pop()
    if (cursor && cursor !== '-') next.set('cursor', cursor); else next.delete('cursor')
    next.set('previous', stack.join(',')); return next
  })
  const statuses = resource === 'users' ? ['active', 'suspended', 'deleted'] : resource === 'agent-runs' ? ['queued', 'leased', 'waiting', 'succeeded', 'partial', 'blocked', 'failed', 'cancelled'] : resource === 'knowledge-jobs' ? ['queued', 'processing', 'completed', 'failed'] : resource === 'companies' ? ['TRIAL', 'ACTIVE', 'USER_DELETION_PENDING', 'GRACE_PERIOD', 'READ_ONLY', 'OFFBOARDED', 'RETENTION', 'ARCHIVED', 'DELETED'] : resource === 'projects' ? ['CREATED', 'DRAFT', 'ACTIVE', 'COURSE_ENDED', 'READ_ONLY', 'TRANSFER_PENDING', 'RETENTION', 'ARCHIVED', 'DELETED'] : resource === 'notification-deliveries' ? ['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] : []
  return <section className="space-y-6" aria-label={definition.label}>
    {!embedded && <PageHeading title={definition.label === '公司' ? '组织' : definition.label} description={WORKSPACES.find(item => item.path === resourceArea(resource))?.description ?? ''} actions={resource === 'companies' && !companyMode ? [<Button asChild key="create"><Link to="/organizations/new">创建教育公司</Link></Button>] : []} />}
    <Card><CardHeader className="gap-5"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{definition.label}记录</CardTitle><Button variant="outline" disabled={result.query.isFetching} onClick={() => void result.query.refetch()}>刷新</Button></div>
      <div className="admin-toolbar"><form className="flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); change('search', search.trim()) }}><Input aria-label={`搜索${definition.label}`} maxLength={200} placeholder="搜索名称、邮箱或编号" value={search} onChange={event => setSearch(event.target.value)} /><Button variant="outline" type="submit"><SearchIcon />搜索</Button></form>
      {statuses.length > 0 && <select className="admin-select" aria-label="状态筛选" value={params.get('status') ?? ''} onChange={event => change('status', event.target.value)}><option value="">全部状态</option>{statuses.map(status => <option key={status} value={status}>{statusLabels[status.toLowerCase()] ?? status}</option>)}</select>}
      <select className="admin-select" aria-label="排序" value={params.get('sort') ?? 'newest'} onChange={event => change('sort', event.target.value)}><option value="newest">最新优先</option>{!params.get("period") && <option value="oldest">最早优先</option>}</select></div>
      {params.get("period") && <p className="text-sm text-muted-foreground">过去 24 小时创建的运行</p>}
      {params.get('status') && <Button variant="ghost" className="w-fit" onClick={() => change('status', '')}>清除状态筛选：{statusLabels[params.get('status')!.toLowerCase()] ?? params.get('status')}</Button>}
    </CardHeader><CardContent>
      {result.query.isError ? <p role="alert" className="py-12 text-center">暂不可用，请重试。</p> : !payload ? <ResourceSkeleton variant="table" /> : !rows.length ? <p className="py-12 text-center text-muted-foreground">没有符合条件的记录</p> : <div className="admin-table-card"><table className="w-full text-sm"><thead><tr><th scope="col" className="p-4 text-start">{definition.label}</th>{columns.map(key => <th scope="col" key={key} className="p-4 text-start">{fieldLabel(key)}</th>)}{definition.detail !== false && <th scope="col" className="p-4 text-end">详情</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="min-w-48 p-4"><div className="flex items-center gap-3"><RecordAvatar record={row} /><span className="max-w-64 break-words font-medium">{recordTitle(row)}</span></div></td>{columns.map(key => <td key={key} className="min-w-28 max-w-64 p-4"><RecordValue value={row[key]} field={key} label={typeof row[`${key}_label`] === 'string' ? String(row[`${key}_label`]) : undefined} /></td>)}{definition.detail !== false && <td className="p-4 text-end"><Button asChild variant="ghost" size="sm"><Link state={{ returnTo: location.pathname + location.search }} to={recordPath(resource, row.id)} aria-label={`查看${recordTitle(row)}`}>查看<ArrowUpRightIcon /></Link></Button></td>}</tr>)}</tbody></table></div>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><label className="flex items-center gap-2 text-sm">每页<select className="admin-select" value={params.get('limit') ?? '20'} aria-label="每页记录数" onChange={event => change('limit', event.target.value)}>{[20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><span className="text-sm text-muted-foreground">{result.query.isError ? '记录数暂不可用' : !payload ? '正在加载' : payload.total == null ? `${rows.length} 条记录` : `共 ${payload.total} 条`}</span><div className="flex gap-3"><Button variant="outline" disabled={!previous.length || result.query.isFetching} onClick={previousPage}>上一页</Button><Button variant="outline" disabled={!payload?.nextCursor || result.query.isFetching} onClick={nextPage}>下一页</Button></div></div>
    </CardContent></Card>
  </section>
}

import { STATUS_LABELS as statusLabels } from './record-presentation'

export function DetailSections({ resource, record, renderField }: { resource: string; record: AdminRecord; renderField: (key: string, value: unknown) => ReactNode }) {
  const [params, setParams] = useSearchParams()
  const companyMode = useManagementSession()?.mode === 'company'
  const groups: Record<string, string[]> = Object.fromEntries(Object.entries(relationGroups(resource)).map(([label, names]) => [label, names.filter(canReadResource)] as const).filter(([, names]) => names.length))
  const tab = Object.hasOwn(groups, params.get('tab') ?? '') ? params.get('tab')! : '概览'
  const choices = groups[tab] ?? []
  const selected = choices.includes(params.get('related') ?? '') ? params.get('related')! : choices[0]
  const primary = ['users', 'companies', 'projects'].includes(resource)
  const summary = useCustom<{ metrics: Array<{ label: string; value: number; resource: string }> }>({ url: `${API_URL}/control/platform/resources/${resource}/${encodeURIComponent(record.id)}/summary`, method: 'get', queryOptions: { enabled: primary && tab === '概览', placeholderData: undefined } })
  const basics = [...new Set(['email', 'description', 'type', 'kind', 'company_id', 'project_id', 'user_id', 'created_at', 'updated_at', ...recordColumns([], resource)])].filter(key => record[key] != null && typeof record[key] !== 'object')
  const secondary = Object.entries(record).filter(([key]) => !basics.includes(key) && !['id', 'name', 'display_name', 'title', 'management_actions'].includes(key) && !key.endsWith('_label'))
  return <div className="space-y-6"><nav className="admin-workspace-tabs" aria-label="详情分区">{['概览', ...Object.keys(groups)].map(value => <Button key={value} variant={tab === value ? 'secondary' : 'ghost'} aria-current={tab === value ? 'page' : undefined} onClick={() => setParams({ tab: value })}>{value}</Button>)}</nav>
    {tab === '概览' ? <>
      {primary && (summary.query.isError ? <p role="alert">摘要暂不可用 <Button variant="outline" onClick={() => void summary.query.refetch()}>重试</Button></p> : !summary.query.data ? <ResourceSkeleton variant="detail" /> : <div className="admin-kpi-grid">{summary.query.data.data.metrics.map(metric => <Card key={metric.label}><CardContent className="py-6"><button type="button" className="block w-full rounded-lg text-start focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { const group = Object.keys(groups).find(key => groups[key].includes(metric.resource)); if (group) setParams({ tab: group, related: metric.resource }) }}><p className="text-sm text-muted-foreground">{metric.label} →</p><strong className="mt-3 block text-3xl tabular-nums">{metric.value.toLocaleString('zh-CN')}</strong></button></CardContent></Card>)}</div>)}
      <Card><CardHeader><CardTitle>基本信息</CardTitle></CardHeader><CardContent><dl className="admin-properties">{basics.map(key => <div key={key}><dt>{fieldLabel(key)}</dt><dd><RecordValue field={key} value={record[key]} label={typeof record[`${key}_label`] === 'string' ? String(record[`${key}_label`]) : undefined} /></dd></div>)}</dl></CardContent></Card>
      {secondary.length > 0 && <details className="rounded-xl border bg-card p-6"><summary className="cursor-pointer font-medium">正文与技术详情</summary><div className="mt-6 space-y-5">{secondary.map(([key, value]) => <DeferredField key={key} label={fieldLabel(key)} render={() => renderField(key, value)} />)}</div></details>}
      {resource === 'companies' && companyMode && <CompanyProfileEdit id={record.id} name={String(record.name ?? '')} description={String(record.description ?? '')} />}
      {resource === 'companies' && !companyMode && <Card><CardHeader><CardTitle>管理员邀请</CardTitle></CardHeader><CardContent><AdministratorInvitation companyId={record.id} /></CardContent></Card>}
    </> : <><nav className="flex flex-wrap gap-2" aria-label={`${tab}记录`}>{choices.map(value => <Button key={value} variant={selected === value ? 'secondary' : 'ghost'} aria-current={selected === value ? 'page' : undefined} onClick={() => setParams({ tab, related: value })}>{resourceDefinition(value)?.label}</Button>)}</nav><RecordList key={selected} resource={selected} scope={relationFilter(resource, record.id)} embedded /></>}
  </div>
}

function DeferredField({ label, render }: { label: string; render: () => ReactNode }) {
  const [open, setOpen] = useState(false)
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm">{label}</summary>{open && <div className="mt-3 overflow-auto">{render()}</div>}</details>
}
