// Dashboard composition adapted from shadcndashboard 6f99c0b. MIT; see public/licenses.
import { useCustom, useGetIdentity } from '@refinedev/core'
import { ArrowUpRightIcon, BotIcon, Building2Icon, CheckCheckIcon, FolderKanbanIcon, HeartPulseIcon, RefreshCwIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { API_URL } from './api'
import { compactNumber, frameRows, metricNumber, trendData, type AnalyticsResponse } from './analytics-data'
import { AreaChart } from './components/tremor/AreaChart'
import { BarList } from './components/tremor/BarList'
import { PageHeading } from './pages'
import { StatusBadge } from './record-components'
import { formatValue } from './record-presentation'

interface PlatformDashboard {
  counts: { users: number; companies: number; projects: number; activeRuns: number; failedJobs: number }
  dependencies: Record<string, boolean>
  recentAudit: Array<{ id: string; kind: string; created_at: string; user_id: string | null }>
}

export function DashboardPage() {
  const identity = useGetIdentity<{ name: string }>()
  const platformQuery = useCustom<PlatformDashboard>({ url: `${API_URL}/control/platform/dashboard`, method: 'get', queryOptions: { refetchInterval: 60_000 } })
  const analyticsQuery = useCustom<AnalyticsResponse>({ url: `${API_URL}/control/platform/observability`, method: 'get', queryOptions: { refetchInterval: 60_000 } })
  const platform = platformQuery.query.data?.data
  const analytics = analyticsQuery.query.data?.data
  const summary = frameRows(analytics?.results.summary)[0] ?? {}
  const refresh = () => { void platformQuery.query.refetch(); void analyticsQuery.query.refetch() }
  return <div className="space-y-6">
    <PageHeading title={`你好，${identity.data?.name ?? '管理员'}`} description="欢迎回到管理工作空间。平台运营与服务动态，尽在眼前。" actions={[
      <Button key="refresh" variant="outline" onClick={refresh} disabled={platformQuery.query.isFetching || analyticsQuery.query.isFetching}><RefreshCwIcon />刷新数据</Button>,
      <Button key="komodo" asChild><a href="https://ops.christmas1314.xyz" target="_blank" rel="noopener noreferrer">Komodo<ArrowUpRightIcon /></a></Button>,
      <Button key="uptime" asChild variant="outline"><a href="https://uptime.lingxilearn.cn" target="_blank" rel="noopener noreferrer">Uptime<ArrowUpRightIcon /></a></Button>,
    ]} />
    <div className="admin-overview-tabs"><span aria-current="page">运营总览</span><Link to="/observability">AI 分析</Link><time className="ms-auto hidden sm:block">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</time></div>
    {platformQuery.query.isError ? <DashboardError message="业务概览暂不可用" retry={() => void platformQuery.query.refetch()} /> : platform ? <section className="admin-kpi-grid" aria-label="平台业务指标">
      {[
        { label: '平台用户', value: platform.counts.users, note: '未删除的用户账号', icon: UsersIcon, to: 'users', color: 'blue' },
        { label: '入驻公司', value: platform.counts.companies, note: '平台内的组织与团队', icon: Building2Icon, to: 'companies', color: 'violet' },
        { label: '协作项目', value: platform.counts.projects, note: '学习与协作空间', icon: FolderKanbanIcon, to: 'projects', color: 'amber' },
        { label: '正在运行', value: platform.counts.activeRuns, note: '当前执行中的 Agent', icon: BotIcon, to: 'agent-runs', color: 'emerald' },
      ].map(({ label, value, note, icon: Icon, to, color }) => <Card key={to} className="admin-kpi"><CardContent><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><span className="admin-kpi-icon" data-color={color}><Icon className="size-5" /></span></div><p className="admin-kpi-value">{compactNumber(value)}</p><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{note}</span><Link to={`/resources/${to}`} className="admin-record-link" aria-label={`查看${label}`}><ArrowUpRightIcon className="size-4" /></Link></div></CardContent></Card>)}
    </section> : <ResourceSkeleton variant="detail" label="正在加载平台概览" />}
    <section>
      <Card className="min-w-0"><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>AI 协作趋势</CardTitle><CardDescription className="mt-1">过去 24 小时 · 每小时运行量</CardDescription></div><Badge variant="outline">24 小时</Badge></CardHeader><CardContent>{analyticsQuery.query.isError ? <DashboardError message="运行趋势暂不可用" retry={() => void analyticsQuery.query.refetch()} /> : analytics ? <><div className="mb-5 flex flex-wrap gap-8"><div><p className="text-xs text-muted-foreground">运行总量</p><strong className="text-2xl tabular-nums">{compactNumber(metricNumber(summary, 'runs'))}</strong></div><div><p className="text-xs text-muted-foreground">成功率</p><strong className="text-2xl tabular-nums">{metricNumber(summary, 'runs') ? `${metricNumber(summary, 'success_rate').toFixed(1)}%` : '—'}</strong></div></div><AreaChart className="h-64" data={trendData(analytics.results.trend)} index="time" categories={['运行', '失败']} colors={['blue', 'pink']} valueFormatter={compactNumber} allowDecimals={false} tickGap={32} aria-label="过去 24 小时运行量和失败量" /><Button asChild variant="link" className="mt-2 px-0"><Link to="/observability">查看完整分析<ArrowUpRightIcon /></Link></Button></> : <ResourceSkeleton variant="detail" label="正在加载运行趋势" />}</CardContent></Card>
    </section>
    <section className="grid gap-5 xl:grid-cols-3">
      <Card><CardHeader><CardTitle>运营待办</CardTitle><CardDescription>优先关注需要处理的运行状态</CardDescription></CardHeader><CardContent className="space-y-4">{platform ? <><div className="admin-attention"><HeartPulseIcon className="size-5" /><div className="flex-1"><p className="font-medium">失败工作项</p><p className="text-xs text-muted-foreground">Agent、知识处理与通知合计</p></div><strong className="text-2xl tabular-nums">{platform.counts.failedJobs}</strong></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/resources/agent-runs">Agent 运行</Link></Button><Button asChild variant="outline" size="sm"><Link to="/resources/knowledge-jobs">知识任务</Link></Button><Button asChild variant="outline" size="sm"><Link to="/resources/notification-deliveries">通知投递</Link></Button></div><div className="space-y-3 border-t pt-4">{Object.entries(platform.dependencies).map(([key, ready]) => <div key={key} className="flex items-center justify-between gap-3 text-sm"><span>{key}</span><StatusBadge value={ready ? 'ready' : 'unhealthy'} /></div>)}</div></> : <p className="text-sm text-muted-foreground">等待业务概览数据</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>资源规模</CardTitle><CardDescription>用户、组织与项目的当前数量</CardDescription></CardHeader><CardContent>{platform ? <BarList data={[{ name: '平台用户', value: platform.counts.users }, { name: '入驻公司', value: platform.counts.companies }, { name: '协作项目', value: platform.counts.projects }]} valueFormatter={compactNumber} /> : <p className="text-sm text-muted-foreground">暂无数据</p>}<div className="mt-8 rounded-xl bg-muted/60 p-4"><ShieldCheckIcon className="mb-3 size-6 text-primary" /><p className="text-sm font-semibold">让管理有迹可循</p><p className="mt-1 text-xs leading-6 text-muted-foreground">敏感操作保留确认与原因记录，方便团队复核和追溯。</p><Button asChild variant="link" className="mt-2 h-auto p-0"><Link to="/resources/audit-events">浏览审计记录<ArrowUpRightIcon /></Link></Button></div></CardContent></Card>
      <Card><CardHeader className="flex flex-row justify-between"><div><CardTitle>最近活动</CardTitle><CardDescription className="mt-1">最新的管理审计事件</CardDescription></div><Button asChild variant="ghost" size="icon"><Link to="/resources/audit-events" aria-label="查看全部审计事件"><ArrowUpRightIcon /></Link></Button></CardHeader><CardContent><ol className="admin-timeline">{platform?.recentAudit.slice(0, 5).map((event) => <li key={event.id}><span><CheckCheckIcon className="size-4" /></span><div><Link className="break-words text-sm font-medium hover:underline" to={`/resources/audit-events/${encodeURIComponent(event.id)}`}>{event.kind}</Link><time className="mt-1 block text-xs text-muted-foreground">{formatValue(event.created_at, 'created_at')}</time></div></li>)}</ol>{!platform?.recentAudit.length && <p className="py-10 text-center text-sm text-muted-foreground">暂无活动记录</p>}</CardContent></Card>
    </section>
  </div>
}

export function DashboardError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="grid min-h-32 place-items-center gap-3 rounded-xl border border-dashed p-6 text-center"><p className="text-sm text-muted-foreground">{message}</p><Button variant="outline" size="sm" onClick={retry}><RefreshCwIcon />重新加载</Button></div>
}
