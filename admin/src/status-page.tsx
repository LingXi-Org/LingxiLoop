import { useCustom } from '@refinedev/core'
import { ActivityIcon, ExternalLinkIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { API_URL } from './api'
import { type KumaHeartbeat, StatusBlockIndicator } from './kuma-mieru'

const UPTIME_BASE_URL = 'https://uptime.lingxilearn.cn'
const MonitoringChart = lazy(() => import('./kuma-mieru-chart').then((module) => ({ default: module.MonitoringChart })))

interface StatusMonitor {
  id: number
  name: string
  type: string
  certExpiryDaysRemaining?: number | string
  validCert?: boolean
}

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

function monitorLabel(name: string): string {
  return name.includes(' / ') ? name.split(' / ').slice(1).join(' / ') : name
}

function state(status: number | undefined): string {
  if (status === 1) return '正常'
  if (status === 3) return '维护中'
  if (status === 0) return '异常'
  return '等待检查'
}

function formatTime(value?: string): string {
  if (!value) return '正在采集'
  return new Date(value.endsWith('Z') ? value : `${value}Z`).toLocaleString()
}

export function ServiceStatusPage() {
  const query = useCustom<StatusOverview>({
    url: `${API_URL}/control/status-page`,
    method: 'get',
    queryOptions: { staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: false },
  })
  const data = query.query.data?.data
  const monitors = data?.groups.flatMap((group) => group.monitorList) ?? []
  const up = monitors.filter((monitor) => data?.latest[String(monitor.id)]?.status === 1).length
  const down = monitors.filter((monitor) => data?.latest[String(monitor.id)]?.status === 0).length
  const latestTime = Object.values(data?.latest ?? {}).reduce<string | undefined>((value, heartbeat) => {
    if (!heartbeat?.time) return value
    return !value || heartbeat.time > value ? heartbeat.time : value
  }, undefined)
  const uptimeValues = monitors
    .map((monitor) => data?.uptime[`${monitor.id}_24`])
    .filter((value): value is number => Number.isFinite(value))
  const averageUptime = uptimeValues.length
    ? `${(uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length * 100).toFixed(2)}%`
    : '—'
  const allOperational = monitors.length > 0 && up === monitors.length

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-4" aria-live="polite">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Uptime Kuma</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{data?.config.title ?? '服务状态'}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{data?.config.description ?? '正在读取实时监控数据。'}</p>
      </div>
      <a
        href={`${UPTIME_BASE_URL}/status/lingxiloop`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >完整状态页<ExternalLinkIcon className="size-4" /></a>
    </header>

    {query.query.isError && <section className="grid min-h-48 place-items-center rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <div><TriangleAlertIcon className="mx-auto mb-2 size-6 text-destructive" /><p className="font-medium">无法读取状态提供方</p>
        <button type="button" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void query.query.refetch()}>
          <RefreshCwIcon className="size-4" />重试
        </button>
      </div>
    </section>}

    {data && <>
      <section className={`overflow-hidden rounded-xl border shadow-sm ${allOperational ? 'border-primary/25 bg-primary/[0.045]' : 'border-destructive/30 bg-destructive/[0.045]'}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-current/10 px-4 py-3">
          <span className={`grid size-9 place-items-center rounded-full ${allOperational ? 'bg-primary/12 text-primary' : 'bg-destructive/12 text-destructive'}`}>
            {allOperational ? <ActivityIcon className="size-5" /> : <TriangleAlertIcon className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-semibold">{allOperational ? '所有系统正常' : down ? `${down} 项服务异常` : '部分服务等待检查'}</h2>
            <p className="text-xs text-muted-foreground">最后心跳 {formatTime(latestTime)} · 每 60 秒刷新</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0">
          <Metric label="正常" value={`${up}/${monitors.length}`} />
          <Metric label="异常" value={String(down)} danger={down > 0} />
          <Metric label="24h 平均可用率" value={averageUptime} />
          <Metric label="监控分组" value={String(data.groups.length)} />
        </dl>
      </section>

      {data.incident && <aside className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <h2 className="font-semibold text-destructive">{data.incident.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.incident.content}</p>
      </aside>}

      <div className="flex flex-col gap-4">{data.groups.map((group) => {
        const groupUp = group.monitorList.filter((monitor) => data.latest[String(monitor.id)]?.status === 1).length
        return <section key={group.id} className="overflow-hidden rounded-xl border border-border/75 bg-card shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted/30 px-4 py-2.5">
            <h2 className="font-heading text-sm font-semibold">{group.name}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{groupUp}/{group.monitorList.length} 正常</span>
          </header>
          <div className="divide-y divide-border/60">{group.monitorList.map((monitor) => {
            const id = String(monitor.id)
            const heartbeat = data.latest[id]
            const history = data.history?.[id] ?? []
            const uptime = data.uptime[`${monitor.id}_24`]
            const current = state(heartbeat?.status)
            return <article key={monitor.id} className="grid min-w-0 gap-3 px-4 py-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.65fr)_minmax(12rem,1fr)] lg:items-center">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`size-2.5 shrink-0 rounded-full ${heartbeat?.status === 1 ? 'bg-primary' : heartbeat?.status === 3 ? 'bg-chart-1' : 'bg-destructive'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold" title={monitorLabel(monitor.name)}>{monitorLabel(monitor.name)}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{[
                    current,
                    monitor.type.toUpperCase(),
                    typeof monitor.certExpiryDaysRemaining === 'number' && monitor.validCert ? `证书 ${monitor.certExpiryDaysRemaining} 天` : null,
                  ].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between text-[0.68rem] text-muted-foreground"><span>最近 {history.length} 次</span><span className="font-medium tabular-nums text-foreground">{Number.isFinite(uptime) ? `${(uptime * 100).toFixed(2)}%` : '—'}</span></div>
                <StatusBlockIndicator heartbeats={history} />
              </div>
              <div className="min-w-0">
                <div className="mb-0.5 flex items-center justify-between text-[0.68rem] text-muted-foreground"><span>延迟趋势</span><span className="font-medium tabular-nums text-foreground">{Number.isFinite(heartbeat?.ping) ? `${heartbeat?.ping} ms` : '—'}</span></div>
                <Suspense fallback={<div className="h-16 animate-pulse rounded-md bg-muted/60" aria-label="正在加载延迟趋势" />}><MonitoringChart heartbeats={history} /></Suspense>
              </div>
            </article>
          })}</div>
        </section>
      })}</div>
    </>}
  </main>
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="px-4 py-3"><dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className={`mt-1 font-heading text-xl font-semibold tabular-nums ${danger ? 'text-destructive' : ''}`}>{value}</dd></div>
}
