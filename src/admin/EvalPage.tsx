import { useEffect, useMemo, useState } from 'react'
import {
  adminApi,
  type EvalCaseDetail,
  type EvalCreateRunRequest,
  type EvalDashboardPayload,
  type EvalDashboardRun,
  type EvalRunDetail,
  type EvalStageName,
  type EvalStageResult,
  type EvalStageStatus,
} from './api'

const STAGES: Array<{ key: EvalStageName; label: string; short: string }> = [
  { key: 'ingest', label: '轨迹采集', short: '采集' },
  { key: 'answer', label: '回答质量', short: '回答' },
  { key: 'rag', label: 'RAG', short: 'RAG' },
  { key: 'tools', label: '工具调用', short: '工具' },
  { key: 'collaboration', label: '多 Agent', short: '协作' },
  { key: 'aggregate', label: '门控汇总', short: '汇总' },
]

const STAGE_THRESHOLDS: Partial<Record<EvalStageName, number>> = {
  answer: 0.75,
  rag: 0.75,
  tools: 1,
  collaboration: 0.8,
}

const RUN_TEMPLATE: EvalCreateRunRequest = {
  schemaVersion: 'lingxiloop.eval.v1',
  suiteKey: 'agent-regression',
  suiteName: 'Agent 回归套件',
  version: 'v1.0.0',
  passThreshold: 0.8,
  cases: [{
    caseId: 'grounded-answer',
    name: '基于知识库回答并调用工具',
    sourceAgentRunId: '请替换为 Agent OS runId',
    expectations: {
      requiredStages: ['answer', 'rag', 'tools'],
      answer: {
        requiredKeywords: ['结论'],
        forbiddenPatterns: ['我不知道但我猜'],
        maxLatencyMs: 15000,
        maxTokens: 4000,
      },
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
    if (score === null) return { stage: key, status: 'skipped', score: null }
    return { stage: key, status: score >= (STAGE_THRESHOLDS[key] ?? 1) ? 'pass' : 'fail', score }
  })
}

export function EvalPage() {
  const [data, setData] = useState<EvalDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinceDays, setSinceDays] = useState(90)
  const [suiteFilter, setSuiteFilter] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EvalRunDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!data) setLoading(true)
    setError(null)
    adminApi.evalDashboard({ sinceDays, suiteKey: suiteFilter || undefined, limit: 120 })
      .then((payload) => { if (!cancelled) setData(payload) })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason)) })
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false) } })
    return () => { cancelled = true }
  }, [sinceDays, suiteFilter, refreshKey])

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(null); return }
    let cancelled = false
    setDetail(null); setDetailError(null)
    adminApi.evalRun(selectedId)
      .then((payload) => { if (!cancelled) setDetail(payload) })
      .catch((reason) => { if (!cancelled) setDetailError(errorMessage(reason)) })
    return () => { cancelled = true }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId && !createOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (createOpen) setCreateOpen(false)
      else setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, createOpen])

  const suites = useMemo(() => {
    const names = new Map<string, string>()
    for (const run of data?.runs ?? []) names.set(run.suiteKey, run.suiteName)
    return [...names.entries()].sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'))
  }, [data])
  const trendSuite = suiteFilter || data?.runs[0]?.suiteKey || ''
  const trendRuns = (data?.runs ?? []).filter((run) => run.suiteKey === trendSuite)

  const refresh = () => { setRefreshing(true); setRefreshKey((value) => value + 1) }

  return (
    <div className="admin-page eval-page">
      <header className="admin-page-head eval-page-head">
        <div>
          <div className="eval-eyebrow">QUALITY CONTROL</div>
          <h1 className="admin-h1">Agent Eval</h1>
          <div className="admin-sub">回答、RAG、工具调用与多 Agent 协作的确定性回归评测</div>
        </div>
        <div className="eval-head-actions">
          <button className="btn-ghost" disabled={refreshing} onClick={refresh}>{refreshing ? '刷新中…' : '刷新'}</button>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>运行评测</button>
        </div>
      </header>

      <div className="eval-filterbar">
        <label>
          <span>套件</span>
          <select className="admin-select admin-select-sm" value={suiteFilter} onChange={(event) => setSuiteFilter(event.target.value)}>
            <option value="">全部套件</option>
            {suites.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label>
          <span>时间范围</span>
          <select className="admin-select admin-select-sm" value={sinceDays} onChange={(event) => setSinceDays(Number(event.target.value))}>
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
            <option value={365}>最近 1 年</option>
          </select>
        </label>
        <div className="eval-filter-note">结果不可变 · 缺失阶段不会被当作通过</div>
      </div>

      {error && <div className="admin-banner-err">{error}</div>}
      {loading && !data ? <EvalSkeleton /> : data && <>
        <section className="eval-kpis" aria-label="评测概览">
          <Kpi label="运行次数" value={String(data.summary.totalRuns)} note={`${data.summary.suites} 个评测套件`} tone="ink" />
          <Kpi label="通过率" value={fmtPercent(data.summary.passRate)} note={`${data.summary.failedRuns} 次未通过`} tone={data.summary.failedRuns ? 'coral' : 'green'} />
          <Kpi label="平均得分" value={fmtPercent(data.summary.averageScore, 1)} note="仅统计已观测检查项" tone="sky" />
          <Kpi label="最新变化" value={data.runs[0]?.scoreDelta === null || data.runs[0]?.scoreDelta === undefined
            ? '—' : `${data.runs[0].scoreDelta >= 0 ? '+' : ''}${(data.runs[0].scoreDelta * 100).toFixed(1)}pp`}
            note={data.runs[0] ? `${data.runs[0].suiteName} · ${data.runs[0].version}` : '暂无基线'}
            tone={(data.runs[0]?.scoreDelta ?? 0) < 0 ? 'coral' : 'green'} />
        </section>

        <section className="eval-overview-grid">
          <VersionTrend runs={trendRuns} suiteName={trendRuns[0]?.suiteName ?? '暂无套件'} />
          <StageAverages values={data.stageAverages} />
        </section>

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
                {data.runs.map((run) => <RunCard key={run.id} run={run} onOpen={() => setSelectedId(run.id)} />)}
              </div>}
        </section>
      </>}

      {selectedId && <RunDetailDrawer detail={detail} error={detailError} onClose={() => setSelectedId(null)} />}
      {createOpen && <CreateRunDialog
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => { setCreateOpen(false); refresh(); setSelectedId(id) }}
      />}
    </div>
  )
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'ink' | 'sky' | 'green' | 'coral' }) {
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
      {(['answer', 'rag', 'tools', 'collaboration'] as const).map((stage) => {
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

function MiniPipeline({ stages, compact = false }: {
  stages: Array<{ stage: EvalStageName; status: EvalStageStatus; score: number | null }>
  compact?: boolean
}) {
  return <div className={`eval-pipeline${compact ? ' is-compact' : ''}`}>
    {stages.map((stage, index) => {
      const meta = STAGES.find((item) => item.key === stage.stage) ?? { label: stage.stage, short: stage.stage }
      return <div className="eval-pipeline-step-wrap" key={stage.stage}>
        {index > 0 && <div className={`eval-pipeline-link eval-pipeline-link-${stage.status}`} />}
        <div className={`eval-pipeline-step eval-pipeline-step-${stage.status}`} title={`${meta.label}: ${fmtPercent(stage.score, 1)}`}>
          <span className="eval-pipeline-icon">{stage.status === 'pass' ? '✓' : stage.status === 'skipped' ? '–' : '!'}</span>
          <span className="eval-pipeline-label">{meta.short}</span>
          {!compact && <strong>{fmtPercent(stage.score)}</strong>}
        </div>
      </div>
    })}
  </div>
}

function RunCard({ run, onOpen }: { run: EvalDashboardRun; onOpen: () => void }) {
  return <button className="eval-run-card" onClick={onOpen}>
    <div className="eval-run-card-top">
      <div className={`eval-run-state eval-run-state-${run.status}`}><span />{run.status === 'pass' ? '通过' : run.status === 'error' ? '异常' : '未通过'}</div>
      <div className="eval-run-title"><strong>{run.suiteName}</strong><span>{run.version}</span></div>
      <div className="eval-run-meta"><span>{fmtDate(run.createdAt)}</span><span>{run.source === 'agent-os' ? 'Agent OS 轨迹' : run.source === 'mixed' ? '混合轨迹' : '内联观测'}</span></div>
      <div className="eval-run-score"><strong>{fmtPercent(run.score, 1)}</strong><span className={run.scoreDelta === null ? '' : run.scoreDelta >= 0 ? 'is-up' : 'is-down'}>
        {run.scoreDelta === null ? '无基线' : `${run.scoreDelta >= 0 ? '↑' : '↓'} ${Math.abs(run.scoreDelta * 100).toFixed(1)}pp`}
      </span></div>
    </div>
    <MiniPipeline stages={summaryPipeline(run)} compact />
    <div className="eval-run-card-foot"><span>{run.passedCases}/{run.caseCount} 用例通过</span><span>{run.failedCases + run.errorCases ? `${run.failedCases + run.errorCases} 个失败用例待查看` : '所有门控正常'}</span><span className="eval-open-detail">查看详情 →</span></div>
  </button>
}

function RunDetailDrawer({ detail, error, onClose }: { detail: EvalRunDetail | null; error: string | null; onClose: () => void }) {
  const [caseId, setCaseId] = useState<string | null>(null)
  useEffect(() => { setCaseId(detail?.cases[0]?.id ?? null) }, [detail?.id])
  const selected = detail?.cases.find((item) => item.id === caseId) ?? detail?.cases[0]
  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="eval-drawer" aria-label="评测运行详情">
      <div className="eval-drawer-head">
        <div><span>运行详情</span><h2>{detail?.suiteName ?? '正在加载…'}</h2>{detail && <p>{detail.version} · {fmtDate(detail.createdAt)}</p>}</div>
        <button onClick={onClose} aria-label="关闭">×</button>
      </div>
      {error ? <div className="admin-banner-err">{error}</div> : !detail ? <EvalSkeleton compact /> : <>
        <div className="eval-detail-summary">
          <div><span>综合得分</span><strong>{fmtPercent(detail.score, 1)}</strong></div>
          <div><span>通过用例</span><strong>{detail.passedCases}/{detail.caseCount}</strong></div>
          <div><span>版本变化</span><strong className={(detail.scoreDelta ?? 0) < 0 ? 'is-down' : 'is-up'}>{detail.scoreDelta === null ? '—' : `${detail.scoreDelta >= 0 ? '+' : ''}${(detail.scoreDelta * 100).toFixed(1)}pp`}</strong></div>
        </div>
        <div className="eval-case-tabs">
          {detail.cases.map((item) => <button key={item.id} className={item.id === selected?.id ? 'is-active' : ''} onClick={() => setCaseId(item.id)}>
            <span className={`eval-case-dot eval-case-dot-${item.status}`} />{item.name}<strong>{fmtPercent(item.score)}</strong>
          </button>)}
        </div>
        {selected && <CaseDetail item={selected} />}
      </>}
    </aside>
  </div>
}

function CaseDetail({ item }: { item: EvalCaseDetail }) {
  const [expandedStage, setExpandedStage] = useState<EvalStageName | null>(item.stages.find((stage) => stage.status === 'fail' || stage.status === 'error')?.stage ?? null)
  useEffect(() => { setExpandedStage(item.stages.find((stage) => stage.status === 'fail' || stage.status === 'error')?.stage ?? null) }, [item.id])
  return <div className="eval-case-detail">
    <div className="eval-case-ident"><div><span>CASE</span><strong>{item.caseId}</strong></div>{item.sourceAgentRunId && <code>{item.sourceAgentRunId}</code>}</div>
    <MiniPipeline stages={item.stages.map((stage) => ({ stage: stage.stage, status: stage.status, score: stage.score }))} />
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

function StageDisclosure({ stage, open, onToggle }: { stage: EvalStageResult; open: boolean; onToggle: () => void }) {
  const meta = STAGES.find((item) => item.key === stage.stage)
  return <div className={`eval-disclosure eval-disclosure-${stage.status}`}>
    <button onClick={onToggle} aria-expanded={open}>
      <span className="eval-disclosure-icon">{stage.status === 'pass' ? '✓' : stage.status === 'skipped' ? '–' : '!'}</span>
      <span><strong>{meta?.label ?? stage.stage}</strong><small>{stage.failureReason ?? `${stage.findings.filter((item) => item.status === 'pass').length} 项检查通过`}</small></span>
      <span>{fmtPercent(stage.score, 1)}</span><b>{open ? '−' : '+'}</b>
    </button>
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

function CreateRunDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [value, setValue] = useState(() => JSON.stringify(RUN_TEMPLATE, null, 2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setError(null)
    let parsed: EvalCreateRunRequest
    try { parsed = JSON.parse(value) as EvalCreateRunRequest } catch (reason) { setError(`JSON 格式错误：${errorMessage(reason)}`); return }
    setSubmitting(true)
    try {
      const created = await adminApi.createEvalRun(parsed)
      onCreated(created.id)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally { setSubmitting(false) }
  }
  return <div className="eval-overlay eval-dialog-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <div className="eval-dialog" role="dialog" aria-modal="true" aria-label="运行 Agent Eval">
      <div className="eval-dialog-head"><div><span>NEW EVAL RUN</span><h2>运行评测套件</h2><p>粘贴观测 JSON，或填写 Agent OS runId 自动回填真实轨迹。</p></div><button onClick={onClose} disabled={submitting}>×</button></div>
      <div className="eval-dialog-help"><span>支持的层</span><code>answer</code><code>rag</code><code>tools</code><code>collaboration</code><em>期望值只进入评测器，不会发送给 Agent。</em></div>
      {error && <div className="admin-banner-err">{error}</div>}
      <textarea className="eval-json-input" value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} aria-label="Eval run JSON" />
      <div className="eval-dialog-foot"><span>最多 100 个用例；报告写入后不可变。</span><div><button className="btn-ghost" onClick={onClose} disabled={submitting}>取消</button><button className="btn-primary" onClick={() => void submit()} disabled={submitting}>{submitting ? '评测中…' : '开始运行'}</button></div></div>
    </div>
  </div>
}

function EmptyEval({ onCreate }: { onCreate: () => void }) {
  return <div className="eval-empty"><div>◎</div><h3>还没有评测运行</h3><p>从一个 Agent OS runId 开始，系统会自动采集回答、RAG、工具与协作轨迹。</p><button className="btn-primary" onClick={onCreate}>运行第一次评测</button></div>
}

function EvalSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className={`eval-skeleton${compact ? ' is-compact' : ''}`}><span /><span /><span /><span /></div>
}
