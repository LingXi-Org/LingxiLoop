import { CanAccess, useCustom, useLogout, useOne, useTable } from '@refinedev/core'
import {
  ActivityIcon,
  ArrowLeftIcon,
  BotIcon,
  BoxesIcon,
  Building2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  ChartNoAxesCombinedIcon,
  DatabaseIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  LogOutIcon,
  RocketIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { AuthScreen } from '@/components/AuthScreen'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction, promptSensitiveAction } from '@/lib/confirmAction'
import { API_URL, adminFetch } from './api'
import { ADMIN_RESOURCES, GROUP_LABELS, type ResourceGroup, resourceDefinition } from './resources'

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
  const [globalSearch, setGlobalSearch] = useState('')
  const navigate = useNavigate()
  const { mutate: logout, isPending } = useLogout()
  const health = useCustom<{ ok: boolean }>({ url: `${API_URL}/health/dependencies`, method: 'get' })
  const dependencyOk = health.query.data?.data.ok
  return <SidebarProvider className="admin-shell" style={{ '--sidebar-width': '18rem' } as React.CSSProperties}>
    <Sidebar variant="inset">
      <SidebarHeader className="p-3">
        <Link to="/" className="flex min-w-0 items-center gap-3 rounded-2xl p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><ShieldIcon className="size-4" /></span>
          <span className="min-w-0"><strong className="block truncate font-heading text-sm font-semibold">LingxiLoop</strong><span className="block truncate text-xs text-sidebar-foreground/60">运营控制中心</span></span>
        </Link>
      </SidebarHeader>
      <AdminNavigation />
      <SidebarFooter className="p-3">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-sidebar-accent/70 px-3 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${health.query.isLoading ? 'bg-muted-foreground' : dependencyOk ? 'bg-primary' : 'bg-destructive'}`} /><span className="truncate">{health.query.isLoading ? '正在检查依赖' : dependencyOk ? '全部依赖正常' : '依赖存在异常'}</span></span>
          <Badge variant="outline" className="bg-sidebar">LIVE</Badge>
        </div>
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton disabled={isPending} onClick={() => void confirmSensitiveAction({ title: '退出管理后台？', description: '当前管理会话将结束。', confirmLabel: '退出' }).then((confirmed) => { if (confirmed) logout() })}><LogOutIcon /><span>退出管理后台</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className="h-svh min-w-0 overflow-hidden">
      <header className="admin-header">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <div className="admin-header-copy"><p>平台运营</p><span>跨租户资源与运行状态</span></div>
        <form className="admin-global-search" onSubmit={(event) => { event.preventDefault(); if (globalSearch.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(globalSearch.trim())}`) }}>
          <InputGroup><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="搜索用户、公司、项目或课程" aria-label="全局搜索" /></InputGroup>
        </form>
        <Badge variant="outline" className="admin-role-badge"><ShieldCheckIcon />平台管理员</Badge>
      </header>
      <div className="admin-content"><Outlet /></div>
    </SidebarInset>
  </SidebarProvider>
}

const GROUP_ICONS: Record<ResourceGroup, React.ComponentType<{ className?: string }>> = {
  identity: Building2Icon,
  learning: GraduationCapIcon,
  collaboration: BotIcon,
  operations: BoxesIcon,
}

