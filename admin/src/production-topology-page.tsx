/**
 * Read-only production map. The 2.5D canvas follows FossFLOW's isometric
 * diagram language and Rackpad's health-overlay model; see THIRD_PARTY_NOTICES.md.
 */
import { useCustom } from '@refinedev/core'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxIcon,
  CloudIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  Globe2Icon,
  HardDriveIcon,
  HeartPulseIcon,
  NetworkIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { API_URL } from './api'
import './production-topology-page.css'

type HealthState = 'healthy' | 'unhealthy' | 'crash-looping' | 'down' | 'unknown'

interface ProductionTopology {
  watching: boolean
  observedAt: string | null
  summary: { services: number; healthy: number; attention: number; projects: number; servers: number }
  services: Array<{
    id: string
    project: string
    service: string
    server: string
    state: HealthState
    observedAt: string | null
  }>
}

interface PlatformDashboard {
  dependencies: Record<string, boolean>
}

const OPENSHIP_URL = 'https://ops.christmas1314.xyz'
const SERVICE_LABELS: Record<string, string> = {
  'agent-os': 'Agent OS',
  clickhouse: 'ClickHouse',
  'db-migrate': 'DB Migration',
  gateway: 'Gateway',
  lingxiloop: 'API / Web',
  'open-notebook': 'Open Notebook',
  openlit: 'OpenLit',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  surrealdb: 'SurrealDB',
  'uptime-kuma': 'Uptime Kuma',
  worker: 'Queue Worker',
  wukongim: 'WuKongIM',
}
const STATE_LABELS: Record<HealthState, string> = {
  healthy: '健康',
  unhealthy: '异常',
  'crash-looping': '崩溃循环',
  down: '离线',
  unknown: '未知',
}
const SERVICE_ORDER = Object.keys(SERVICE_LABELS)

function ServiceTile({ service }: { service: ProductionTopology['services'][number] }) {
  return <div className="topology-service" data-state={service.state}>
    <span className="topology-service-icon"><BoxIcon aria-hidden="true" /></span>
    <span className="topology-service-copy">
      <strong>{SERVICE_LABELS[service.service] ?? service.service}</strong>
      <small>{service.project.replace(/^lingxiloop-/, '').replace('-shanghai-b', '')}</small>
    </span>
    <span className="topology-health-dot" title={STATE_LABELS[service.state]} aria-label={STATE_LABELS[service.state]} />
  </div>
}

function ServerPlane({ name, services, index }: { name: string; services: ProductionTopology['services']; index: number }) {
  const healthy = services.filter((service) => service.state === 'healthy').length
  const state = healthy === services.length ? 'healthy' : services.some((service) => service.state === 'down' || service.state === 'unhealthy' || service.state === 'crash-looping') ? 'down' : 'unknown'
  return <article className={`topology-server topology-server-${index === 0 ? 'a' : 'b'}`} data-state={state} aria-label={`${name}，${healthy}/${services.length} 个工作负载健康`}>
    <header className="topology-server-header">
      <span className="topology-server-icon"><ServerIcon aria-hidden="true" /></span>
      <span><small>{index === 0 ? 'STATE PRIMARY · PRIVATE' : 'PUBLIC INGRESS · COMPUTE'}</small><strong>{name}</strong></span>
      <span className="topology-server-count">{healthy}/{services.length}</span>
    </header>
    <p className="topology-server-role">{index === 0 ? '权威状态、消息与私网应用副本' : '唯一公网入口、任务执行、知识与可观测'}</p>
    <div className="topology-service-grid">
      {services.map((service) => <ServiceTile key={service.id} service={service} />)}
    </div>
  </article>
}

function TopologyLoading() {
  return <div className="topology-loading" aria-busy="true" aria-label="正在读取 OpenShip 生产拓扑">
    <span /><span /><span /><span />
  </div>
}

