import { useCustom } from '@refinedev/core'
import { ActivityIcon, ExternalLinkIcon, ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { API_URL } from './api'

const UPTIME_BASE_URL = 'https://uptime.lingxilearn.cn'

interface StatusMonitor {
  id: number
  name: string
  type: string
  certExpiryDaysRemaining?: number | string
  validCert?: boolean
}

interface StatusGroup { id: number; name: string; monitorList: StatusMonitor[] }
interface Heartbeat { status: number; time?: string; ping?: number; msg?: string }
interface StatusOverview {
  config: { title: string; description: string }
  incident: { title: string; content: string } | null
  groups: StatusGroup[]
  maintenanceList: unknown[]
  latest: Record<string, Heartbeat | null>
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

export function ServiceStatusPage() {
  const query = useCustom<StatusOverview>({
    url: `${API_URL}/control/status-page`,
    method: 'get',
    queryOptions: { refetchInterval: 60_000 },
  })
  const data = query.query.data?.data
  const monitors = data?.groups.flatMap((group) => group.monitorList) ?? []
  const up = monitors.filter((monitor) => data?.latest[String(monitor.id)]?.status === 1).length
  const pending = monitors.filter((monitor) => data?.latest[String(monitor.id)] == null).length
  const latestTime = Object.values(data?.latest ?? {}).reduce<string | undefined>((value, heartbeat) => {
    if (!heartbeat?.time) return value
    return !value || heartbeat.time > value ? heartbeat.time : value
  }, undefined)

  return <div className="space-y-6" aria-live="polite">
    <div className="admin-page-heading">
      <div><h1>{data?.config.title ?? '服务状态'}</h1><p>{data?.config.description ?? '正在加载 Uptime Kuma 状态数据。'}</p></div>
      <div className="admin-heading-actions"><Button asChild variant="outline"><a href={`${UPTIME_BASE_URL}/status/lingxiloop`} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon />打开完整状态页</a></Button></div>
    </div>
    {query.query.isError && <Card className="admin-state"><CardContent className="grid place-items-center text-center"><div><TriangleAlertIcon className="mx-auto mb-3 size-7 text-destructive" /><p className="font-medium">无法读取状态提供方</p><Button className="mt-4" variant="outline" onClick={() => void query.query.refetch()}>重试</Button></div></CardContent></Card>}
    {data && <>
      {data.incident && <Card className="border-destructive/40"><CardHeader><CardTitle className="text-base">{data.incident.title}</CardTitle><CardDescription>{data.incident.content}</CardDescription></CardHeader></Card>}
      <section className="admin-card-grid">
        <StatusMetric label="正常服务" value={`${up}/${monitors.length}`} description="当前最新检查" icon={ShieldCheckIcon} />
        <StatusMetric label="监控分组" value={String(data.groups.length)} description="覆盖全部服务层" icon={ActivityIcon} />
        <StatusMetric label="等待首检" value={String(pending)} description={latestTime ? `更新于 ${new Date(`${latestTime}Z`).toLocaleString()}` : '采集器正在运行'} icon={TriangleAlertIcon} />
      </section>
      <div className="admin-status-grid">{data.groups.map((group) => <Card key={group.id}>
        <CardHeader><CardTitle className="text-base">{group.name}</CardTitle><CardDescription>{group.monitorList.length} 项独立探针</CardDescription></CardHeader>
        <CardContent><ItemGroup>{group.monitorList.map((monitor) => {
          const heartbeat = data.latest[String(monitor.id)]
          const current = state(heartbeat?.status)
          const uptime = data.uptime[`${monitor.id}_24`]
          return <Item key={monitor.id} variant="muted" size="sm">
            <ItemContent><ItemTitle>{monitorLabel(monitor.name)}</ItemTitle><ItemDescription>{[
              current,
              Number.isFinite(heartbeat?.ping) ? `${heartbeat?.ping} ms` : null,
              Number.isFinite(uptime) ? `24h ${(uptime * 100).toFixed(2)}%` : null,
              typeof monitor.certExpiryDaysRemaining === 'number' && monitor.validCert ? `证书 ${monitor.certExpiryDaysRemaining} 天` : null,
            ].filter(Boolean).join(' · ') || monitor.type.toUpperCase()}</ItemDescription></ItemContent>
            <img src={`${UPTIME_BASE_URL}/api/badge/${monitor.id}/status`} alt={`${monitorLabel(monitor.name)}：${current}`} className="h-5 w-auto shrink-0" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </Item>
        })}</ItemGroup></CardContent>
      </Card>)}</div>
    </>}
  </div>
}

function StatusMetric({ label, value, description, icon: Icon }: { label: string; value: string; description: string; icon: React.ComponentType<{ className?: string }> }) {
  return <Card size="sm" className="admin-metric-card"><CardContent className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-3 font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><span className="admin-metric-icon"><Icon /></span></CardContent></Card>
}
