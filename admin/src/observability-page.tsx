import { useCustom } from '@refinedev/core'
import { ActivityIcon, ArrowUpRightIcon, Clock3Icon, CoinsIcon, RefreshCwIcon, RouteIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { API_URL } from './api'
import { compactNumber, frameRows, metricNumber, trendData, type AnalyticsResponse } from './analytics-data'
import { AreaChart } from './components/tremor/AreaChart'
import { BarList } from './components/tremor/BarList'
import { DonutChart } from './components/tremor/DonutChart'
import { normalizeLingxiLitUrl } from './lingxilit-url'
import { PageHeading } from './pages'
import { RecordAvatar, StatusBadge } from './record-components'
import { formatValue } from './record-presentation'

function duration(value: number): string {
  return value >= 60_000 ? `${(value / 60_000).toFixed(1)} 分` : value >= 1_000 ? `${(value / 1_000).toFixed(1)} 秒` : `${Math.round(value)} ms`
}

export function ObservabilityPage() {
  const query = useCustom<AnalyticsResponse>({ url: `${API_URL}/control/platform/observability`, method: 'get', queryOptions: { refetchInterval: 30_000 } })
  const payload = query.query.data?.data
  if (query.query.isLoading && !payload) return <ResourceSkeleton variant="detail" label="正在读取 AI 分析数据" />
  if (query.query.isError || !payload) return <Card role="alert"><CardHeader><CardTitle>AI 分析暂不可用</CardTitle><CardDescription>暂时无法读取运行账本，请稍后重试。</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void query.query.refetch()}>重新加载</Button></CardContent></Card>
  const summary = frameRows(payload.results.summary)[0] ?? {}
  const runs = metricNumber(summary, 'runs')
  const models = frameRows(payload.results.models).map((row) => ({ name: String(row.model), value: metricNumber(row, 'tokens') }))
  const recent = frameRows(payload.results.recentRuns)
  const results = [{ name: '已完成', value: metricNumber(summary, 'successes') }, { name: '失败或取消', value: metricNumber(summary, 'failures') }, { name: '运行中', value: metricNumber(summary, 'active') }]
  const openLitUrl = normalizeLingxiLitUrl(import.meta.env.VITE_LINGXILIT_URL)
  return <div className="space-y-6">
    <PageHeading title="AI 分析" description="从运行质量到模型消耗，持续了解 AI 团队的表现。" actions={[
      <Button key="refresh" variant="outline" disabled={query.query.isFetching} onClick={() => void query.query.refetch()}><RefreshCwIcon />刷新数据</Button>,
      <Button key="metrics" asChild variant="outline"><a href={`${API_URL}/runtime-metrics`} target="_blank" rel="noopener noreferrer">原生运行指标<ArrowUpRightIcon /></a></Button>,
      ...(openLitUrl ? [<Button key="openlit" asChild><a href={openLitUrl} target="_blank" rel="noopener noreferrer">深度诊断<ArrowUpRightIcon /></a></Button>] : []),
    ]} />
    <div className="admin-overview-tabs"><Link to="/">运营总览</Link><span aria-current="page">AI 分析</span><span className="ms-auto text-xs! text-muted-foreground">过去 24 小时</span></div>
    <Card><CardHeader><CardTitle>队列与后台处理</CardTitle><CardDescription>原生运行时当前记录的等待和失败情况</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4 md:grid-cols-5">{[
      ['queued','排队任务'],['waiting','等待任务'],['failed_deliveries','消息投递失败'],['failed_usage_deliveries','用量投递失败'],['failed_memory_captures','记忆捕获失败'],
    ].map(([key,label]) => <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{compactNumber(metricNumber(summary,key))}</dd></div>)}</dl></CardContent></Card>
    <section className="admin-kpi-grid" aria-label="过去 24 小时指标">{[
      { label: '运行总量', value: compactNumber(runs), note: `${compactNumber(metricNumber(summary, 'active'))} 个正在执行`, icon: ActivityIcon, color: 'blue' },
      { label: '运行成功率', value: runs ? `${metricNumber(summary, 'success_rate').toFixed(1)}%` : '—', note: `${compactNumber(metricNumber(summary, 'failures'))} 个失败或取消`, icon: RouteIcon, color: 'emerald' },
      { label: '平均完成耗时', value: duration(metricNumber(summary, 'average_duration_ms')), note: '从开始执行到任务结束', icon: Clock3Icon, color: 'amber' },
      { label: 'Token 消耗', value: compactNumber(metricNumber(summary, 'tokens')), note: '输入与输出 Token 合计', icon: CoinsIcon, color: 'violet' },
    ].map(({ label, value, note, icon: Icon, color }) => <Card key={label} className="admin-kpi"><CardContent><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><span className="admin-kpi-icon" data-color={color}><Icon className="size-5" /></span></div><p className="admin-kpi-value">{value}</p><p className="text-xs text-muted-foreground">{note}</p></CardContent></Card>)}</section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"><Card className="min-w-0"><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>运行趋势</CardTitle><CardDescription className="mt-1">按小时查看运行量与失败量</CardDescription></div><Badge variant="outline">24 小时</Badge></CardHeader><CardContent><AreaChart className="h-72" data={trendData(payload.results.trend)} index="time" categories={['运行', '失败']} colors={['blue', 'pink']} allowDecimals={false} valueFormatter={compactNumber} tickGap={32} aria-label="每小时的运行与失败数量" /></CardContent></Card>
      <Card><CardHeader><CardTitle>运行结果分布</CardTitle><CardDescription>完成、失败与执行中的占比</CardDescription></CardHeader><CardContent><div className="relative mx-auto size-44">{runs ? <DonutChart className="size-44" data={results} category="name" value="value" colors={['emerald', 'pink', 'blue']} aria-label={results.map((item) => `${item.name} ${item.value}`).join('，')} /> : <div className="size-44 rounded-full border-[18px] border-muted" />}<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl tabular-nums">{compactNumber(runs)}</strong><span className="text-xs text-muted-foreground">总运行量</span></div></div><ul className="mt-5 space-y-3">{results.map((item, index) => <li key={item.name} className="flex justify-between text-sm"><span className="flex items-center gap-2"><span className={`size-2 rounded-full ${['bg-emerald-500', 'bg-pink-500', 'bg-blue-500'][index]}`} />{item.name}</span><strong>{compactNumber(item.value)}</strong></li>)}</ul></CardContent></Card></div>
    <Card><CardHeader><CardTitle>模型用量排行</CardTitle><CardDescription>按 Token 消耗排序，识别主要用量来源</CardDescription></CardHeader><CardContent>{models.length ? <BarList data={models} valueFormatter={(value) => `${compactNumber(value)} Token`} aria-label="各模型 Token 消耗" /> : <div className="py-12 text-center text-sm text-muted-foreground">此时间段暂无模型用量</div>}</CardContent></Card>
    <Card className="overflow-hidden"><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>最近运行</CardTitle><CardDescription className="mt-1">查看状态、耗时与用量，进一步追踪单次运行</CardDescription></div><Button asChild variant="outline" size="sm"><Link to="/resources/agent-runs">全部运行<ArrowUpRightIcon /></Link></Button></CardHeader><CardContent><Table className="min-w-[44rem]"><TableHeader><TableRow><TableHead>Agent / 模型</TableHead><TableHead>状态</TableHead><TableHead>Token</TableHead><TableHead>耗时</TableHead><TableHead>开始时间</TableHead><TableHead className="text-end">详情</TableHead></TableRow></TableHeader><TableBody>{recent.map((run) => <TableRow key={String(run.id)}><TableCell><div className="flex items-center gap-3"><RecordAvatar record={{ id: String(run.id), name: String(run.agent) }} /><div><p className="font-medium">{String(run.agent)}</p><p className="text-xs text-muted-foreground">{String(run.model)}</p></div></div></TableCell><TableCell><StatusBadge value={run.status} /></TableCell><TableCell>{compactNumber(metricNumber(run, 'tokens'))}</TableCell><TableCell>{duration(metricNumber(run, 'duration_ms'))}</TableCell><TableCell className="text-muted-foreground">{formatValue(run.timestamp, 'started_at')}</TableCell><TableCell className="text-end"><Button variant="ghost" asChild size="icon"><Link to={`/resources/agent-runs/${encodeURIComponent(String(run.id))}`} aria-label={`查看 ${String(run.agent)} 的运行`}><ArrowUpRightIcon /></Link></Button></TableCell></TableRow>)}</TableBody></Table>{!recent.length && <p className="py-12 text-center text-sm text-muted-foreground">此时间段暂无运行记录</p>}<p className="mt-4 text-xs text-muted-foreground">更新于 {formatValue(payload.observedAt, 'updated_at')} · 每 30 秒刷新</p></CardContent></Card>
  </div>
}
