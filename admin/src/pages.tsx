import { CanAccess, useCustom, useLogout, useOne, useTable } from '@refinedev/core'
import { Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIcon, ArrowLeftIcon, ExternalLinkIcon, LogOutIcon, MenuIcon, RocketIcon, SearchIcon, ShieldIcon } from 'lucide-react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthScreen } from '@/components/AuthScreen'
import { confirmSensitiveAction, promptSensitiveAction } from '@/lib/confirmAction'
import { toastAction } from '@/lib/actionToast'
import { API_URL, adminFetch } from './api'
import { normalizeLingxiLitUrl } from './lingxilit-url'
import { ADMIN_RESOURCES, GROUP_LABELS, resourceDefinition, type ResourceGroup } from './resources'

type RecordValue = string | number | boolean | null | Record<string, unknown> | unknown[]
type AdminRecord = Record<string, RecordValue> & { id: string }
interface ChunkDescriptor extends Record<string, unknown> { truncated: true; length: number; contentUrl: string }

function display(value: RecordValue): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function titleFor(record: AdminRecord): string {
  return String(record.name ?? record.title ?? record.display_name ?? record.email ?? record.subject ?? record.id)
}

function isChunkDescriptor(value: RecordValue): value is ChunkDescriptor {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && value.truncated === true && typeof value.length === 'number' && typeof value.contentUrl === 'string')
}

