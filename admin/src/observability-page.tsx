import { useCustom } from '@refinedev/core'
import type { Dashboard, QueryResult } from '@openplait/core'
import {
  ActivityIcon,
  ArrowUpRightIcon,
  BotIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  Clock3Icon,
  CoinsIcon,
  RefreshCwIcon,
  RouteIcon,
  ZapIcon,
} from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { API_URL } from './api'
import { normalizeLingxiLitUrl } from './lingxilit-url'

type OpenPlaitResponse = {
  dashboard: Dashboard
  observedAt: string
  results: { summary: QueryResult; trend: QueryResult; models: QueryResult; recentRuns: QueryResult }
}
type FrameRow = Record<string, unknown>

const STATUS: Record<string, { label: string; color: string; className: string }> = {
  completed: { label: '完成', color: 'var(--primary)', className: 'bg-primary' },
  failed: { label: '失败', color: 'var(--destructive)', className: 'bg-destructive' },
  cancelled: { label: '取消', color: 'var(--chart-4)', className: 'bg-chart-4' },
  running: { label: '运行中', color: 'var(--chart-2)', className: 'bg-chart-2' },
}

function rows(result: QueryResult | undefined): FrameRow[] {
  const frame = result?.frames[0]
  if (!frame) return []
  return Array.from({ length: frame.length }, (_, index) => Object.fromEntries(
    frame.fields.map((field) => [field.name, field.values[index]]),
  ))
}

function number(row: FrameRow, key: string): number {
  const value = Number(row[key])
  return Number.isFinite(value) ? value : 0
}

