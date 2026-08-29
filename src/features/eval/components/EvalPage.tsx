import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { evalApi } from '../api'
import { useEvalState } from '../state'
import type {
  EvalCaseDetail,
  EvalComparison,
  EvalCreateRunRequest,
  EvalDashboardPayload,
  EvalDashboardRun,
  EvalRunDetail,
  EvalStageName,
  EvalStageResult,
  EvalStageStatus,
  EvalTraceEvent,
} from '../contracts'

const STAGES: Array<{ key: EvalStageName; label: string; short: string }> = [
  { key: 'ingest', label: '轨迹采集', short: '采集' },
  { key: 'answer', label: '回答质量', short: '回答' },
  { key: 'teaching', label: '教学质量', short: '教学' },
  { key: 'rag', label: 'RAG', short: 'RAG' },
  { key: 'tools', label: '工具调用', short: '工具' },
  { key: 'safety', label: 'Approval / 安全', short: '安全' },
  { key: 'task', label: '任务完成', short: '任务' },
  { key: 'collaboration', label: '多 Agent', short: '协作' },
  { key: 'efficiency', label: '效率 / 成本', short: '效率' },
  { key: 'aggregate', label: '门控汇总', short: '汇总' },
]

const STAGE_THRESHOLDS: Partial<Record<EvalStageName, number>> = {
  answer: 0.75,
  teaching: 0.75,
  rag: 0.75,
  tools: 1,
  safety: 1,
  task: 0.8,
  collaboration: 0.8,
  efficiency: 0.75,
}

const DIMENSIONS = ['answer', 'teaching', 'rag', 'tools', 'safety', 'task', 'collaboration', 'efficiency'] as const

const FAILURE_LABELS: Record<string, string> = {
  answer_quality: '回答质量', teaching_quality: '教学质量', rag_missing_source: 'RAG 未召回',
  rag_missing_citation: '缺少引用', rag_hallucination: 'RAG 幻觉', rag_bad_citation: '错误引用', tool_missing: '缺少工具',
  tool_selection: '错误工具', tool_error: '工具失败', approval_violation: 'Approval 违规',
  policy_violation: '安全策略', task_incomplete: '任务未完成', routing_error: '错误路由',
  canvas_failure: 'Canvas 协作失败', timeout: '超时', cost_regression: '成本回退',
  trace_efficiency: '轨迹低效', runtime_error: '运行错误', coverage_gap: '证据缺失',
}

const RUN_TEMPLATE: EvalCreateRunRequest = {
  schemaVersion: 'lingxiloop.eval.v1',
  suiteKey: 'agent-regression',
  suiteName: 'Agent 回归套件',
  version: 'v1.0.0',
  target: { commitSha: '请替换为 commit SHA', promptVersion: 'prompt.v1', model: '请替换为模型 ID' },
  passThreshold: 0.8,
  cases: [{
    caseId: 'grounded-answer',
    name: '基于知识库回答并调用工具',
    sourceAgentRunId: '请替换为 Agent OS runId',
    expectations: {
      requiredStages: ['answer', 'teaching', 'rag', 'tools', 'safety', 'task', 'efficiency'],
      answer: {
        requiredKeywords: ['结论'],
        forbiddenPatterns: ['我不知道但我猜'],
        maxLatencyMs: 15000,
        maxTokens: 4000,
      },
      teaching: { requiredConcepts: ['结论'], requireExplanation: true },
      rag: {
        requiredSourceIds: ['请替换为知识源 ID'],
        requireCitations: true,
        minRetrievalRecall: 1,
        minCitationPrecision: 1,
      },
      tools: {
        calls: [{ name: 'knowledge.search', required: true }],
        requireSuccess: true,
        allowUnexpected: true,
      },
      safety: { requireNoPolicyViolations: true },
      task: { requireCompleted: true, minCompletionRate: 1 },
      efficiency: { maxLatencyMs: 15000, maxTokens: 4000, maxCostUsd: 0.02, maxModelCalls: 4, maxIpythonCells: 4, maxToolCalls: 8 },
    },
  }],
}

