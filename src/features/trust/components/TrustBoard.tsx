import { ArrowRight01Icon, Certificate01Icon, RefreshIcon, Shield01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/features/knowledge/workspace'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useApp } from '@/stores/app'
import { trustApi } from '../api'
import type {
  TrustContext,
  TrustEvalCase,
  TrustEvalRun,
  TrustEvidenceRecord,
  TrustKpi,
  TrustSnapshotReceipt,
} from '../contracts'

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(value: string | null): string {
  if (!value) return '尚未完成'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? date.format(timestamp) : value
}

function compactId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value
}

function KpiCard({ kpi }: { kpi: TrustKpi }) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm">{kpi.label}</CardTitle>
        <CardDescription>{kpi.source}</CardDescription>
        <CardAction><Badge variant={kpi.value >= kpi.threshold ? 'secondary' : 'destructive'}>{number.format(kpi.value)}</Badge></CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><p className="text-muted-foreground">阈值</p><p className="mt-1 font-medium tabular-nums">{number.format(kpi.threshold)}</p></div>
          <div><p className="text-muted-foreground">计数</p><p className="mt-1 font-medium tabular-nums">{number.format(kpi.numerator)} / {number.format(kpi.denominator)}</p></div>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{formatDate(kpi.window.from)} — {formatDate(kpi.window.to)}</p>
          <p className="break-words">{kpi.dataset} · {kpi.release}</p>
          <p title={kpi.evidenceId} className="font-mono">Evidence {compactId(kpi.evidenceId)}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function EvalPanel({ runs, selectedId, cases, loadingCases, onSelect }: {
  runs: TrustEvalRun[]
  selectedId: string | null
  cases: TrustEvalCase[]
  loadingCases: boolean
  onSelect(id: string): void
}) {
  const selected = runs.find((run) => run.id === selectedId)
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Eval 趋势与用例</CardTitle>
        <CardDescription>仅展示发布、分数与通过情况，不包含工程追踪载荷。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
        <div className="space-y-2" aria-label="Eval 运行">
          {runs.length === 0 && <p className="text-sm text-muted-foreground">暂无 Eval 运行。</p>}
          {runs.map((run) => (
            <Button
              key={run.id}
              type="button"
              variant={run.id === selectedId ? 'secondary' : 'ghost'}
              aria-pressed={run.id === selectedId}
              onClick={() => onSelect(run.id)}
              className="h-auto w-full justify-between gap-3 rounded-xl px-3 py-2 text-start"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{run.suiteName}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{run.release} · {formatDate(run.updatedAt)}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums">{run.score === null ? '—' : number.format(run.score)}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          ))}
        </div>
        <div className="space-y-3">
          {selected && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">阈值 {number.format(selected.passThreshold)}</Badge>
              <Badge variant="outline">通过 {selected.passedCases}/{selected.caseCount}</Badge>
              {selected.failedCases > 0 && <Badge variant="destructive">失败 {selected.failedCases}</Badge>}
            </div>
          )}
          {loadingCases ? <div className="space-y-2" aria-label="正在加载 Eval 用例"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div> : cases.length === 0
            ? <p className="text-sm text-muted-foreground">{selected ? '此运行没有可展示的用例。' : '选择一个 Eval 运行查看用例。'}</p>
            : <div className="space-y-2">{cases.map((item) => (
                <div key={item.id} className="rounded-xl bg-muted/55 p-3">
                  <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-medium">{item.name}</p><Badge variant={item.failureCount ? 'destructive' : 'secondary'}>{item.status}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.caseId} · 分数 {item.score === null ? '—' : number.format(item.score)} · 失败项 {item.failureCount}</p>
                </div>
              ))}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function EvidencePanel({ records }: { records: TrustEvidenceRecord[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Evidence Chain</CardTitle>
        <CardDescription>当前权限范围内的规范 Evidence 与来源关系。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {records.length === 0 && <p className="text-sm text-muted-foreground">暂无可见 Evidence。</p>}
        <ItemGroup className="gap-2">{records.map((record) => (
          <Item key={record.id} variant="muted" size="sm">
            <ItemContent className="min-w-0"><ItemTitle>{record.kind}</ItemTitle><ItemDescription title={record.id} className="font-mono">{compactId(record.id)}</ItemDescription><p className="text-xs text-muted-foreground">{formatDate(record.createdAt)} · {record.links.length} 条来源关系</p></ItemContent>
            <div className="flex gap-2"><Badge variant="outline">{record.level}</Badge><Badge variant="secondary">{record.derivation}</Badge></div>
          </Item>
        ))}</ItemGroup>
      </CardContent>
    </Card>
  )
}

export function TrustBoard() {
  const requestedProjectId = useApp((state) => state.trustProjectId)
  const activeProjectId = useWorkspace((state) => state.selectedId)
  const projectId = requestedProjectId ?? activeProjectId
  const [context, setContext] = useState<TrustContext | null>(null)
  const [kpis, setKpis] = useState<TrustKpi[]>([])
  const [runs, setRuns] = useState<TrustEvalRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [cases, setCases] = useState<TrustEvalCase[]>([])
  const [evidence, setEvidence] = useState<TrustEvidenceRecord[]>([])
  const [snapshot, setSnapshot] = useState<TrustSnapshotReceipt | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingCases, setLoadingCases] = useState(false)
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true); setError(null); setSnapshot(null)
    try {
      const [nextContext, nextKpis, nextRuns, nextEvidence] = await Promise.all([
        trustApi.context(projectId), trustApi.kpis(projectId), trustApi.evalTrend(projectId),
        trustApi.evidenceChain(projectId),
      ])
      setContext(nextContext); setKpis(nextKpis); setRuns(nextRuns); setEvidence(nextEvidence)
      setSelectedRunId((current) => nextRuns.some((run) => run.id === current) ? current : nextRuns[0]?.id ?? null)
    } catch (reason) {
      setContext(null); setKpis([]); setRuns([]); setEvidence([]); setSelectedRunId(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!projectId || !selectedRunId) { setCases([]); return }
    let current = true
    setLoadingCases(true)
    void trustApi.evalCases(projectId, selectedRunId)
      .then((next) => { if (current) setCases(next) })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (current) setLoadingCases(false) })
    return () => { current = false }
  }, [projectId, selectedRunId])

  const createSnapshot = async () => {
    if (!projectId || !context || snapshotBusy) return
    if (!await confirmSensitiveAction({
      title: '创建不可变 Trust 快照？',
      description: `将按 ${context.audienceLevel} 权限固化当前 KPI、Eval 和 Evidence，并生成可验证签名。创建后不能修改或删除。`,
      confirmLabel: '创建签名快照',
      tone: 'warning',
    })) return
    setSnapshotBusy(true)
    try {
      const receipt = await toastAction(trustApi.createSnapshot(projectId, crypto.randomUUID()), {
        loading: '正在创建 Trust 快照', success: 'Trust 快照已签名', error: 'Trust 快照创建失败',
      })
      setSnapshot(receipt)
    } catch { /* Toast owns the visible mutation error. */ }
    finally { setSnapshotBusy(false) }
  }

  if (!projectId) return <Empty className="h-full border-0"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Shield01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>尚未选择 Project</EmptyTitle><EmptyDescription>选择一个工作区后即可查看 Trust Board。</EmptyDescription></EmptyHeader></Empty>
  if (loading && !context) return <div className="grid h-full gap-4 p-6" aria-label="正在加载 Trust Board"><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-40 rounded-4xl" /><Skeleton className="h-64 rounded-4xl" /></div>

  return (
    <div className="@container/trust flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--im-divider-weak)] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2"><h1 className="truncate font-heading text-sm font-medium">Trust Board</h1><Badge variant="secondary">LIVE</Badge>{context && <Badge variant="outline">最高 {context.maximumEvidenceLevel}</Badge>}<span className="hidden truncate text-sm text-muted-foreground @min-[42rem]/trust:inline">{context?.project.name ?? '当前 Project'} · Evidence-backed</span></div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => void load()}><HugeiconsIcon icon={RefreshIcon} strokeWidth={2} data-icon="inline-start" />刷新</Button>
          <Button type="button" size="sm" disabled={!context || snapshotBusy} onClick={() => void createSnapshot()}><HugeiconsIcon icon={Certificate01Icon} strokeWidth={2} data-icon="inline-start" />{snapshotBusy ? '签名中…' : '创建签名快照'}</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {error && <Alert variant="destructive"><AlertTitle>Trust Board 暂不可用</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {context && <section aria-labelledby="trust-kpis" className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="trust-kpis" className="font-heading text-lg font-medium">关键指标</h2><p className="text-sm text-muted-foreground">值、阈值、计数口径与 Evidence 一并呈现。</p></div><Badge variant="outline">{kpis.length} 项</Badge></div><div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">{kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}{kpis.length === 0 && <p className="text-sm text-muted-foreground">暂无满足完整 provenance contract 的 KPI。</p>}</div></section>}
          {snapshot && <Alert><HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-4" /><AlertTitle>签名快照已创建</AlertTitle><AlertDescription className="space-y-1"><p title={snapshot.id}>Snapshot {compactId(snapshot.id)}</p><p title={snapshot.evidenceId}>Evidence {compactId(snapshot.evidenceId)}</p><p title={snapshot.payloadHash} className="font-mono">SHA-256 {compactId(snapshot.payloadHash)}</p></AlertDescription></Alert>}
          {context && <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]"><EvalPanel runs={runs} selectedId={selectedRunId} cases={cases} loadingCases={loadingCases} onSelect={setSelectedRunId} /><EvidencePanel records={evidence} /></div>}
        </div>
      </div>
    </div>
  )
}
