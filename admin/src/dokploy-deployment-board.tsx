/*
 * Adapted from Dokploy's ShowDeploymentsTable component at commit
 * 261ebb2317c324ae38f90bcacdd888ae06a04590.
 * Copyright 2026-present Dokploy Technology, Inc. — Apache-2.0.
 * https://github.com/Dokploy/dokploy/blob/261ebb2317c324ae38f90bcacdd888ae06a04590/apps/dokploy/components/dashboard/deployments/show-deployments-table.tsx
 */
import { CircuitBoardIcon, ClockIcon, Loader2Icon, RocketIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface DeploymentSummary {
  id: string
  projectId?: string
  projectName?: string
  status?: string
  commitSha?: string
  commitMessage?: string
  trigger?: string
  environment?: string
  framework?: string
  buildDurationMs?: number
  version?: number
  createdAt?: string
  updatedAt?: string
  isActive?: boolean
}

interface Props {
  deployments: DeploymentSummary[]
  total: number
  loading: boolean
  error: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onRetry: () => void
}

const STATUS_LABELS: Record<string, string> = {
  ready: '已就绪',
  running: '运行中',
  queued: '排队中',
  building: '构建中',
  deploying: '部署中',
  pending: '等待中',
  action_required: '需要处理',
  failed: '失败',
  error: '失败',
  cancelled: '已取消',
  canceled: '已取消',
  rejected: '已拒绝',
}

function statusColor(status = ''): string {
  if (status === 'ready') return 'bg-emerald-500'
  if (['failed', 'error', 'rejected'].includes(status)) return 'bg-destructive'
  if (['queued', 'building', 'deploying', 'pending', 'running', 'action_required'].includes(status)) return 'bg-amber-500'
  return 'bg-muted-foreground'
}

function formatDuration(value?: number): string {
  if (!Number.isFinite(value)) return '—'
  const seconds = Math.max(0, Math.round((value ?? 0) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function DokployDeploymentBoard({ deployments, total, loading, error, selectedId, onSelect, onRetry }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return deployments.filter((deployment) => {
      if (status !== 'all' && deployment.status !== status) return false
      if (!term) return true
      return [deployment.projectName, deployment.commitSha, deployment.commitMessage, deployment.environment]
        .some((value) => value?.toLowerCase().includes(term))
    })
  }, [deployments, search, status])

  return <section className="space-y-3" aria-busy={loading}>
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-56 flex-1 sm:max-w-sm">
        <SearchIcon className="pointer-events-none absolute inset-inline-start-3 top-2.5 size-4 text-muted-foreground" />
        <span className="sr-only">搜索部署</span>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目、提交或环境" className="ps-9" />
      </label>
      <label>
        <span className="sr-only">按状态筛选</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="all">全部状态</option>
          <option value="ready">已就绪</option>
          <option value="deploying">部署中</option>
          <option value="failed">失败</option>
          <option value="action_required">需要处理</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      <span className="text-xs tabular-nums text-muted-foreground">显示 {rows.length} / 最近 {deployments.length} 条 · 共 {total} 条</span>
    </div>

    <div className="overflow-hidden rounded-xl border border-border/75 bg-card shadow-sm">
      {loading ? <div className="grid min-h-64 place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2Icon className="size-4 animate-spin" />正在读取 OpenShip 部署</span></div>
        : error ? <div className="grid min-h-64 place-items-center text-center"><div><p className="font-medium">无法读取 OpenShip 部署</p><Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>重新加载</Button></div></div>
          : rows.length === 0 ? <div className="grid min-h-64 place-items-center text-center text-muted-foreground"><div><RocketIcon className="mx-auto mb-2 size-7" /><p className="font-medium">没有匹配的部署</p></div></div>
            : <div className="overflow-x-auto"><Table className="min-w-[64rem]">
              <TableHeader><TableRow>
                <TableHead>项目</TableHead><TableHead>状态</TableHead><TableHead>提交</TableHead><TableHead>环境</TableHead><TableHead>耗时</TableHead><TableHead>创建时间</TableHead><TableHead className="text-end">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((deployment) => <TableRow key={deployment.id} data-state={selectedId === deployment.id ? 'selected' : undefined}>
                <TableCell><div className="flex min-w-0 items-center gap-2"><CircuitBoardIcon className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="max-w-56 truncate font-medium">{deployment.projectName ?? deployment.projectId ?? '未命名项目'}</p><p className="text-xs text-muted-foreground">v{deployment.version ?? '—'} · {deployment.framework ?? 'docker-compose'}</p></div></div></TableCell>
                <TableCell><Badge variant="outline" className="gap-1.5"><span className={`size-2 rounded-full ${statusColor(deployment.status)}`} />{STATUS_LABELS[deployment.status ?? ''] ?? deployment.status ?? '未知'}</Badge></TableCell>
                <TableCell><div className="max-w-64"><p className="truncate font-mono text-xs" title={deployment.commitSha}>{deployment.commitSha?.slice(0, 12) ?? '—'}</p><p className="mt-0.5 truncate text-xs text-muted-foreground" title={deployment.commitMessage}>{deployment.commitMessage ?? deployment.trigger ?? '—'}</p></div></TableCell>
                <TableCell><Badge variant="secondary">{deployment.environment ?? 'production'}</Badge>{deployment.isActive ? <span className="ms-2 text-xs font-medium text-emerald-600">当前</span> : null}</TableCell>
                <TableCell><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground"><ClockIcon className="size-3.5" />{formatDuration(deployment.buildDurationMs)}</span></TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatTime(deployment.createdAt)}</TableCell>
                <TableCell className="text-end"><Button size="sm" variant={selectedId === deployment.id ? 'secondary' : 'outline'} onClick={() => onSelect(deployment.id)}>日志与操作</Button></TableCell>
              </TableRow>)}</TableBody>
            </Table></div>}
    </div>
  </section>
}