const fmtPercent = (value: number | null, digits = 0): string => value === null ? '—' : `${(value * 100).toFixed(digits)}%`
const fmtDate = (value: string): string => new Intl.DateTimeFormat('zh-CN', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function summaryPipeline(run: EvalDashboardRun): Array<{ stage: EvalStageName; status: EvalStageStatus; score: number | null }> {
  return STAGES.map(({ key }) => {
    if (key === 'ingest') return { stage: key, status: 'pass', score: 1 }
    if (key === 'aggregate') return { stage: key, status: run.status, score: run.score }
    const score = run.summary.stageScores[key]
    return { stage: key, status: run.summary.stageStatuses?.[key] ??
      (score === null ? 'skipped' : score >= (STAGE_THRESHOLDS[key] ?? 1) ? 'pass' : 'fail'), score }
  })
}

export function EvalPage() {
  const data = useEvalState((state) => state.data)
  const loading = useEvalState((state) => state.loading)
  const refreshing = useEvalState((state) => state.refreshing)
  const error = useEvalState((state) => state.error)
  const sinceDays = useEvalState((state) => state.sinceDays)
  const suiteFilter = useEvalState((state) => state.suiteFilter)
  const selectedId = useEvalState((state) => state.selectedId)
  const detail = useEvalState((state) => state.detail)
  const detailError = useEvalState((state) => state.detailError)
  const setSinceDays = useEvalState((state) => state.setSinceDays)
  const setSuiteFilter = useEvalState((state) => state.setSuiteFilter)
  const loadDashboard = useEvalState((state) => state.loadDashboard)
  const refreshDashboard = useEvalState((state) => state.refreshDashboard)
  const selectRun = useEvalState((state) => state.selectRun)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void loadDashboard()
  }, [sinceDays, suiteFilter, loadDashboard])

  const suites = useMemo(() => {
    const names = new Map<string, string>()
    for (const run of data?.runs ?? []) names.set(run.suiteKey, run.suiteName)
    return [...names.entries()].sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'))
  }, [data])
  const trendSuite = suiteFilter || data?.runs[0]?.suiteKey || ''
  const trendRuns = (data?.runs ?? []).filter((run) => run.suiteKey === trendSuite)

  return (
    <div className="admin-page eval-page">
      <header className="admin-page-head eval-page-head">
        <div>
          <div className="eval-eyebrow">QUALITY CONTROL</div>
          <h1 className="admin-h1">Agent Eval</h1>
          <div className="admin-sub">回答、教学、RAG、工具、Approval、安全、任务与多 Agent 的确定性回归评测</div>
        </div>
        <div className="eval-head-actions">
          <Button variant="outline" disabled={refreshing} onClick={() => void refreshDashboard()}>
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>运行评测</Button>
        </div>
      </header>

      <div className="eval-filterbar">
        <label>
          <span>套件</span>
          <Select value={suiteFilter || '__all__'} onValueChange={(value) => setSuiteFilter(value === '__all__' ? '' : value)}>
            <SelectTrigger size="sm" className="min-w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部套件</SelectItem>
              {suites.map(([key, name]) => <SelectItem key={key} value={key}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>时间范围</span>
          <Select value={String(sinceDays)} onValueChange={(value) => setSinceDays(Number(value))}>
            <SelectTrigger size="sm" className="min-w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">最近 7 天</SelectItem>
              <SelectItem value="30">最近 30 天</SelectItem>
              <SelectItem value="90">最近 90 天</SelectItem>
              <SelectItem value="365">最近 1 年</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="eval-filter-note">结果不可变 · 缺失阶段不会被当作通过</div>
      </div>

      {error && <div className="admin-banner-err">{error}</div>}
      {loading && !data ? <EvalSkeleton /> : data && <>
        <section className="eval-kpis" aria-label="评测概览">
          <Kpi label="运行次数" value={String(data.summary.totalRuns)} note={`${data.summary.suites} 个评测套件`} tone="muted" />
          <Kpi label="通过率" value={fmtPercent(data.summary.passRate)} note={`${data.summary.failedRuns} 次未通过`} tone={data.summary.failedRuns ? 'destructive' : 'primary'} />
          <Kpi label="平均得分" value={fmtPercent(data.summary.averageScore, 1)} note="仅统计已观测检查项" tone="primary" />
          <Kpi label="最新变化" value={data.runs[0]?.scoreDelta === null || data.runs[0]?.scoreDelta === undefined
            ? '—' : `${data.runs[0].scoreDelta >= 0 ? '+' : ''}${(data.runs[0].scoreDelta * 100).toFixed(1)}pp`}
            note={data.runs[0] ? `${data.runs[0].suiteName} · ${data.runs[0].version}` : '暂无基线'}
            tone={(data.runs[0]?.scoreDelta ?? 0) < 0 ? 'destructive' : 'primary'} />
          <Kpi label="平均延迟" value={data.summary.averageLatencyMs === null ? '—' : `${Math.round(data.summary.averageLatencyMs)}ms`}
            note="真实 Agent 端到端耗时" tone="primary" />
          <Kpi label="Token" value={data.summary.totalTokens.toLocaleString('zh-CN')}
            note={`${data.runs.reduce((sum, run) => sum + (run.summary.resources?.modelCalls ?? 0), 0)} 次模型调用`} tone="muted" />
          <Kpi label="累计成本" value={`$${data.summary.totalCostUsd.toFixed(4)}`}
            note="所选运行范围" tone="destructive" />
          <Kpi label="工具调用" value={data.runs.reduce((sum, run) => sum + (run.summary.resources?.toolCalls ?? 0), 0).toLocaleString('zh-CN')}
            note="Host Bridge 与兼容工具轨迹" tone="muted" />
        </section>

        <section className="eval-overview-grid">
          <VersionTrend runs={trendRuns} suiteName={trendRuns[0]?.suiteName ?? '暂无套件'} />
          <StageAverages values={data.stageAverages} />
          <FailureClusters clusters={data.failureClusters} />
        </section>

        <ComparisonPanel runs={data.runs} />

        <section className="eval-runs-section">
          <div className="eval-section-head">
            <div>
              <h2>运行流水线</h2>
              <p>选择一次运行，查看每个用例的门控、指标与根因。</p>
            </div>
            <span>{data.runs.length} 次运行</span>
          </div>
          {data.runs.length === 0
            ? <EmptyEval onCreate={() => setCreateOpen(true)} />
            : <div className="eval-run-list">
                {data.runs.map((run) => <RunCard key={run.id} run={run} onOpen={() => void selectRun(run.id)} />)}
              </div>}
        </section>
      </>}

      {selectedId && <RunDetailDrawer detail={detail} error={detailError} onClose={() => void selectRun(null)} />}
      <CreateRunDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => { setCreateOpen(false); void refreshDashboard(); void selectRun(id) }}
      />
    </div>
  )
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'muted' | 'primary' | 'destructive' }) {
  return <div className={`eval-kpi eval-kpi-${tone}`}>
    <div className="eval-kpi-label">{label}</div>
    <div className="eval-kpi-value">{value}</div>
    <div className="eval-kpi-note">{note}</div>
  </div>
}