function AdminNavigation() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const closeNavigation = () => setOpenMobile(false)
  return <SidebarContent className="px-2 pb-2">
    <SidebarGroup className="pt-0">
      <SidebarGroupLabel>工作台</SidebarGroupLabel>
      <SidebarGroupContent><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === '/'}><Link to="/" onClick={closeNavigation}><ActivityIcon /><span>运营概览</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith('/releases')}><Link to="/releases" onClick={closeNavigation}><RocketIcon /><span>发布管理</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith('/authentication')}><Link to="/authentication" onClick={closeNavigation}><KeyRoundIcon /><span>身份认证</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith('/status')}><Link to="/status" onClick={closeNavigation}><HeartPulseIcon /><span>服务状态</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith('/observability')}><Link to="/observability" onClick={closeNavigation}><ChartNoAxesCombinedIcon /><span>AI 可观测</span></Link></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent>
    </SidebarGroup>
    <SidebarGroup className="pt-0">
      <SidebarGroupLabel>资源目录</SidebarGroupLabel>
      <SidebarGroupContent><SidebarMenu>
        {(Object.keys(GROUP_LABELS) as ResourceGroup[]).map((group) => {
          const GroupIcon = GROUP_ICONS[group]
          const resources = ADMIN_RESOURCES.filter((resource) => resource.group === group)
          const active = resources.some((resource) => pathname.startsWith(`/resources/${resource.name}`))
          return <Collapsible key={group} asChild defaultOpen={active} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild><SidebarMenuButton isActive={active}><GroupIcon /><span>{GROUP_LABELS[group]}</span><ChevronRightIcon className="ms-auto transition-transform group-data-[state=open]/collapsible:rotate-90" /></SidebarMenuButton></CollapsibleTrigger>
              <CollapsibleContent><SidebarMenuSub>
                {resources.map((resource) => <SidebarMenuSubItem key={resource.name}><SidebarMenuSubButton asChild isActive={pathname.startsWith(`/resources/${resource.name}`)}><Link to={`/resources/${resource.name}`} onClick={closeNavigation}><span>{resource.label}</span></Link></SidebarMenuSubButton></SidebarMenuSubItem>)}
              </SidebarMenuSub></CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        })}
      </SidebarMenu></SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>
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
    : <ItemGroup>{data.map((item) => <Item asChild variant="outline" key={`${item.resource}:${item.id}`}><Link to={`/resources/${item.resource}/${encodeURIComponent(item.id)}`}><ItemMedia variant="icon" className="grid size-9 place-items-center rounded-xl bg-muted"><SearchIcon /></ItemMedia><ItemContent><ItemTitle>{item.label}<Badge variant="secondary">{resourceDefinition(item.resource)?.label}</Badge></ItemTitle><ItemDescription>{item.summary ?? item.id}</ItemDescription></ItemContent><ChevronRightIcon className="size-4 text-muted-foreground" /></Link></Item>)}</ItemGroup>}</div>
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
    <div className="admin-toolbar"><InputGroup className="max-w-md"><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`搜索${resource.label}`} aria-label={`搜索${resource.label}`} /></InputGroup><Badge variant="outline" className="h-7 px-3 tabular-nums">{list.result.total ?? rows.length} 条记录</Badge></div>
    {list.tableQuery.isLoading && rows.length === 0 ? <ResourceSkeleton variant="table" count={8} label={`正在加载${resource.label}`} />
      : list.tableQuery.isError ? <ErrorPanel message={`无法加载${resource.label}`} retry={() => void list.tableQuery.refetch()} />
        : rows.length === 0 ? <EmptyPanel message={`没有匹配的${resource.label}`} />
          : <Card className="admin-table-card"><Table className="min-w-[56rem]"><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}{resource.detail !== false && <TableHead className="text-end">操作</TableHead>}</TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}>{columns.map((column) => <TableCell key={column} className="max-w-[22rem] align-top whitespace-normal"><span className="admin-cell-value">{display(row[column])}</span></TableCell>)}{resource.detail !== false && <TableCell className="text-end align-top"><Button asChild variant="outline" size="sm"><Link to={`/resources/${resource.name}/${encodeURIComponent(String(row.id))}`}>查看</Link></Button></TableCell>}</TableRow>)}</TableBody></Table></Card>}
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
    <section className="admin-detail-grid">{Object.entries(record).map(([key, value]) => <Card key={key} size="sm" className="admin-detail-field"><CardHeader><CardTitle className="font-mono text-xs font-medium text-muted-foreground">{key}</CardTitle></CardHeader><CardContent>{isChunkDescriptor(value) ? <ChunkedField descriptor={value} /> : <pre>{display(value)}</pre>}</CardContent></Card>)}</section>
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
  return <Card><CardHeader><CardTitle className="text-base">消息正文</CardTitle><CardDescription>会话中的原始消息记录</CardDescription></CardHeader><CardContent>{messages.query.isLoading && !messages.query.data
    ? <ResourceSkeleton variant="list" count={5} label="正在加载消息正文" />
    : messages.query.isError ? <ErrorPanel message="无法加载消息正文" retry={() => void messages.query.refetch()} />
      : <pre className="admin-json">{JSON.stringify(messages.query.data?.data ?? [], null, 2)}</pre>}</CardContent></Card>
}

export function PageHeading({ title, description, actions = [] }: { title: string; description: string; actions?: React.ReactNode[] }) {
  return <div className="admin-page-heading"><div className="min-w-0"><h1>{title}</h1><p>{description}</p></div>{actions.length > 0 && <div className="admin-heading-actions">{actions}</div>}</div>
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <Empty className="admin-state" role="alert"><EmptyHeader><EmptyMedia variant="icon"><CircleAlertIcon /></EmptyMedia><EmptyTitle>{message}</EmptyTitle><EmptyDescription>请检查网络或服务状态后重试。</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={retry}>重新加载</Button></EmptyContent></Empty>
}

function EmptyPanel({ message }: { message: string }) {
  return <Empty className="admin-state"><EmptyHeader><EmptyMedia variant="icon"><DatabaseIcon /></EmptyMedia><EmptyTitle>{message}</EmptyTitle><EmptyDescription>调整搜索条件，或稍后再回来查看。</EmptyDescription></EmptyHeader></Empty>
}

export function LoginPage() {
  return <AuthScreen />
}

export function ForbiddenPage() {
  return <main className="min-h-svh bg-muted flex items-center justify-center p-6"><Card className="w-full max-w-sm"><CardHeader><CardTitle>无平台权限</CardTitle><CardDescription>当前 D1 用户没有管理员角色。</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={() => location.assign('/login')}>返回登录</Button></CardContent></Card></main>
}