export function ProductionTopologyPage() {
  const topologyQuery = useCustom<ProductionTopology>({
    url: `${API_URL}/control/production-topology`,
    method: 'get',
    queryOptions: { refetchInterval: 60_000 },
  })
  const platformQuery = useCustom<PlatformDashboard>({
    url: `${API_URL}/control/platform/dashboard`,
    method: 'get',
    queryOptions: { refetchInterval: 60_000 },
  })
  const topology = topologyQuery.query.data?.data
  const platform = platformQuery.query.data?.data
  const retry = () => {
    void topologyQuery.query.refetch()
    void platformQuery.query.refetch()
  }

  if (topologyQuery.query.isLoading && !topology) return <TopologyLoading />
  if (topologyQuery.query.isError || !topology) return <div className="topology-error" role="alert">
    <AlertTriangleIcon aria-hidden="true" />
    <div><strong>无法读取 OpenShip 生产拓扑</strong><p>控制面暂不可用，现有业务数据未受此页面影响。</p></div>
    <button type="button" onClick={retry}><RefreshCwIcon aria-hidden="true" />重新加载</button>
  </div>

  const hosts = [...new Set(topology.services.map((service) => service.server))]
    .map((name) => ({ name, services: topology.services.filter((service) => service.server === name).sort((a, b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const allHealthy = topology.watching && topology.summary.healthy === topology.summary.services
  const gatewayState = topology.services.find((service) => service.service === 'gateway')?.state ?? 'unknown'
  const observedAt = topology.observedAt ? new Date(topology.observedAt) : null
  return <main className="topology-page">
    <header className="topology-hero">
      <div>
        <p className="topology-eyebrow"><span />PRODUCTION · SHANGHAI</p>
        <h1>生产运行拓扑</h1>
        <p>OpenShip 实时工作负载覆盖在实际双机、单入口与 R2 对象存储架构上。</p>
      </div>
      <div className="topology-actions">
        <span className="topology-live" data-state={allHealthy ? 'healthy' : 'down'}><HeartPulseIcon aria-hidden="true" />{allHealthy ? '生产健康' : '需要关注'}</span>
        <Link to="/status">查看可用性<ArrowRightIcon aria-hidden="true" /></Link>
        <a href={OPENSHIP_URL} target="_blank" rel="noopener noreferrer">OpenShip<ExternalLinkIcon aria-hidden="true" /></a>
      </div>
    </header>

    <section className="topology-summary" aria-label="生产健康摘要">
      <article><span><ShieldCheckIcon aria-hidden="true" /></span><div><strong>{topology.summary.healthy}/{topology.summary.services}</strong><small>工作负载健康</small></div></article>
      <article><span><ServerIcon aria-hidden="true" /></span><div><strong>{topology.summary.servers}</strong><small>生产服务器</small></div></article>
      <article><span><NetworkIcon aria-hidden="true" /></span><div><strong>{topology.summary.projects}</strong><small>受监控项目</small></div></article>
      <article><span><RefreshCwIcon aria-hidden="true" /></span><div><strong>{topology.watching ? '60s' : '暂停'}</strong><small>OpenShip 健康巡检</small></div></article>
    </section>

    <section className="topology-map-section" aria-labelledby="topology-map-title">
      <header>
        <div><p>LIVE INFRASTRUCTURE</p><h2 id="topology-map-title">服务部署图</h2></div>
        <div className="topology-legend" aria-label="图例">
          <span data-state="healthy">健康</span><span data-state="down">异常</span><span data-state="unknown">未知</span>
          {observedAt && <time dateTime={topology.observedAt ?? undefined}>更新于 {observedAt.toLocaleString('zh-CN', { hour12: false })}</time>}
        </div>
      </header>
      <div className="topology-scroll" tabIndex={0} role="region" aria-label="生产服务拓扑，可水平滚动">
        <div className="topology-stage">
          <svg className="topology-links" viewBox="0 0 1000 720" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="topology-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8Z" /></marker></defs>
            <path className="topology-link-control" d="M175 130 C175 185 250 185 250 245" />
            <path className="topology-link-control" d="M250 110 C390 110 690 120 750 178" />
            <path className="topology-link-public" d="M505 128 C570 128 680 140 730 178" markerEnd="url(#topology-arrow)" />
            <path className="topology-link-private" d="M500 392 C470 392 465 405 448 405" markerEnd="url(#topology-arrow)" />
            <path className="topology-link-storage" d="M480 625 C420 590 350 585 330 548" />
            <path className="topology-link-storage" d="M595 625 C650 595 700 590 720 565" />
          </svg>

          <article className="topology-floating-node topology-control-node" data-state={topology.watching ? 'healthy' : 'unknown'}>
            <span><NetworkIcon aria-hidden="true" /></span><div><small>CONTROL PLANE</small><strong>OpenShip</strong><p>{topology.watching ? '健康观察器运行中' : '健康观察器未运行'}</p></div>
          </article>
          <article className="topology-floating-node topology-ingress-node" data-state={gatewayState}>
            <span><Globe2Icon aria-hidden="true" /></span><div><small>PUBLIC TRAFFIC</small><strong>DNS / TLS / Edge</strong><p>Server B 单一 ICP 入口</p></div>
          </article>

          {hosts.slice(0, 2).map((host, index) => <ServerPlane key={host.name} name={host.name} services={host.services} index={index} />)}

          <article className="topology-floating-node topology-r2-node" data-state={platform ? 'configured' : 'unknown'}>
            <span><CloudIcon aria-hidden="true" /></span><div><small>OBJECT STORAGE</small><strong>Cloudflare R2</strong><p>{platform ? '应用启动契约已装载' : '未取得应用契约'}</p></div><HardDriveIcon className="topology-r2-disk" aria-hidden="true" />
          </article>
          <span className="topology-private-label"><DatabaseIcon aria-hidden="true" />WireGuard 私网数据面</span>
        </div>
      </div>
      <footer><span><span className="topology-health-dot" />绿色来自 OpenShip 工作负载健康观察。</span><span>R2 为外部托管数据面，蓝色表示配置契约已加载，不等同于主动读写探测。</span></footer>
    </section>

  </main>
}