function VersionTrend({ runs, suiteName }: { runs: EvalDashboardRun[]; suiteName: string }) {
  const chronological = [...runs].reverse().slice(-24)
  const width = 720; const height = 196; const left = 42; const right = 18; const top = 18; const bottom = 36
  const x = (index: number) => chronological.length <= 1 ? width / 2 : left + index * ((width - left - right) / (chronological.length - 1))
  const y = (score: number) => top + (1 - score) * (height - top - bottom)
  const path = chronological.map((run, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(run.score).toFixed(1)}`).join(' ')
  return <div className="eval-panel eval-trend-panel">
    <div className="eval-panel-head">
      <div><h2>版本趋势</h2><p>{suiteName}</p></div>
      {chronological.at(-1) && <span className={`eval-status eval-status-${chronological.at(-1)?.status}`}>{chronological.at(-1)?.status === 'pass' ? '当前通过' : '当前未通过'}</span>}
    </div>
    {chronological.length === 0 ? <div className="eval-chart-empty">运行一次评测后，这里会显示版本变化。</div> :
      <svg className="eval-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${suiteName} 版本得分趋势`}>
        {[0, 0.5, 0.8, 1].map((tick) => <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className={tick === 0.8 ? 'eval-grid eval-grid-gate' : 'eval-grid'} />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end">{Math.round(tick * 100)}</text>
        </g>)}
        {chronological.length > 1 && <path d={`${path} L${x(chronological.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="eval-trend-area" />}
        <path d={path} className="eval-trend-line" />
        {chronological.map((run, index) => <g key={run.id}>
          <circle cx={x(index)} cy={y(run.score)} r="5" className={`eval-trend-dot eval-trend-dot-${run.status}`} />
          {(index === 0 || index === chronological.length - 1) && <text x={x(index)} y={height - 10} textAnchor={index === 0 ? 'start' : 'end'} className="eval-trend-label">{run.version}</text>}
          <title>{run.version}: {fmtPercent(run.score, 1)}</title>
        </g>)}
      </svg>}
  </div>
}

function StageAverages({ values }: { values: EvalDashboardPayload['stageAverages'] }) {
  return <div className="eval-panel eval-stage-panel">
    <div className="eval-panel-head"><div><h2>能力分布</h2><p>所选范围的阶段均分</p></div></div>
    <div className="eval-stage-bars">
      {DIMENSIONS.map((stage) => {
        const value = values[stage]
        const label = STAGES.find((item) => item.key === stage)?.label ?? stage
        return <div className="eval-stage-bar" key={stage}>
          <div><span>{label}</span><strong>{fmtPercent(value, 1)}</strong></div>
          <div className="eval-stage-track"><span style={{ width: `${(value ?? 0) * 100}%` }} /></div>
        </div>
      })}
    </div>
  </div>
}

function FailureClusters({ clusters }: { clusters: EvalDashboardPayload['failureClusters'] }) {
  const maximum = Math.max(1, ...clusters.map((item) => item.count))
  return <div className="eval-panel eval-failure-panel">
    <div className="eval-panel-head"><div><h2>失败聚类</h2><p>跨运行、跨 Case 的确定性分类</p></div></div>
    {clusters.length === 0 ? <div className="eval-chart-empty">当前范围没有失败分类。</div> : <div className="eval-failure-clusters">
      {clusters.slice(0, 8).map((cluster) => <div key={cluster.category}>
        <span>{FAILURE_LABELS[cluster.category] ?? cluster.category}</span>
        <div><i style={{ width: `${(cluster.count / maximum) * 100}%` }} /></div>
        <strong>{cluster.count}</strong><small>{cluster.runCount} runs</small>
      </div>)}
    </div>}
  </div>
}

function ComparisonPanel({ runs }: { runs: EvalDashboardRun[] }) {
  const defaultSuite = runs[0]?.suiteKey
  const comparable = runs.filter((run) => run.suiteKey === defaultSuite)
  const [baseId, setBaseId] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [comparison, setComparison] = useState<EvalComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (comparable.length < 2) { setBaseId(''); setCandidateId(''); return }
    if (!comparable.some((run) => run.id === candidateId)) setCandidateId(comparable[0].id)
    if (!comparable.some((run) => run.id === baseId) || baseId === candidateId) {
      setBaseId(comparable.find((run) => run.id !== comparable[0].id)?.id ?? '')
    }
  }, [defaultSuite, runs.length])
  useEffect(() => {
    if (!baseId || !candidateId || baseId === candidateId) { setComparison(null); return }
    let cancelled = false
    setError(null)
    evalApi.comparison(baseId, candidateId)
      .then((payload) => { if (!cancelled) setComparison(payload) })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason)) })
    return () => { cancelled = true }
  }, [baseId, candidateId])
  return <section className="eval-compare-section">
    <div className="eval-section-head"><div><h2>版本对比</h2><p>按 Commit、Prompt、模型、能力与 Case 定位提升或退化。</p></div></div>
    {comparable.length < 2 ? <div className="eval-compare-empty">同一套件至少需要两次运行才能比较。</div> : <>
      <div className="eval-compare-selectors">
        <label><span>基线</span><Select value={baseId} onValueChange={setBaseId}>
          <SelectTrigger><SelectValue placeholder="选择基线" /></SelectTrigger>
          <SelectContent>
            {comparable.filter((run) => run.id !== candidateId).map((run) => (
              <SelectItem value={run.id} key={run.id}>{run.version} · {fmtDate(run.createdAt)}</SelectItem>
            ))}
          </SelectContent>
        </Select></label>
        <span>→</span>
        <label><span>候选</span><Select value={candidateId} onValueChange={setCandidateId}>
          <SelectTrigger><SelectValue placeholder="选择候选" /></SelectTrigger>
          <SelectContent>
            {comparable.filter((run) => run.id !== baseId).map((run) => (
              <SelectItem value={run.id} key={run.id}>{run.version} · {fmtDate(run.createdAt)}</SelectItem>
            ))}
          </SelectContent>
        </Select></label>
      </div>
      {error && <div className="admin-banner-err">{error}</div>}
      {comparison && <ComparisonResult comparison={comparison} />}
    </>}
  </section>
}

function ComparisonResult({ comparison }: { comparison: EvalComparison }) {
  const targetLabel: Record<string, string> = { commitSha: 'Commit', promptVersion: 'Prompt', model: '模型' }
  return <div className="eval-compare-result">
    <div className="eval-target-diff">
      {comparison.targetChanges.map((item) => <div key={item.field}><span>{targetLabel[item.field]}</span><code>{item.base ?? '—'}</code><b>→</b><code>{item.candidate ?? '—'}</code></div>)}
    </div>
    <div className="eval-capability-deltas">
      {comparison.stageDeltas.map((item) => <div className={(item.delta ?? 0) < 0 ? 'is-down' : (item.delta ?? 0) > 0 ? 'is-up' : ''} key={item.stage}>
        <span>{STAGES.find((stage) => stage.key === item.stage)?.label ?? item.stage}</span>
        <strong>{item.delta === null ? '—' : `${item.delta >= 0 ? '+' : ''}${(item.delta * 100).toFixed(1)}pp`}</strong>
        <small>{fmtPercent(item.base)} → {fmtPercent(item.candidate)}</small>
      </div>)}
    </div>
    <div className="eval-case-deltas">
      <div className="eval-case-delta-head"><span>Case</span><span>基线</span><span>候选</span><span>变化</span><span>失败分类变化</span></div>
      {comparison.caseDeltas.map((item) => <div className={`eval-case-delta eval-case-delta-${item.status}`} key={item.caseId}>
        <span><strong>{item.name}</strong><small>{item.caseId}</small></span>
        <span>{fmtPercent(item.base)}</span><span>{fmtPercent(item.candidate)}</span>
        <span>{item.delta === null ? item.status : `${item.delta >= 0 ? '+' : ''}${(item.delta * 100).toFixed(1)}pp`}</span>
        <span>{item.addedFailureCategories.map((category) => <i className="is-added" key={category}>+{FAILURE_LABELS[category] ?? category}</i>)}
          {item.resolvedFailureCategories.map((category) => <i className="is-resolved" key={category}>−{FAILURE_LABELS[category] ?? category}</i>)}
          {!item.addedFailureCategories.length && !item.resolvedFailureCategories.length && '—'}</span>
      </div>)}
    </div>
  </div>
}

function MiniPipeline({ stages, compact = false, onSelect, selected }: {
  stages: Array<{ stage: EvalStageName; status: EvalStageStatus; score: number | null }>
  compact?: boolean
  onSelect?: (stage: EvalStageName) => void
  selected?: EvalStageName | null
}) {
  return <div className={`eval-pipeline${compact ? ' is-compact' : ''}`}>
    {stages.map((stage, index) => {
      const meta = STAGES.find((item) => item.key === stage.stage) ?? { label: stage.stage, short: stage.stage }
      return <div className="eval-pipeline-step-wrap" key={stage.stage}>
        {index > 0 && <div className={`eval-pipeline-link eval-pipeline-link-${stage.status}`} />}
        {onSelect ? <Button variant="ghost" className={`eval-pipeline-step eval-pipeline-step-${stage.status}${selected === stage.stage ? ' is-selected' : ''}`}
          title={`${meta.label}: ${fmtPercent(stage.score, 1)}`} onClick={() => onSelect(stage.stage)}>
          <span className="eval-pipeline-icon">{stage.status === 'pass' ? '✓' : stage.status === 'skipped' ? '–' : '!'}</span>
          <span className="eval-pipeline-label">{meta.short}</span>
          {!compact && <strong>{fmtPercent(stage.score)}</strong>}
        </Button> : <div className={`eval-pipeline-step eval-pipeline-step-${stage.status}`} title={`${meta.label}: ${fmtPercent(stage.score, 1)}`}>
          <span className="eval-pipeline-icon">{stage.status === 'pass' ? '✓' : stage.status === 'skipped' ? '–' : '!'}</span>
          <span className="eval-pipeline-label">{meta.short}</span>
          {!compact && <strong>{fmtPercent(stage.score)}</strong>}
        </div>}
      </div>
    })}
  </div>
}

function RunCard({ run, onOpen }: { run: EvalDashboardRun; onOpen: () => void }) {
  return <Button variant="ghost" className="eval-run-card" onClick={onOpen}>
    <div className="eval-run-card-top">
      <div className={`eval-run-state eval-run-state-${run.status}`}><span />{run.status === 'pass' ? '通过' : run.status === 'error' ? '异常' : '未通过'}</div>
      <div className="eval-run-title"><strong>{run.suiteName}</strong><span>{run.version}</span></div>
      <div className="eval-run-meta"><span>{fmtDate(run.createdAt)}</span><span>{run.source === 'agent-os' ? 'Agent OS 轨迹' : run.source === 'mixed' ? '混合轨迹' : '内联观测'}</span>
        <span>{run.target.model ?? run.target.promptVersion ?? run.target.commitSha?.slice(0, 8) ?? '未标记目标'}</span></div>
      <div className="eval-run-score"><strong>{fmtPercent(run.score, 1)}</strong><span className={run.scoreDelta === null ? '' : run.scoreDelta >= 0 ? 'is-up' : 'is-down'}>
        {run.scoreDelta === null ? '无基线' : `${run.scoreDelta >= 0 ? '↑' : '↓'} ${Math.abs(run.scoreDelta * 100).toFixed(1)}pp`}
      </span></div>
    </div>
    <MiniPipeline stages={summaryPipeline(run)} compact />
    <div className="eval-run-card-foot"><span>{run.passedCases}/{run.caseCount} 用例通过</span><span>{run.failedCases + run.errorCases ? `${run.failedCases + run.errorCases} 个失败用例待查看` : '所有门控正常'}</span><span className="eval-open-detail">查看详情 →</span></div>
  </Button>
}

function RunDetailDrawer({ detail, error, onClose }: { detail: EvalRunDetail | null; error: string | null; onClose: () => void }) {
  const [caseId, setCaseId] = useState<string | null>(null)
  useEffect(() => { setCaseId(detail?.cases[0]?.id ?? null) }, [detail?.id])
  const selected = detail?.cases.find((item) => item.id === caseId) ?? detail?.cases[0]
  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent className="eval-drawer w-full overflow-y-auto sm:max-w-4xl" aria-label="评测运行详情">
      <SheetHeader className="eval-drawer-head">
        <div>
          <span>运行详情</span>
          <SheetTitle>{detail?.suiteName ?? '正在加载…'}</SheetTitle>
          <SheetDescription>{detail ? `${detail.version} · ${fmtDate(detail.createdAt)}` : '正在加载评测运行详情'}</SheetDescription>
        </div>
      </SheetHeader>
      {error ? <div className="admin-banner-err">{error}</div> : !detail ? <EvalSkeleton compact /> : <>
        <div className="eval-detail-target"><span>Commit <code>{detail.target.commitSha?.slice(0, 12) ?? '—'}</code></span>
          <span>Prompt <code>{detail.target.promptVersion ?? '—'}</code></span><span>模型 <code>{detail.target.model ?? '—'}</code></span></div>
        <div className="eval-detail-summary">
          <div><span>综合得分</span><strong>{fmtPercent(detail.score, 1)}</strong></div>
          <div><span>通过用例</span><strong>{detail.passedCases}/{detail.caseCount}</strong></div>
          <div><span>版本变化</span><strong className={(detail.scoreDelta ?? 0) < 0 ? 'is-down' : 'is-up'}>{detail.scoreDelta === null ? '—' : `${detail.scoreDelta >= 0 ? '+' : ''}${(detail.scoreDelta * 100).toFixed(1)}pp`}</strong></div>
          <div><span>平均延迟</span><strong>{detail.summary.resources.averageLatencyMs === null ? '—' : `${Math.round(detail.summary.resources.averageLatencyMs)}ms`}</strong></div>
          <div><span>Token / 成本</span><strong>{detail.summary.resources.totalTokens.toLocaleString('zh-CN')} / ${detail.summary.resources.totalCostUsd.toFixed(4)}</strong></div>
          <div><span>模型 / IPython</span><strong>{detail.summary.resources.modelCalls} / {detail.summary.resources.ipythonCells}</strong></div>
        </div>
        <div className="eval-case-tabs">
          {detail.cases.map((item) => <Button variant="ghost" key={item.id} className={item.id === selected?.id ? 'is-active' : ''} onClick={() => setCaseId(item.id)}>
            <span className={`eval-case-dot eval-case-dot-${item.status}`} />{item.name}<strong>{fmtPercent(item.score)}</strong>
          </Button>)}
        </div>
        {selected && <CaseDetail item={selected} />}
      </>}
    </SheetContent>
  </Sheet>
}

function CaseDetail({ item }: { item: EvalCaseDetail }) {
  const [expandedStage, setExpandedStage] = useState<EvalStageName | null>(item.stages.find((stage) => stage.status === 'fail' || stage.status === 'error')?.stage ?? null)
  useEffect(() => { setExpandedStage(item.stages.find((stage) => stage.status === 'fail' || stage.status === 'error')?.stage ?? null) }, [item.id])
  return <div className="eval-case-detail">
    <div className="eval-case-ident"><div><span>CASE</span><strong>{item.caseId}</strong></div>{item.sourceAgentRunId && <code>{item.sourceAgentRunId}</code>}</div>
    <MiniPipeline stages={item.stages.map((stage) => ({ stage: stage.stage, status: stage.status, score: stage.score }))}
      selected={expandedStage} onSelect={setExpandedStage} />
    <TraceTimeline trace={(item.observation.trace as EvalTraceEvent[] | undefined) ?? []} />
    {item.failureReasons.length > 0 && <div className="eval-root-causes">
      <h3>失败原因</h3>
      <ul>{item.failureReasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>
    </div>}
    <div className="eval-stage-details">
      <h3>阶段检查</h3>
      {item.stages.map((stage) => <StageDisclosure key={stage.stage} stage={stage} open={expandedStage === stage.stage} onToggle={() => setExpandedStage((current) => current === stage.stage ? null : stage.stage)} />)}
    </div>
  </div>
}

function TraceTimeline({ trace }: { trace: EvalTraceEvent[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(trace.find((event) => event.status === 'failed')?.id ?? trace[0]?.id ?? null)
  useEffect(() => { setSelectedId(trace.find((event) => event.status === 'failed')?.id ?? trace[0]?.id ?? null) }, [trace])
  const selected = trace.find((event) => event.id === selectedId) ?? trace[0]
  if (!trace.length) return <div className="eval-trace-empty">此观测没有真实运行 Trace；固定 suite 可通过 observation.trace 提供。</div>
  return <section className="eval-trace-section">
    <div className="eval-trace-head"><div><span>AGENT TRACE</span><h3>真实执行链路</h3></div><small>{trace.length} 个事件 · 节点可下钻</small></div>
    <div className="eval-trace-flow">
      {trace.map((event, index) => <div className="eval-trace-node-wrap" key={event.id}>
        {index > 0 && <i />}
        <Button variant="ghost" className={`eval-trace-node eval-trace-node-${event.status}${selected?.id === event.id ? ' is-selected' : ''}`}
          onClick={() => setSelectedId(event.id)} title={event.label}>
          <span>{traceIcon(event.kind)}</span><strong>{event.label}</strong>
          <small>{event.durationMs === undefined ? event.kind : formatDuration(event.durationMs)}</small>
        </Button>
      </div>)}
    </div>
    {selected && <div className="eval-trace-inspector">
      <div className="eval-trace-inspector-head"><div><span>{selected.kind.replace('_', ' ')}</span><h4>{selected.label}</h4></div>
        <strong className={`eval-trace-state eval-trace-state-${selected.status}`}>{selected.status}</strong></div>
      <div className="eval-trace-facts">
        {selected.agentId && <span>Agent <code>{selected.agentId}</code></span>}
        {selected.hop && <span>Hop <code>{selected.hop}</code></span>}
        {selected.cellId && <span>Cell <code>{selected.cellId}</code></span>}
        {selected.action && <span>Action <code>{selected.action}</code></span>}
        {selected.durationMs !== undefined && <span>耗时 <code>{formatDuration(selected.durationMs)}</code></span>}
      </div>
      <div className="eval-trace-json-grid">
        {selected.input !== undefined && <div><span>输入 / 参数</span><pre>{prettyJson(selected.input)}</pre></div>}
        {selected.output !== undefined && <div><span>输出 / 结果</span><pre>{prettyJson(selected.output)}</pre></div>}
        {selected.metadata && Object.keys(selected.metadata).length > 0 && <div><span>Trace metadata</span><pre>{prettyJson(selected.metadata)}</pre></div>}
      </div>
    </div>}
  </section>
}

function traceIcon(kind: EvalTraceEvent['kind']): string {
  return ({ input: '↪', decision: '◇', model: 'M', ipython: 'Py', host_action: 'H', approval: 'A', canvas: 'C', answer: '✓' })[kind]
}

function formatDuration(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s` : `${Math.round(value)}ms`
}

function prettyJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

function StageDisclosure({ stage, open, onToggle }: { stage: EvalStageResult; open: boolean; onToggle: () => void }) {
  const meta = STAGES.find((item) => item.key === stage.stage)
  return <div className={`eval-disclosure eval-disclosure-${stage.status}`}>
    <Button variant="ghost" onClick={onToggle} aria-expanded={open}>
      <span className="eval-disclosure-icon">{stage.status === 'pass' ? '✓' : stage.status === 'skipped' ? '–' : '!'}</span>
      <span><strong>{meta?.label ?? stage.stage}</strong><small>{stage.failureReason ?? `${stage.findings.filter((item) => item.status === 'pass').length} 项检查通过`} · 真实耗时 {formatDuration(stage.durationMs)}</small></span>
      <span>{fmtPercent(stage.score, 1)}</span><b>{open ? '−' : '+'}</b>
    </Button>
    {open && <div className="eval-findings">
      {stage.findings.map((item, index) => <div key={`${item.checkId}-${index}`} className={`eval-finding eval-finding-${item.status}`}>
        <span>{item.status === 'pass' ? '✓' : item.status === 'not_observed' ? '○' : '×'}</span>
        <div><code>{item.checkId}</code><p>{item.message}</p></div>
      </div>)}
      {Object.keys(stage.metrics).length > 0 && <div className="eval-metrics">
        {Object.entries(stage.metrics).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value === null ? '—' : String(value)}</strong></div>)}
      </div>}
    </div>}
  </div>
}

function CreateRunDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  const [value, setValue] = useState(() => JSON.stringify(RUN_TEMPLATE, null, 2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setValue(JSON.stringify(RUN_TEMPLATE, null, 2))
    setError(null)
  }, [open])
  const submit = async () => {
    setError(null)
    let parsed: EvalCreateRunRequest
    try { parsed = JSON.parse(value) as EvalCreateRunRequest } catch (reason) { setError(`JSON 格式错误：${errorMessage(reason)}`); return }
    setSubmitting(true)
    try {
      const created = await toastAction(evalApi.createRun(parsed), {
        loading: '正在运行 Agent Eval',
        success: 'Agent Eval 已完成并写入不可变报告',
        error: 'Agent Eval 运行失败',
      })
      onCreated(created.id)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally { setSubmitting(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
    <DialogContent
      className="max-h-[calc(100vh-2rem)] overflow-hidden sm:max-w-4xl"
      onEscapeKeyDown={(event) => { if (submitting) event.preventDefault() }}
      onInteractOutside={(event) => { if (submitting) event.preventDefault() }}
    >
      <DialogHeader>
        <span className="text-xs font-medium tracking-widest text-muted-foreground">NEW EVAL RUN</span>
        <DialogTitle>运行评测套件</DialogTitle>
        <DialogDescription>粘贴观测 JSON，或填写 Agent OS runId 自动回填真实轨迹。</DialogDescription>
      </DialogHeader>
      <div className="eval-dialog-help"><span>支持的层</span>{DIMENSIONS.map((dimension) => <code key={dimension}>{dimension}</code>)}<em>期望值只进入评测器，不会发送给 Agent。</em></div>
      {error && <div className="admin-banner-err">{error}</div>}
      <Textarea
        className="eval-json-input min-h-80 resize-none font-mono"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        spellCheck={false}
        aria-label="Eval run JSON"
      />
      <DialogFooter className="items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">最多 100 个用例；报告写入后不可变。</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
          <Button onClick={() => void submit()} disabled={submitting}>{submitting ? '评测中…' : '开始运行'}</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function EmptyEval({ onCreate }: { onCreate: () => void }) {
  return <div className="eval-empty"><div>◎</div><h3>还没有评测运行</h3><p>从一个 Agent OS runId 开始，系统会自动采集输入、模型、IPython、Host Bridge、Approval、Canvas 与最终回答轨迹。</p><Button onClick={onCreate}>运行第一次评测</Button></div>
}

function EvalSkeleton({ compact = false }: { compact?: boolean }) {
  return <ResourceSkeleton
    variant={compact ? 'detail' : 'cards'}
    count={compact ? 1 : 4}
    label={compact ? '正在加载评测详情' : '正在加载评测运行'}
  />
}
import '../eval.css'
