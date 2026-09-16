import { useCustom } from '@refinedev/core'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { API_URL } from './api'
import { AreaChart } from './components/tremor/AreaChart'
import { trendData, type AnalyticsResponse } from './analytics-data'
import { PageHeading } from './pages'
import { formatValue } from './record-presentation'
import { StatusBadge } from './record-components'
import { recordPath } from './workspace-model'

interface PlatformDashboard {
  counts: { users: number | null; companies: number | null; projects: number | null; activeRuns: number | null }
  attention: { runs: number | null; deliveries: number | null; knowledge: number | null; notifications: number | null }
  dependencies: Record<string, boolean> | null
  recentAudit: Array<{ id: string; kind: string; created_at: string }> | null
  observedAt: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const platformQuery = useCustom<PlatformDashboard>({ url: `${API_URL}/control/platform/dashboard`, method: 'get', queryOptions: { refetchInterval: 60_000 } })
  const analyticsQuery = useCustom<AnalyticsResponse>({ url: `${API_URL}/control/platform/observability`, method: 'get', queryOptions: { refetchInterval: 60_000 } })
  const platform = platformQuery.query.data?.data
  const analytics = analyticsQuery.query.data?.data
  const refresh = () => { void platformQuery.query.refetch(); void analyticsQuery.query.refetch() }
  return <div className="space-y-8">
    <PageHeading title="平台总览" description="掌握全局，优先处理需要关注的事项。" actions={[<Button key="refresh" variant="outline" disabled={platformQuery.query.isFetching || analyticsQuery.query.isFetching} onClick={refresh}>刷新数据</Button>]} />
    {platformQuery.query.isError ? <DashboardError message="平台概览暂不可用" retry={refresh} /> : !platform ? <ResourceSkeleton variant="detail" /> : <>
      <section aria-label="需要关注" className="space-y-4"><h2 className="text-lg font-semibold">需要关注</h2><div className="admin-kpi-grid">{[
        { label: '失败运行 · 24 小时', value: platform.attention.runs, to: `${recordPath('agent-runs')}?status=failed&period=24h`, note: '查看失败的运行记录' },
        { label: '待处理投递', value: platform.attention.deliveries, to: recordPath('agent-deliveries'), note: '事件与消息投递失败' },
        { label: '知识处理失败', value: platform.attention.knowledge, to: `${recordPath('knowledge-jobs')}?status=failed`, note: '检查知识源处理任务' },
        { label: '通知失败', value: platform.attention.notifications, to: `${recordPath('notification-deliveries')}?status=FAILED`, note: '检查通知投递记录' },
      ].map(item => <Card key={item.label}><CardContent className="py-6"><Link className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring" to={item.to}><p className="text-sm text-muted-foreground">{item.label}</p><strong className={`my-3 block text-3xl tabular-nums ${item.value ? 'text-destructive' : ''}`}>{item.value === null ? '暂不可用' : item.value.toLocaleString('zh-CN')}</strong><p className="text-xs text-muted-foreground">{item.note} →</p></Link>{item.value === null && <Button variant="link" onClick={refresh}>重试</Button>}</CardContent></Card>)}</div></section>
      <section aria-label="平台概况" className="space-y-4"><h2 className="text-lg font-semibold">平台概况</h2><div className="admin-kpi-grid">{[
        ['用户', platform.counts.users, '/users'], ['组织', platform.counts.companies, '/organizations'], ['项目', platform.counts.projects, '/projects'], ['活跃运行 · 24 小时', platform.counts.activeRuns, `${recordPath('agent-runs')}?status=leased&period=24h`],
      ].map(([label, value, to]) => <Card key={String(label)}><CardContent className="py-6"><Link className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring" to={String(to)}><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-3 block text-3xl tabular-nums">{value == null ? '暂不可用' : Number(value).toLocaleString('zh-CN')}</strong></Link></CardContent></Card>)}</div></section>
    </>}
    <Card><CardHeader><CardTitle>AI 协作趋势</CardTitle><p className="text-sm text-muted-foreground">过去 24 小时 · 每小时运行量</p></CardHeader><CardContent>{analyticsQuery.query.isError ? <DashboardError message="运行趋势暂不可用" retry={() => void analyticsQuery.query.refetch()} /> : analytics ? <><AreaChart className="h-72" data={trendData(analytics.results.trend)} index="time" categories={['运行', '失败']} colors={['blue', 'pink']} allowDecimals={false} onValueChange={value => { if (value) navigate(`${recordPath('agent-runs')}${value.categoryClicked === '失败' ? '?status=failed&period=24h' : '?period=24h'}`) }} /><div className="mt-4 flex flex-wrap gap-3"><Button asChild variant="outline"><Link to={`${recordPath('agent-runs')}?period=24h`}>查看运行</Link></Button><Button asChild variant="outline"><Link to={`${recordPath('agent-runs')}?status=failed&period=24h`}>查看失败运行</Link></Button><Button asChild variant="link"><Link to="/ai">完整运行分析 →</Link></Button></div></> : <ResourceSkeleton variant="detail" />}</CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]"><Card><CardHeader><CardTitle>最近管理活动</CardTitle></CardHeader><CardContent>{!platform?.recentAudit ? <DashboardError message="管理活动暂不可用" retry={refresh} /> : platform.recentAudit.length ? <ol className="divide-y">{platform.recentAudit.slice(0, 5).map(event => <li key={event.id} className="flex flex-wrap justify-between gap-3 py-4"><Link className="admin-record-link" to={recordPath('audit-events', event.id)}>{event.kind}</Link><time className="text-xs text-muted-foreground">{formatValue(event.created_at, 'created_at')}</time></li>)}</ol> : <p className="py-8 text-muted-foreground">暂无管理活动</p>}<Button asChild variant="link"><Link to="/system?tab=audit-events">全部审计记录 →</Link></Button></CardContent></Card>
    <Card><CardHeader><CardTitle>服务健康</CardTitle></CardHeader><CardContent className="space-y-4">{platform?.dependencies ? Object.entries(platform.dependencies).map(([name, ready]) => <div key={name} className="flex justify-between gap-3 text-sm"><span>{name}</span><StatusBadge value={ready ? 'ready' : 'unhealthy'} /></div>) : <DashboardError message="服务状态暂不可用" retry={refresh} />}<Button asChild variant="link"><Link to="/system">查看服务状态 →</Link></Button></CardContent></Card></div>
    {platform?.observedAt && <p className="text-xs text-muted-foreground">更新于 {formatValue(platform.observedAt, 'updated_at')} · 每分钟刷新</p>}
  </div>
}

export function DashboardError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="grid min-h-32 place-items-center gap-3 rounded-xl border border-dashed p-6 text-center"><p className="text-sm text-muted-foreground">{message}</p><Button variant="outline" size="sm" onClick={retry}>重新加载</Button></div>
}
