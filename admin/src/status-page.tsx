import { useCustom } from '@refinedev/core'
import { ActivityIcon, ExternalLinkIcon, HeartPulseIcon, RefreshCwIcon, SearchIcon, ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { AdminTabSkeleton } from './loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { API_URL } from './api'
import { type KumaHeartbeat, StatusBlockIndicator } from './kuma-mieru'
import { PageHeading } from './pages'

const UPTIME_BASE_URL = 'https://uptime.lingxilearn.cn'
const MonitoringChart = lazy(() => import('./kuma-mieru-chart').then((module) => ({ default: module.MonitoringChart })))

interface StatusMonitor { id: number; name: string; type: string; certExpiryDaysRemaining?: number | string; validCert?: boolean }
interface StatusGroup { id: number; name: string; monitorList: StatusMonitor[] }
interface StatusOverview {
  config: { title: string; description: string }
  incident: { title: string; content: string } | null
  groups: StatusGroup[]
  maintenanceList: unknown[]
  history?: Record<string, KumaHeartbeat[]>
  latest: Record<string, KumaHeartbeat | null>
  uptime: Record<string, number>
}

function state(status: number | undefined): string {
  if (status === 1) return '正常'
  if (status === 3) return '维护中'
  if (status === 0) return '异常'
  return '等待检查'
}

function formatTime(value?: string): string {
  if (!value) return '等待首次检查'
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? '时间不可用' : date.toLocaleString('zh-CN', { hour12: false })
}

export function ServiceStatusPage() {
  const query = useCustom<StatusOverview>({ url: `${API_URL}/control/status-page`, method: 'get', queryOptions: { staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: false } })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const data = query.query.data?.data
  const monitors = data?.groups.flatMap((group) => group.monitorList) ?? []
  const up = monitors.filter((monitor) => data?.latest[String(monitor.id)]?.status === 1).length
  const down = monitors.filter((monitor) => data?.latest[String(monitor.id)]?.status === 0).length
  const uptimeValues = monitors.map((monitor) => data?.uptime[`${monitor.id}_24`]).filter((value): value is number => Number.isFinite(value))
  const averageUptime = uptimeValues.length ? `${(uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length * 100).toFixed(2)}%` : '—'
  const allOperational = monitors.length > 0 && up === monitors.length
  const filtered = data?.groups.map((group) => ({ ...group, monitorList: group.monitorList.filter((monitor) => monitor.name.toLowerCase().includes(search.trim().toLowerCase()) && (filter === 'all' || String(data.latest[String(monitor.id)]?.status) === filter)) })).filter((group) => group.monitorList.length) ?? []
  return <div className="ui-enter space-y-6" aria-busy={query.query.isFetching}>
    <PageHeading title="服务状态" description="实时掌握服务可用性、响应延迟与事件进展。" actions={[
      <Button key="refresh" variant="outline" disabled={query.query.isFetching} onClick={() => void query.query.refetch()}><RefreshCwIcon />刷新</Button>,
      <Button key="public" asChild><a href={`${UPTIME_BASE_URL}/status/lingxiloop`} target="_blank" rel="noopener noreferrer">公开状态页<ExternalLinkIcon /></a></Button>,
    ]} />
    {query.query.isLoading && !data && <AdminTabSkeleton tab="status" />}
    {query.query.isError && <Card role="alert"><CardHeader><CardTitle>无法读取监控数据</CardTitle><CardDescription>监控服务暂时不可用，请稍后重试。</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void query.query.refetch()}>重新加载</Button></CardContent></Card>}
    {data && <>
      <section className={`flex flex-wrap items-center gap-4 rounded-xl border p-5 ${allOperational ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`} aria-label="服务健康摘要"><span className={`grid size-12 place-items-center rounded-xl ${allOperational ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{allOperational ? <ShieldCheckIcon className="size-6" /> : <TriangleAlertIcon className="size-6" />}</span><div className="flex-1"><h2 className="text-base font-semibold">{allOperational ? '所有系统运行正常' : down ? `${down} 项服务需要关注` : monitors.length ? '部分服务正在维护或等待检查' : '暂无监控项目'}</h2><p className="mt-1 text-xs text-muted-foreground">由 Uptime Kuma 提供持续观测 · 每 60 秒刷新</p></div><Badge variant="outline" className="bg-card">实时监控</Badge></section>
      <section className="admin-kpi-grid" aria-label="可用性指标">{[
        { label: '正常服务', value: `${up} / ${monitors.length}`, note: '最新检查结果', icon: ActivityIcon, color: 'emerald' },
        { label: '异常服务', value: String(down), note: '需要优先处理', icon: TriangleAlertIcon, color: 'amber' },
        { label: '24 小时可用率', value: averageUptime, note: `${uptimeValues.length} 项监控的平均值`, icon: HeartPulseIcon, color: 'blue' },
        { label: '监控分组', value: String(data.groups.length), note: '按系统组织服务', icon: ShieldCheckIcon, color: 'violet' },
      ].map(({ label, value, note, icon: Icon, color }) => <Card key={label} className="admin-kpi"><CardContent><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><span className="admin-kpi-icon" data-color={color}><Icon className="size-5" /></span></div><p className="admin-kpi-value">{value}</p><p className="text-xs text-muted-foreground">{note}</p></CardContent></Card>)}</section>
      {data.incident && <Card className="border-amber-500/30! bg-amber-500/5"><CardHeader><CardTitle>{data.incident.title}</CardTitle><CardDescription>{data.incident.content}</CardDescription></CardHeader></Card>}
      {data.maintenanceList.length > 0 && <p className="rounded-xl border bg-card p-4 text-sm">当前有 {data.maintenanceList.length} 项维护计划，详情请查看公开状态页。</p>}
      <div className="admin-toolbar"><InputGroup className="max-w-md"><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索监控服务…" aria-label="搜索监控服务" /></InputGroup><select aria-label="筛选服务状态" className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部状态</option><option value="1">正常</option><option value="0">异常</option><option value="3">维护中</option></select></div>
      <div className="grid items-start gap-5 xl:grid-cols-2">{filtered.map((group) => <Card key={group.id} className="gap-0! overflow-hidden pb-0"><CardHeader className="flex flex-row items-center justify-between border-b pb-5"><div><CardTitle>{group.name}</CardTitle><CardDescription className="mt-1">{group.monitorList.length} 项匹配监控</CardDescription></div><Badge variant="outline">{group.monitorList.filter((monitor) => data.latest[String(monitor.id)]?.status === 1).length} 正常</Badge></CardHeader><CardContent className="divide-y px-0">{group.monitorList.map((monitor) => {
        const id = String(monitor.id)
        const heartbeat = data.latest[id]
        const history = data.history?.[id] ?? []
        const uptime = data.uptime[`${monitor.id}_24`]
        return <article key={monitor.id} className="space-y-4 p-5"><header className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{monitor.name.includes(' / ') ? monitor.name.split(' / ').slice(1).join(' / ') : monitor.name}</h3><p className="mt-1 text-xs text-muted-foreground">{monitor.type.toUpperCase()}{typeof monitor.certExpiryDaysRemaining === 'number' && monitor.validCert ? ` · 证书有效期 ${monitor.certExpiryDaysRemaining} 天` : ''}</p></div><Badge variant="outline" className="admin-status-badge" data-tone={heartbeat?.status === 1 ? 'success' : heartbeat?.status === 0 ? 'danger' : 'neutral'}><span className="size-1.5 rounded-full bg-current" />{state(heartbeat?.status)}</Badge></header><div className="admin-kuma-observation"><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>最近 {history.length} 次检查</span><strong className="text-foreground">{Number.isFinite(uptime) ? `${(uptime * 100).toFixed(2)}%` : '—'}</strong></div><StatusBlockIndicator heartbeats={history} /><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>响应延迟</span><strong className="text-foreground">{Number.isFinite(heartbeat?.ping) ? `${heartbeat?.ping} ms` : '—'}</strong></div><Suspense fallback={<div className="h-16 rounded-md bg-muted" aria-label="正在加载延迟趋势" />}><MonitoringChart heartbeats={history} /></Suspense></div><p className="text-[11px] text-muted-foreground">最近心跳 · {formatTime(heartbeat?.time)}</p></article>
      })}</CardContent></Card>)}</div>
      {!filtered.length && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">没有匹配的监控服务。{(search || filter !== 'all') && <Button variant="outline" className="ms-3" onClick={() => { setSearch(''); setFilter('all') }}>清除筛选</Button>}</CardContent></Card>}
    </>}
  </div>
}