function compact(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function duration(value: number): string {
  return value >= 60_000 ? `${(value / 60_000).toFixed(1)} 分` : value >= 1_000 ? `${(value / 1_000).toFixed(1)} 秒` : `${Math.round(value)} ms`
}

function ObservabilityError({ retry }: { retry: () => void }) {
  return <Card className="grid min-h-80 place-items-center border-dashed"><CardContent className="flex max-w-md flex-col items-center gap-4 text-center">
    <CircleAlertIcon className="size-7 text-destructive" aria-hidden="true" />
    <div><h2 className="font-heading font-semibold">无法读取可观测数据</h2><p className="mt-1 text-sm text-muted-foreground">运行账本暂不可用，OpenLIT 的遥测采集不受此页面影响。</p></div>
    <Button variant="outline" onClick={retry}><RefreshCwIcon />重新加载</Button>
  </CardContent></Card>
}

export function ObservabilityPage() {
  const query = useCustom<OpenPlaitResponse>({
    url: `${API_URL}/control/platform/observability`,
    method: 'get',
    queryOptions: { refetchInterval: 30_000 },
  })
  const payload = query.query.data?.data
  if (query.query.isLoading && !payload) return <ResourceSkeleton variant="detail" label="正在读取 AI 可观测数据" />
  if (query.query.isError || !payload) return <ObservabilityError retry={() => void query.query.refetch()} />

  const summary = rows(payload.results.summary)[0] ?? {}
  const trend = rows(payload.results.trend).map((row) => ({
    ...row,
    time: new Date(String(row.time)).getTime(),
    runs: number(row, 'runs'),
    failures: number(row, 'failures'),
  }))
  const models = rows(payload.results.models).map((row) => ({
    model: String(row.model), runs: number(row, 'runs'), tokens: number(row, 'tokens'),
  }))
  const recentRuns = rows(payload.results.recentRuns)
  const statusData = [
    { name: '完成', value: number(summary, 'successes'), color: STATUS.completed.color },
    { name: '失败/取消', value: number(summary, 'failures'), color: STATUS.failed.color },
    { name: '运行中', value: number(summary, 'active'), color: STATUS.running.color },
  ].filter((item) => item.value > 0)
  const observedAt = new Date(payload.observedAt)
  const openLitUrl = normalizeLingxiLitUrl(import.meta.env.VITE_LINGXILIT_URL)

  return <main className="space-y-5">
    <header className="flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary"><span className="h-0.5 w-5 rounded-full bg-primary" />OPENPLAIT · 24H</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">AI 可观测</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">用图表先判断运行量、可靠性和模型消耗；需要追查时再展开单次运行。</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground"><span className="me-2 inline-block size-2 rounded-full bg-primary" />更新于 {observedAt.toLocaleTimeString('zh-CN', { hour12: false })}</span>
        <Button variant="outline" size="sm" onClick={() => void query.query.refetch()} disabled={query.query.isFetching}><RefreshCwIcon className={query.query.isFetching ? 'animate-spin' : ''} />刷新</Button>
        {openLitUrl && <Button asChild variant="outline" size="sm"><a href={openLitUrl} target="_blank" rel="noopener noreferrer">OpenLIT<ArrowUpRightIcon /></a></Button>}
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="过去 24 小时摘要">
      {[
        { label: '运行', value: compact(number(summary, 'runs')), note: `${compact(number(summary, 'active'))} 个正在运行`, icon: ActivityIcon },
        { label: '成功率', value: `${number(summary, 'success_rate').toFixed(1)}%`, note: `${compact(number(summary, 'failures'))} 个失败或取消`, icon: RouteIcon },
        { label: '平均耗时', value: duration(number(summary, 'average_duration_ms')), note: '从开始到结束', icon: Clock3Icon },
        { label: 'Token', value: compact(number(summary, 'tokens')), note: '输入与输出合计', icon: CoinsIcon },
      ].map(({ label, value, note, icon: Icon }) => <Card key={label} className="gap-3 py-4"><CardHeader className="flex-row items-center justify-between px-4"><CardDescription>{label}</CardDescription><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden="true" /></span></CardHeader><CardContent className="px-4"><strong className="font-heading text-2xl font-semibold tabular-nums tracking-tight">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Card className="min-w-0">
        <CardHeader><CardTitle>运行趋势</CardTitle><CardDescription>每小时启动量与失败量</CardDescription></CardHeader>
        <CardContent><div className="h-72 min-w-0" role="img" aria-label="过去 24 小时 Agent 运行与失败趋势">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={trend} accessibilityLayer margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs><linearGradient id="observability-runs" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.28} /><stop offset="95%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
              <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} tickLine={false} axisLine={false} fontSize={11} minTickGap={28} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip labelFormatter={(value) => new Date(Number(value)).toLocaleString('zh-CN', { hour12: false })} contentStyle={{ borderRadius: 10, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12 }} />
              <Area type="monotone" dataKey="runs" name="运行" stroke="var(--primary)" strokeWidth={2} fill="url(#observability-runs)" dot={false} activeDot={{ r: 3 }} />
              <Area type="monotone" dataKey="failures" name="失败/取消" stroke="var(--destructive)" strokeWidth={1.5} fill="transparent" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div></CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader><CardTitle>运行结果</CardTitle><CardDescription>过去 24 小时状态构成</CardDescription></CardHeader>
        <CardContent className="grid place-items-center"><div className="relative h-48 w-full" role="img" aria-label="运行结果环形图">
          {statusData.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart accessibilityLayer><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={76} paddingAngle={3} stroke="none">{statusData.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip contentStyle={{ borderRadius: 10, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12 }} /></PieChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-muted-foreground">暂无运行</div>}
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><span><strong className="block text-xl tabular-nums">{compact(number(summary, 'runs'))}</strong><small className="text-muted-foreground">运行</small></span></div>
        </div><div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">{statusData.map((item) => <span key={item.name} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: item.color }} />{item.name} {item.value}</span>)}</div></CardContent>
      </Card>
    </section>

    <Card className="min-w-0">
      <CardHeader><CardTitle>模型用量</CardTitle><CardDescription>按 Token 排序；条形长度直接显示主要消耗来源</CardDescription></CardHeader>
      <CardContent>{models.length ? <div className="h-64 min-w-0" role="img" aria-label="模型 Token 用量横向条形图"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={models} layout="vertical" accessibilityLayer margin={{ left: 8, right: 20 }}><CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis type="number" tickFormatter={(value) => compact(Number(value))} tickLine={false} axisLine={false} fontSize={11} /><YAxis type="category" dataKey="model" width={120} tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => String(value).slice(0, 18)} /><Tooltip formatter={(value) => [compact(Number(value)), 'Token']} cursor={{ fill: 'var(--muted)', opacity: 0.45 }} contentStyle={{ borderRadius: 10, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12 }} /><Bar dataKey="tokens" name="Token" fill="var(--primary)" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div> : <div className="grid h-40 place-items-center text-sm text-muted-foreground">暂无模型用量</div>}</CardContent>
    </Card>

    <section aria-labelledby="recent-runs-title">
      <div className="mb-3 flex items-end justify-between gap-4"><div><h2 id="recent-runs-title" className="font-heading text-lg font-semibold">最近运行</h2><p className="mt-1 text-sm text-muted-foreground">默认收起，展开查看一次运行的诊断摘要。</p></div><Badge variant="outline">{recentRuns.length} 条</Badge></div>
      <div className="space-y-2">
        {recentRuns.map((run) => {
          const state = STATUS[String(run.status)] ?? { label: String(run.status), className: 'bg-muted-foreground' }
          return <details key={String(run.id)} className="group rounded-xl border bg-card open:shadow-sm">
            <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[auto_minmax(10rem,1fr)_minmax(8rem,0.7fr)_auto_auto_auto]">
              <span className={`size-2 rounded-full ${state.className}`} aria-hidden="true" />
              <span className="min-w-0"><strong className="block truncate text-sm">{String(run.agent)}</strong><small className="block truncate text-muted-foreground">{String(run.model)}</small></span>
              <Badge variant="outline" className="hidden sm:inline-flex">{state.label}</Badge>
              <span className="hidden text-end text-xs tabular-nums text-muted-foreground sm:block">{duration(number(run, 'duration_ms'))}</span>
              <time className="hidden text-end text-xs text-muted-foreground sm:block" dateTime={String(run.timestamp)}>{new Date(String(run.timestamp)).toLocaleString('zh-CN', { hour12: false })}</time>
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t px-4 py-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">Token</dt><dd className="mt-1 font-medium tabular-nums">{compact(number(run, 'tokens'))}</dd></div>
                <div><dt className="text-xs text-muted-foreground">工具调用</dt><dd className="mt-1 font-medium tabular-nums">{number(run, 'tool_calls')}</dd></div>
                <div><dt className="text-xs text-muted-foreground">公司</dt><dd className="mt-1 truncate font-mono text-xs">{String(run.company ?? '—')}</dd></div>
                <div><dt className="text-xs text-muted-foreground">运行 ID</dt><dd className="mt-1 truncate font-mono text-xs" title={String(run.id)}>{String(run.id)}</dd></div>
              </dl>
              {Boolean(run.summary) && <div className="mt-4 rounded-lg bg-muted/55 p-3"><p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><BotIcon className="size-3.5" />运行摘要</p><p className="text-sm leading-6">{String(run.summary)}</p></div>}
              {Boolean(run.error) && <div className="mt-3 rounded-lg bg-destructive/8 p-3 text-destructive"><p className="mb-1 flex items-center gap-1.5 text-xs font-medium"><ZapIcon className="size-3.5" />错误</p><p className="font-mono text-xs leading-5">{String(run.error)}</p></div>}
              <div className="mt-4"><Button asChild variant="outline" size="sm"><Link to={`/resources/agent-runs/${encodeURIComponent(String(run.id))}`}>查看完整记录<ArrowUpRightIcon /></Link></Button></div>
            </div>
          </details>
        })}
        {!recentRuns.length && <Card className="grid min-h-36 place-items-center border-dashed text-sm text-muted-foreground">暂无运行记录</Card>}
      </div>
    </section>
  </main>
}