export function AdminLayout() {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const navigate = useNavigate()
  const { mutate: logout, isPending } = useLogout()
  const health = useCustom<{ ok: boolean }>({ url: `${API_URL}/health/dependencies`, method: 'get' })
  const lingxiLitUrl = normalizeLingxiLitUrl(import.meta.env.VITE_LINGXILIT_URL)
  return <div className="admin-shell">
    <aside className={navigationOpen ? 'admin-sidebar admin-sidebar-open' : 'admin-sidebar'}>
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><ShieldIcon className="size-4" /></div>
        <div><p className="font-semibold">LingxiLoop</p><p className="text-xs text-muted-foreground">运营后台</p></div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-5" aria-label="后台资源">
        <Link to="/" className="admin-nav-item" onClick={() => setNavigationOpen(false)}><ActivityIcon className="size-4" />仪表盘</Link>
        <Link to="/releases" className="admin-nav-item" onClick={() => setNavigationOpen(false)}><RocketIcon className="size-4" />发布管理</Link>
        {lingxiLitUrl && <a href={lingxiLitUrl} className="admin-nav-item" target="_blank" rel="noopener noreferrer" onClick={() => setNavigationOpen(false)}><ExternalLinkIcon className="size-4" />AI 可观测（LingxiLit）</a>}
        {(Object.keys(GROUP_LABELS) as ResourceGroup[]).map((group) => <div key={group} className="mt-6 space-y-1">
          <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground">{GROUP_LABELS[group]}</p>
          {ADMIN_RESOURCES.filter((resource) => resource.group === group).map((resource) => <Link
            key={resource.name}
            to={`/resources/${resource.name}`}
            className="admin-nav-item"
            onClick={() => setNavigationOpen(false)}
          >{resource.label}</Link>)}
        </div>)}
      </nav>
    </aside>
    {navigationOpen && <button type="button" className="admin-scrim" aria-label="关闭导航" onClick={() => setNavigationOpen(false)} />}
    <div className="min-w-0 flex-1">
      <header className="admin-header">
        <Button variant="ghost" size="icon" className="admin-menu-button" onClick={() => setNavigationOpen(true)} aria-label="打开导航"><MenuIcon /></Button>
        <div className="min-w-0"><p className="font-semibold">平台运营</p><p className="truncate text-xs text-muted-foreground">跨租户资源与运行状态</p></div>
        <form className="admin-global-search" onSubmit={(event) => { event.preventDefault(); if (globalSearch.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(globalSearch.trim())}`) }}><SearchIcon /><Input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="全局搜索" aria-label="全局搜索" /></form>
        <span className={health.query.data?.data.ok ? 'admin-health admin-health-ok' : 'admin-health'}>{health.query.data?.data.ok ? '依赖正常' : '依赖异常'}</span>
        <Button variant="outline" className="ms-auto" disabled={isPending} onClick={() => void confirmSensitiveAction({ title: '退出管理后台？', description: '当前管理会话将结束。', confirmLabel: '退出' }).then((confirmed) => { if (confirmed) logout() })}><LogOutIcon />退出</Button>
      </header>
      <main className="admin-content"><Outlet /></main>
    </div>
  </div>
}

interface SearchResult { resource: string; id: string; label: string; summary: string | null }

export function SearchPage() {
  const [parameters] = useSearchParams()
  const query = parameters.get('q')?.trim() ?? ''
  const results = useCustom<{ data: SearchResult[] }>({
    url: `${API_URL}/control/platform/search?q=${encodeURIComponent(query)}`,
    method: 'get',
    queryOptions: { enabled: query.length >= 2 },
  })
  if (results.query.isLoading) return <ResourceSkeleton variant="list" count={6} label="正在全局搜索" />
  if (results.query.isError) return <ErrorPanel message="全局搜索失败" retry={() => void results.query.refetch()} />
  const data = results.query.data?.data.data ?? []
  return <div className="space-y-6"><PageHeading title={`搜索“${query}”`} description="用户、公司、项目与课程" />{data.length === 0
    ? <EmptyPanel message="没有匹配结果" />
    : <div className="space-y-3">{data.map((item) => <Link className="admin-search-result" key={`${item.resource}:${item.id}`} to={`/resources/${item.resource}/${encodeURIComponent(item.id)}`}><strong>{item.label}</strong><span>{resourceDefinition(item.resource)?.label} · {item.summary ?? item.id}</span></Link>)}</div>}</div>
}

interface DashboardData {
  counts: { users: number; companies: number; projects: number; activeRuns: number; failedJobs: number }
  dependencies: Record<string, boolean>
  recentAudit: Array<{ id: number; kind: string; user_id: string | null; created_at: string }>
}

export function DashboardPage() {
  const query = useCustom<DashboardData>({ url: `${API_URL}/control/platform/dashboard`, method: 'get' })
  if (query.query.isLoading && !query.query.data) return <ResourceSkeleton variant="cards" count={5} label="正在加载运营概览" />
  if (query.query.isError) return <ErrorPanel message="无法加载运营概览" retry={() => void query.query.refetch()} />
  const data = query.query.data?.data
  if (!data) return <EmptyPanel message="暂无运营数据" />
  const cards = [
    ['用户', data.counts.users], ['公司', data.counts.companies], ['项目', data.counts.projects],
    ['活跃运行', data.counts.activeRuns], ['失败任务', data.counts.failedJobs],
  ]
  return <div className="space-y-8">
    <PageHeading title="运营概览" description="关键规模、依赖健康与近期审计" />
    <section className="admin-card-grid">{cards.map(([label, value]) => <article key={label} className="admin-card"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p></article>)}</section>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="admin-panel"><h2 className="font-semibold">依赖健康</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(data.dependencies).map(([name, healthy]) => <div key={name} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3"><span>{name}</span><span className={healthy ? 'text-primary' : 'text-destructive'}>{healthy ? '正常' : '异常'}</span></div>)}</div></section>
      <section className="admin-panel"><h2 className="font-semibold">近期审计</h2><div className="mt-4 space-y-3">{data.recentAudit.map((event) => <div key={event.id} className="rounded-xl bg-muted px-4 py-3"><p className="font-medium">{event.kind}</p><p className="mt-1 text-xs text-muted-foreground">{event.user_id ?? '系统'} · {new Date(event.created_at).toLocaleString()}</p></div>)}</div></section>
    </div>
  </div>
}

export function ResourceListPage() {
  const { resource: resourceName } = useParams()
  const resource = resourceDefinition(resourceName)
  const [search, setSearch] = useState('')
  const list = useTable<AdminRecord>({
    resource: resourceName ?? '',
    filters: { permanent: search ? [{ field: 'search', operator: 'contains', value: search }] : [] },
    pagination: { pageSize: 50 },
  })
  const rows = list.result.data ?? []
  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows.slice(0, 10)) Object.keys(row).forEach((key) => { if (!['id'].includes(key)) keys.add(key) })
    return ['id', ...[...keys].slice(0, 5)]
  }, [rows])
  if (!resource) return <Navigate to="/" replace />
  return <div className="space-y-6">
    <PageHeading title={resource.label} description={`${GROUP_LABELS[resource.group]} · 全局资源目录`} />
    <div className="admin-toolbar"><div className="relative w-full max-w-md"><SearchIcon className="pointer-events-none absolute inset-inline-start-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-9" placeholder={`搜索${resource.label}`} aria-label={`搜索${resource.label}`} /></div><span className="text-sm text-muted-foreground">{list.result.total ?? rows.length} 条</span></div>
    {list.tableQuery.isLoading && rows.length === 0 ? <ResourceSkeleton variant="table" count={8} label={`正在加载${resource.label}`} />
      : list.tableQuery.isError ? <ErrorPanel message={`无法加载${resource.label}`} retry={() => void list.tableQuery.refetch()} />
        : rows.length === 0 ? <EmptyPanel message={`没有匹配的${resource.label}`} />
          : <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{resource.detail !== false && <th>操作</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}><span className="admin-cell-value">{display(row[column])}</span></td>)}{resource.detail !== false && <td><Button asChild variant="outline" size="sm"><Link to={`/resources/${resource.name}/${encodeURIComponent(String(row.id))}`}>查看</Link></Button></td>}</tr>)}</tbody></table></div>}
    {list.pageCount > 1 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={list.currentPage <= 1} onClick={() => list.setCurrentPage((page) => page - 1)}>上一页</Button><span className="text-sm text-muted-foreground">第 {list.currentPage} / {list.pageCount} 页</span><Button variant="outline" disabled={list.currentPage >= list.pageCount} onClick={() => list.setCurrentPage((page) => page + 1)}>下一页</Button></div>}
  </div>
}

interface Command { action: string; label: string; path: string; method: 'POST' | 'DELETE'; destructive?: boolean; reason?: boolean }

function commands(resource: string, record: AdminRecord): Command[] {
  if (resource === 'users') return record.suspended_at
    ? [{ action: 'restore', label: '恢复账号', path: `/control/platform/users/${record.id}/restore`, method: 'POST', reason: true }]
    : [{ action: 'suspend', label: '停用账号', path: `/control/platform/users/${record.id}/suspend`, method: 'POST', destructive: true, reason: true }]
  if (resource === 'companies') return [
    { action: 'activate', label: '激活', path: `/companies/${record.id}/activate`, method: 'POST', reason: true },
    { action: 'enter-read-only', label: '进入只读', path: `/companies/${record.id}/enter-read-only`, method: 'POST', destructive: true, reason: true },
    { action: 'archive', label: '归档', path: `/companies/${record.id}/archive`, method: 'POST', destructive: true, reason: true },
  ]
  if (resource === 'projects') return [
    { action: 'activate', label: '激活', path: `/projects/${record.id}/activate`, method: 'POST', reason: true },
    { action: 'end', label: '结束', path: `/projects/${record.id}/end`, method: 'POST', destructive: true, reason: true },
    { action: 'enter-read-only', label: '进入只读', path: `/projects/${record.id}/enter-read-only`, method: 'POST', destructive: true, reason: true },
    { action: 'archive', label: '归档', path: `/projects/${record.id}/archive`, method: 'POST', destructive: true, reason: true },
  ]
  if (resource === 'agent-routines' && record.status !== 'paused') return [{ action: 'pause', label: '暂停例程', path: `/im/routines/${record.id}/pause`, method: 'POST', destructive: true, reason: true }]
  return []
}

export function ResourceDetailPage() {
  const { resource: resourceName, id } = useParams()
  const resource = resourceDefinition(resourceName)
  const detail = useOne<AdminRecord>({ resource: resourceName ?? '', id: id ?? '' })
  const [pending, setPending] = useState(false)
  if (!resource) return <Navigate to="/" replace />
  if (detail.query.isLoading && !detail.result) return <ResourceSkeleton variant="detail" label={`正在加载${resource.label}详情`} />
  if (detail.query.isError || !detail.result) return <ErrorPanel message={`无法加载${resource.label}详情`} retry={() => void detail.query.refetch()} />
  const record = detail.result
  const availableCommands = commands(resource.name, record)
  const execute = async (command: Command) => {
    const reason = command.reason ? await promptSensitiveAction({
      title: command.label,
      description: `此操作会更改“${titleFor(record)}”的访问状态，并写入审计记录。`,
      confirmLabel: command.label,
      tone: command.destructive ? 'destructive' : 'warning',
      inputLabel: '操作原因',
      inputPlaceholder: '请输入 1–280 字原因',
      inputRequired: true,
    }) : await confirmSensitiveAction({
      title: command.label,
      description: `确认对“${titleFor(record)}”执行此操作？业务生命周期规则仍会在服务端复检。`,
      confirmLabel: command.label,
      tone: command.destructive ? 'destructive' : 'warning',
    }) ? '' : null
    if (reason === null) return
    setPending(true)
    try {
      await toastAction(adminFetch(command.path, {
        method: command.method,
        body: command.reason ? JSON.stringify({ reason }) : undefined,
        headers: {
          ...(record.company_id ? { 'x-company-id': String(record.company_id) } : {}),
          ...(record.project_id ? { 'x-project-id': String(record.project_id) } : {}),
          'x-platform-admin-reason': reason,
        },
      }), { loading: `正在${command.label}`, success: `${command.label}成功`, error: `${command.label}失败` })
      await detail.query.refetch()
    } finally { setPending(false) }
  }
  return <div className="space-y-6">
    <div><Button asChild variant="ghost" size="sm"><Link to={`/resources/${resource.name}`}><ArrowLeftIcon />返回{resource.label}</Link></Button></div>
    <PageHeading title={titleFor(record)} description={`${resource.label} · ${record.id}`} actions={availableCommands.map((command) => <CanAccess key={command.label} resource={resource.name} action={command.action}><Button variant={command.destructive ? 'destructive' : 'outline'} disabled={pending} onClick={() => void execute(command)}>{command.label}</Button></CanAccess>)} />
    <section className="admin-detail-grid">{Object.entries(record).map(([key, value]) => <article key={key} className="admin-detail-field"><h2>{key}</h2>{isChunkDescriptor(value) ? <ChunkedField descriptor={value} /> : <pre>{display(value)}</pre>}</article>)}</section>
    {resource.name === 'conversations' && <ConversationMessages conversationId={record.id} />}
  </div>
}

function ChunkedField({ descriptor }: { descriptor: ChunkDescriptor }) {
  const [content, setContent] = useState('')
  const [cursor, setCursor] = useState<string | null>('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const load = async (next: string) => {
    setPending(true)
    setError(false)
    try {
      const result = await adminFetch<{ data: string; nextCursor: string | null }>(
        `${descriptor.contentUrl}${next ? `?cursor=${encodeURIComponent(next)}` : ''}`,
      )
      setContent((current) => current + result.data)
      setCursor(result.nextCursor)
    } catch { setError(true) } finally { setPending(false) }
  }
  useEffect(() => { void load('') }, [descriptor.contentUrl])
  return <div className="space-y-3"><pre>{content}</pre>{pending && !content
    ? <ResourceSkeleton variant="list" compact count={3} label="正在加载正文" />
    : cursor !== null && <Button variant="outline" size="sm" disabled={pending} onClick={() => void load(cursor)}>加载下一块</Button>}{error && <p className="text-sm text-destructive">正文加载失败，请重试。</p>}<p className="text-xs text-muted-foreground">{content.length} / {descriptor.length} 字符</p></div>
}

function ConversationMessages({ conversationId }: { conversationId: string }) {
  const messages = useCustom<unknown[]>({ url: `${API_URL}/control/platform/conversations/${encodeURIComponent(conversationId)}/messages`, method: 'get' })
  return <section className="admin-panel"><h2 className="font-semibold">消息正文</h2>{messages.query.isLoading && !messages.query.data
    ? <ResourceSkeleton variant="list" count={5} className="mt-4" label="正在加载消息正文" />
    : messages.query.isError ? <div className="mt-4"><ErrorPanel message="无法加载消息正文" retry={() => void messages.query.refetch()} /></div>
      : <pre className="admin-json mt-4">{JSON.stringify(messages.query.data?.data ?? [], null, 2)}</pre>}</section>
}

function PageHeading({ title, description, actions = [] }: { title: string; description: string; actions?: React.ReactNode[] }) {
  return <div className="admin-page-heading"><div className="min-w-0"><h1>{title}</h1><p>{description}</p></div>{actions.length > 0 && <div className="admin-heading-actions">{actions}</div>}</div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="admin-state" role="alert"><p>{message}</p><Button variant="outline" onClick={retry}>重试</Button></div>
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="admin-state"><p>{message}</p></div>
}

export function LoginPage() {
  return <AuthScreen />
}

export function ReleaseManagementPage() {
  const releases = useCustom<{ data: AdminRecord[] }>({ url: `${API_URL}/control/releases`, method: 'get' })
  const deployments = useCustom<Record<string, unknown>>({ url: `${API_URL}/control/openship/deployments`, method: 'get' })
  const deploymentPayload = deployments.query.data?.data as { data?: unknown; deployments?: unknown } | AdminRecord[] | undefined
  const candidates = Array.isArray(deploymentPayload) ? deploymentPayload : deploymentPayload?.deployments ?? deploymentPayload?.data
  const rows = Array.isArray(candidates) ? candidates as AdminRecord[] : []
  const releaseRows = releases.query.data?.data.data ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const [stream, setStream] = useState<string[]>([])
  useEffect(() => {
    if (!selected) return
    const events = new EventSource(`${API_URL}/control/openship/deployments/${encodeURIComponent(selected)}/stream`)
    events.onmessage = (event) => setStream((current) => [...current.slice(-199), event.data])
    events.onerror = () => events.close()
    return () => events.close()
  }, [selected])
  const mutate = async (deploymentId: string, action: string) => {
    const reason = await promptSensitiveAction({ title: `${action} 部署？`, description: `部署 ${deploymentId}`, confirmLabel: action, cancelLabel: '取消', inputLabel: '操作原因', inputRequired: true, tone: action === 'rollback' || action === 'cancel' || action === 'reject' ? 'destructive' : undefined })
    if (!reason) return
    await toastAction(adminFetch(`/control/openship/deployments/${encodeURIComponent(deploymentId)}/${action}`, { method: 'POST', headers: { 'x-control-reason': reason }, body: JSON.stringify(action === 'redeploy' ? { useExistingCommit: true } : {}) }), { loading: '更新部署状态…', success: `${action} 已提交` })
    await Promise.all([deployments.query.refetch(), releases.query.refetch()])
  }
  return <div className="space-y-6"><PageHeading title="发布管理" description="经 CI 触发 OpenShip，查看部署、日志并处理失败决策。" actions={[<Button key="refresh" variant="outline" onClick={() => void deployments.query.refetch()}>刷新</Button>]} />
    <Card><CardHeader><CardTitle className="text-base">CI 发布请求</CardTitle><CardDescription>commit SHA 是幂等键，镜像始终按 digest 固定。</CardDescription></CardHeader><CardContent><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(releaseRows, null, 2)}</pre></CardContent></Card>
    <div className="grid gap-4 xl:grid-cols-2">{rows.map((deployment) => { const id = String(deployment.id ?? deployment.deployment_id); return <Card key={id}><CardHeader><CardTitle className="text-base">{id}</CardTitle><CardDescription>{display(deployment.status ?? null)} · {display(deployment.commit_sha ?? deployment.commit ?? null)}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(id)}>实时日志</Button>{['restart', 'redeploy', 'cancel', 'rollback', 'keep', 'reject'].map((action) => <Button key={action} size="sm" variant={action === 'cancel' || action === 'rollback' || action === 'reject' ? 'destructive' : 'outline'} onClick={() => void mutate(id, action)}>{action}</Button>)}</CardContent></Card> })}</div>
    {rows.length === 0 ? <EmptyPanel message="暂无 OpenShip 部署记录" /> : null}
    {selected ? <Card><CardHeader><CardTitle>实时日志 · {selected}</CardTitle></CardHeader><CardContent><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-xs">{stream.join('\n')}</pre></CardContent></Card> : null}
  </div>
}

export function ForbiddenPage() {
  return <main className="min-h-svh bg-muted flex items-center justify-center p-6"><Card className="w-full max-w-sm"><CardHeader><CardTitle>无平台权限</CardTitle><CardDescription>当前 D1 用户没有管理员角色。</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={() => location.assign('/login')}>返回登录</Button></CardContent></Card></main>
}
