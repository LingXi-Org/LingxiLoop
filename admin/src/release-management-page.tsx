import { useCustom } from '@refinedev/core'
import { ExternalLinkIcon, RefreshCwIcon, RocketIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toastAction } from '@/lib/actionToast'
import { promptSensitiveAction } from '@/lib/confirmAction'
import { API_URL, adminFetch } from './api'
import { type DeploymentSummary, DokployDeploymentBoard } from './dokploy-deployment-board'
import { PageHeading } from './pages'

const OPENSHIP_URL = 'https://ops.christmas1314.xyz'
const ACTIONS = ['restart', 'redeploy', 'cancel', 'rollback', 'keep', 'reject'] as const

interface ReleaseRequest {
  commit_sha: string
  status: string
  created_at: number
  updated_at: number
}

export function ReleaseManagementPage() {
  const releases = useCustom<{ data: ReleaseRequest[] }>({
    url: `${API_URL}/control/releases`,
    method: 'get',
    queryOptions: { staleTime: 15_000, refetchOnWindowFocus: false },
  })
  const deployments = useCustom<{ data: DeploymentSummary[]; total: number }>({
    url: `${API_URL}/control/deployment-dashboard`,
    method: 'get',
    queryOptions: { staleTime: 15_000, refetchOnWindowFocus: false },
  })
  const rows = deployments.query.data?.data.data ?? []
  const total = deployments.query.data?.data.total ?? rows.length
  const latestRelease = releases.query.data?.data.data[0]
  const [selected, setSelected] = useState<string | null>(null)
  const [stream, setStream] = useState<string[]>([])

  useEffect(() => {
    if (!selected) return
    setStream([])
    const events = new EventSource(`${API_URL}/control/openship/deployments/${encodeURIComponent(selected)}/stream`)
    events.onmessage = (event) => setStream((current) => [...current.slice(-199), event.data])
    events.onerror = () => events.close()
    return () => events.close()
  }, [selected])

  const mutate = async (action: typeof ACTIONS[number]) => {
    if (!selected) return
    const destructive = action === 'rollback' || action === 'cancel' || action === 'reject'
    const reason = await promptSensitiveAction({
      title: `${action} 部署？`,
      description: `部署 ${selected}`,
      confirmLabel: action,
      cancelLabel: '取消',
      inputLabel: '操作原因',
      inputRequired: true,
      tone: destructive ? 'destructive' : undefined,
    })
    if (!reason) return
    await toastAction(adminFetch(`/control/openship/deployments/${encodeURIComponent(selected)}/${action}`, {
      method: 'POST',
      headers: { 'x-control-reason': reason },
      body: JSON.stringify(action === 'redeploy' ? { useExistingCommit: true } : {}),
    }), { loading: '更新部署状态…', success: `${action} 已提交` })
    await Promise.all([deployments.query.refetch(), releases.query.refetch()])
  }

  const refresh = () => Promise.all([deployments.query.refetch(), releases.query.refetch()])

  return <div className="space-y-5">
    <PageHeading title="发布管理" description="集中查看 CI 到 OpenShip 的自动部署状态、耗时和实时日志。" actions={[
      <Button key="openship" asChild><a href={OPENSHIP_URL} target="_blank" rel="noopener noreferrer">打开 OpenShip<ExternalLinkIcon /></a></Button>,
      <Button key="refresh" variant="outline" onClick={() => void refresh()}><RefreshCwIcon />刷新</Button>,
    ]} />

    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/75 bg-card px-4 py-3 shadow-sm">
      <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><RocketIcon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">最近 CI 发布</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{releases.query.isLoading ? '正在读取发布请求' : latestRelease?.commit_sha ?? '暂无发布请求'}</p>
      </div>
      {latestRelease ? <><Badge variant={latestRelease.status === 'triggered' ? 'secondary' : latestRelease.status === 'failed' ? 'destructive' : 'outline'}>{latestRelease.status}</Badge><span className="text-xs text-muted-foreground">{new Date(latestRelease.updated_at).toLocaleString()}</span></> : null}
    </div>

    <DokployDeploymentBoard
      deployments={rows}
      total={total}
      loading={deployments.query.isLoading && !deployments.query.data}
      error={deployments.query.isError}
      selectedId={selected}
      onSelect={setSelected}
      onRetry={() => void deployments.query.refetch()}
    />

    {selected ? <Card>
      <CardHeader><CardTitle className="text-base">实时日志 · {selected}</CardTitle><CardDescription>操作会写入控制面审计；完整部署详情可在 OpenShip 查看。</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">{ACTIONS.map((action) => <Button key={action} size="sm" variant={['cancel', 'rollback', 'reject'].includes(action) ? 'destructive' : 'outline'} onClick={() => void mutate(action)}>{action}</Button>)}</div>
        <pre className="max-h-[32rem] min-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/55 p-3 text-xs">{stream.length ? stream.join('\n') : '正在连接日志流…'}</pre>
      </CardContent>
    </Card> : null}
  </div>
}
