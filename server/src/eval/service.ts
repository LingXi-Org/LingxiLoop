import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import type {
  EvalAgentTurnObservation,
  EvalApprovalObservation,
  EvalCaseReport,
  EvalCitationObservation,
  EvalObservation,
  EvalRunInput,
  EvalRunReport,
  EvalStageResult,
  EvalToolCallObservation,
  EvalTraceEvent,
} from './contracts.js'
import { EVAL_DIMENSIONS } from './contracts.js'
import { evaluateRun } from './evaluator.js'
import {
  dedupeCitations,
  extractKnowledgeCitations,
  sanitizeHostActionArgs,
  sanitizeHostActionResult,
} from './trace.js'

interface AgentRunSourceRow {
  id: string
  agent_id: string
  status: string
  run_error: string | null
  result_text: string | null
  canvas_id: string | null
  reason: string | null
  lane: string | null
  trigger_client_msg_no: string | null
  started_at: string
  finished_at: string | null
  latency_ms: string | number | null
  input_tokens: number
  cached_input_tokens: number
  cache_creation_tokens: number
  output_tokens: number
  model: string | null
}

interface AgentEventRow {
  id: string
  kind: string
  data: Record<string, unknown>
  created_at: string
  sequence: number | null
}

interface HostActionRow {
  idempotency_key: string
  action: string
  args: unknown
  result: unknown
  status: string
  error: string | null
  approval_id: string | null
  cell_id: string
  call_index: number
  created_at: string
  updated_at: string
}

interface ApprovalRow {
  id: string
  action: string
  status: string
  requested_at: string
  resolved_at: string | null
}

interface DashboardRunRow {
  id: string
  suite_key: string
  suite_name: string
  version: string
  commit_sha: string | null
  prompt_version: string | null
  model: string | null
  baseline_run_id: string | null
  status: string
  score: number
  pass_threshold: number
  case_count: number
  passed_cases: number
  failed_cases: number
  error_cases: number
  source: string
  summary: EvalRunReport['summary']
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
  finished_at: string
  previous_score: number | null
  explicit_baseline_score: number | null
}

export interface EvalDashboardRun {
  id: string
  suiteKey: string
  suiteName: string
  version: string
  target: { commitSha?: string; promptVersion?: string; model?: string }
  baselineRunId: string | null
  status: string
  score: number
  passThreshold: number
  caseCount: number
  passedCases: number
  failedCases: number
  errorCases: number
  source: string
  summary: EvalRunReport['summary']
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  finishedAt: string
  baselineScore: number | null
  scoreDelta: number | null
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeRunSummary(value: unknown): EvalRunReport['summary'] {
  const summary = jsonRecord(value)
  const rawStages = jsonRecord(summary.stageScores)
  const rawStageStatuses = jsonRecord(summary.stageStatuses)
  const rawResources = jsonRecord(summary.resources)
  const stageScores = Object.fromEntries(EVAL_DIMENSIONS.map((stage) => [stage,
    typeof rawStages[stage] === 'number' ? rawStages[stage] : null])) as EvalRunReport['summary']['stageScores']
  return {
    caseCount: finiteNumber(summary.caseCount) ?? 0,
    passedCases: finiteNumber(summary.passedCases) ?? 0,
    failedCases: finiteNumber(summary.failedCases) ?? 0,
    errorCases: finiteNumber(summary.errorCases) ?? 0,
    stageScores,
    stageStatuses: Object.fromEntries(EVAL_DIMENSIONS.map((stage) => {
      const persisted = rawStageStatuses[stage]
      return [stage, ['pass', 'fail', 'skipped', 'error'].includes(String(persisted))
        ? persisted : stageScores[stage] === null ? 'skipped' : 'pass']
    })) as EvalRunReport['summary']['stageStatuses'],
    failureCategories: Object.fromEntries(Object.entries(jsonRecord(summary.failureCategories))
      .flatMap(([category, count]) => typeof count === 'number' ? [[category, count]] : [])),
    resources: {
      averageLatencyMs: finiteNumber(rawResources.averageLatencyMs) ?? null,
      totalTokens: finiteNumber(rawResources.totalTokens) ?? 0,
      totalCostUsd: finiteNumber(rawResources.totalCostUsd) ?? 0,
      modelCalls: finiteNumber(rawResources.modelCalls) ?? 0,
      ipythonCells: finiteNumber(rawResources.ipythonCells) ?? 0,
      toolCalls: finiteNumber(rawResources.toolCalls) ?? 0,
    },
  }
}

function elapsedMs(startedAt?: string | null, finishedAt?: string | null): number {
  if (!startedAt || !finishedAt) return 0
  const duration = Date.parse(finishedAt) - Date.parse(startedAt)
  return Number.isFinite(duration) ? Math.max(0, duration) : 0
}

function buildAgentTrace(args: {
  run: AgentRunSourceRow
  events: AgentEventRow[]
  hostActions: HostActionRow[]
  approvals: ApprovalRow[]
  canvasEvents: EvalTraceEvent[]
}): EvalTraceEvent[] {
  const { run, events, hostActions, approvals, canvasEvents } = args
  const inputEvent = events.find((event) => event.kind === 'input.loaded')
  const inputData = jsonRecord(inputEvent?.data)
  const trace: EvalTraceEvent[] = [{
    id: inputEvent?.id ?? `${run.id}:input`,
    kind: 'input',
    label: '测试输入',
    status: 'completed',
    startedAt: inputEvent?.created_at ?? run.started_at,
    input: typeof inputData.text === 'string' ? { text: inputData.text } : {
      triggerClientMsgNo: run.trigger_client_msg_no, reason: run.reason, lane: run.lane,
    },
  }, {
    id: `${run.id}:route`,
    kind: 'decision',
    label: `Agent 路由 · ${run.reason ?? 'unknown'}`,
    status: 'completed',
    startedAt: run.started_at,
    agentId: run.agent_id,
    metadata: { lane: run.lane ?? 'unknown' },
  }]

  const modelStarts = new Map<number, AgentEventRow>()
  const ipythonStarts = new Map<string, AgentEventRow>()
  for (const event of events) {
    const data = jsonRecord(event.data)
    if (event.kind === 'model.started') {
      const hop = finiteNumber(data.hop) ?? 0
      modelStarts.set(hop, event)
      continue
    }
    if (event.kind === 'model.completed') {
      const hop = finiteNumber(data.hop) ?? 0
      const started = modelStarts.get(hop)
      trace.push({
        id: event.id,
        kind: 'model',
        label: `模型调用 · Hop ${hop || '?'}`,
        status: 'completed',
        startedAt: started?.created_at ?? event.created_at,
        finishedAt: event.created_at,
        durationMs: elapsedMs(started?.created_at, event.created_at),
        hop: hop || undefined,
        agentId: run.agent_id,
        output: {
          usage: jsonRecord(data.usage),
          diagnostics: sanitizeHostActionResult('model.diagnostics', data.diagnostics),
        },
      })
      continue
    }
    if (event.kind === 'ipython.started') {
      const callId = typeof data.callId === 'string' ? data.callId : event.id
      ipythonStarts.set(callId, event)
      trace.push({
        id: `${event.id}:decision`,
        kind: 'decision',
        label: 'Agent 决定执行 IPython',
        status: 'completed',
        startedAt: event.created_at,
        agentId: run.agent_id,
        input: { codePreview: typeof data.codePreview === 'string' ? data.codePreview.slice(0, 240) : '' },
      })
      continue
    }
    if (event.kind === 'ipython.completed' || event.kind === 'ipython.timeout') {
      const callId = typeof data.callId === 'string' ? data.callId : event.id
      const started = ipythonStarts.get(callId)
      trace.push({
        id: event.id,
        kind: 'ipython',
        label: event.kind === 'ipython.timeout' ? 'IPython 执行超时' : 'IPython Cell',
        status: event.kind === 'ipython.timeout' ? 'failed' : 'completed',
        startedAt: started?.created_at ?? event.created_at,
        finishedAt: event.created_at,
        durationMs: finiteNumber(data.durationMs) ?? elapsedMs(started?.created_at, event.created_at),
        agentId: run.agent_id,
        cellId: callId,
        input: { codePreview: String(jsonRecord(started?.data).codePreview ?? '').slice(0, 240) },
        output: { truncated: data.truncated === true, ...(data.timeoutMs ? { timeoutMs: data.timeoutMs } : {}) },
      })
      continue
    }
    if (event.kind === 'knowledge.context.loaded') {
      const rawCitations = Array.isArray(data.citations) ? data.citations : []
      trace.push({
        id: event.id,
        kind: 'host_action',
        action: 'knowledge.context',
        label: 'RAG 自动检索',
        status: data.ingestionFailure ? 'failed' : 'completed',
        finishedAt: event.created_at,
        durationMs: finiteNumber(data.durationMs) ?? 0,
        agentId: run.agent_id,
        output: { citations: dedupeCitations(rawCitations.flatMap((item) => {
          const citation = jsonRecord(item)
          return typeof citation.sourceId === 'string' ? [{
            sourceId: citation.sourceId,
            ...(typeof citation.chunkId === 'string' ? { chunkId: citation.chunkId } : {}),
            ...(typeof citation.marker === 'string' ? { marker: citation.marker } : {}),
            ...(typeof citation.title === 'string' ? { title: citation.title } : {}),
          }] : []
        })) },
      })
    }
  }

  for (const action of hostActions) trace.push({
    id: action.idempotency_key,
    kind: 'host_action',
    label: `Host Bridge · ${action.action}`,
    action: action.action,
    status: action.status === 'succeeded' ? 'completed' : action.status === 'failed' ? 'failed' : 'pending',
    startedAt: action.created_at,
    finishedAt: action.updated_at,
    durationMs: elapsedMs(action.created_at, action.updated_at),
    agentId: run.agent_id,
    cellId: action.cell_id,
    input: sanitizeHostActionArgs(action.action, action.args),
    output: action.error ? { error: action.error.slice(0, 500) } : sanitizeHostActionResult(action.action, action.result),
    metadata: { callIndex: action.call_index, ...(action.approval_id ? { approvalId: action.approval_id } : {}) },
  })
  for (const approval of approvals) trace.push({
    id: approval.id,
    kind: 'approval',
    label: `Approval · ${approval.action}`,
    action: approval.action,
    status: approval.status === 'pending' ? 'pending' : approval.status === 'approved' ? 'completed' : 'failed',
    startedAt: approval.requested_at,
    finishedAt: approval.resolved_at ?? undefined,
    durationMs: elapsedMs(approval.requested_at, approval.resolved_at),
    agentId: run.agent_id,
    metadata: { resolution: approval.status },
  })
  trace.push(...canvasEvents)
  trace.push({
    id: `${run.id}:answer`,
    kind: 'answer',
    label: '最终回答',
    status: run.run_error ? 'failed' : run.result_text ? 'completed' : 'skipped',
    startedAt: run.started_at,
    finishedAt: run.finished_at ?? undefined,
    durationMs: finiteNumber(run.latency_ms) ?? 0,
    agentId: run.agent_id,
    output: run.result_text ? { answer: run.result_text.slice(0, 1_000) } : run.run_error ? { error: run.run_error } : {},
  })
  return trace.sort((left, right) => {
    const leftTime = Date.parse(left.startedAt ?? left.finishedAt ?? '')
    const rightTime = Date.parse(right.startedAt ?? right.finishedAt ?? '')
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
  })
}

async function loadAgentRunObservation(runId: string): Promise<EvalObservation> {
  const { rows } = await pool.query<AgentRunSourceRow>(
    `SELECT r.id, r.agent_id, COALESCE(w.status, r.status) AS status, COALESCE(w.error, r.error) AS run_error,
            w.result_text, w.canvas_id, w.reason, w.lane, w.trigger_client_msg_no,
            COALESCE(w.lease_started_at, r.started_at) AS started_at,
            COALESCE(w.finished_at, r.finished_at, r.updated_at) AS finished_at,
            EXTRACT(EPOCH FROM (COALESCE(w.finished_at, r.finished_at, r.updated_at) -
              COALESCE(w.lease_started_at, r.started_at))) * 1000 AS latency_ms,
            r.input_tokens, r.cached_input_tokens,
            r.cache_creation_tokens, r.output_tokens, r.model
       FROM agent_runs r
       LEFT JOIN agent_work_items w ON w.id = r.id
      WHERE r.id = $1
      LIMIT 1`,
    [runId],
  )
  const run = rows[0]
  if (!run) throw Object.assign(new Error(`Agent OS run not found: ${runId}`), { status: 404 })

  const [eventsResult, hostActionsResult, approvalsResult] = await Promise.all([
    pool.query<AgentEventRow>(
      `SELECT id,kind,data,created_at,sequence FROM agent_events
        WHERE run_id=$1 ORDER BY created_at ASC, sequence ASC NULLS LAST`,
      [runId],
    ),
    pool.query<HostActionRow>(
      `SELECT idempotency_key,action,args,result,status,error,approval_id,cell_id,call_index,created_at,updated_at
         FROM agent_host_actions WHERE run_id=$1 ORDER BY created_at ASC`,
      [runId],
    ),
    pool.query<ApprovalRow>(
      `SELECT a.id,a.action,a.status,a.requested_at,a.resolved_at
         FROM agent_os_approvals a JOIN agent_host_actions h ON h.approval_id=a.id
        WHERE h.run_id=$1 ORDER BY a.requested_at ASC`,
      [runId],
    ),
  ])

  const knowledgeEvents = eventsResult.rows.filter((row) => row.kind === 'knowledge.context.loaded')
  const contextCitations = knowledgeEvents.flatMap((row) => {
    const knowledge = jsonRecord(row.data)
    return Array.isArray(knowledge.citations)
      ? knowledge.citations.flatMap((item) => {
          const value = jsonRecord(item)
          const sourceId = typeof value.sourceId === 'string' ? value.sourceId : ''
          return sourceId ? [{
            sourceId,
            ...(typeof value.chunkId === 'string' ? { chunkId: value.chunkId } : {}),
            ...(typeof value.marker === 'string' ? { marker: value.marker } : {}),
            ...(typeof value.title === 'string' ? { title: value.title } : {}),
          }] : []
        })
      : []
  })
  const dynamicCitations = hostActionsResult.rows.flatMap((row) => extractKnowledgeCitations(row.action, row.result))
  const citations: EvalCitationObservation[] = dedupeCitations([...contextCitations, ...dynamicCitations])
  const eventTokenCount = eventsResult.rows
    .filter((row) => row.kind === 'model.completed')
    .reduce((sum, row) => {
      const usage = jsonRecord(jsonRecord(row.data).usage)
      return sum + (finiteNumber(usage.inputTokens) ?? 0) + (finiteNumber(usage.outputTokens) ?? 0)
    }, 0)
  const nativeTools: EvalToolCallObservation[] = hostActionsResult.rows.map((row) => ({
    id: row.idempotency_key,
    name: row.action,
    args: sanitizeHostActionArgs(row.action, row.args),
    result: sanitizeHostActionResult(row.action, row.result),
    status: row.status === 'succeeded' ? 'ok' : row.status === 'failed' ? 'error' : 'pending',
    durationMs: Math.max(0, Date.parse(row.updated_at) - Date.parse(row.created_at)),
    ...(row.approval_id ? { approvalId: row.approval_id } : {}),
    cellId: row.cell_id,
  }))
  const approvals: EvalApprovalObservation[] = approvalsResult.rows.map((row) => ({
    id: row.id,
    action: row.action,
    status: row.status === 'approved' || row.status === 'rejected' || row.status === 'pending' ? row.status : 'failed',
    requestedAt: row.requested_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
  }))

  let agentTurns: EvalAgentTurnObservation[] = [{
    agentId: run.agent_id,
    status: run.status,
    startedAt: run.started_at,
    ...(run.finished_at ? { finishedAt: run.finished_at } : {}),
    ...(run.run_error ? { error: run.run_error } : {}),
  }]
  const canvasTrace: EvalTraceEvent[] = []
  let artifacts: NonNullable<EvalObservation['artifacts']> = []
  let completionRate = run.status === 'completed' && run.result_text ? 1 : 0
  if (run.canvas_id) {
    const [assignments, handoffs, frames] = await Promise.all([
      pool.query<{
        id: string; agent_id: string; assignment: string; status: string; started_at: string | null
        completed_at: string | null; error: string | null
      }>(
        `SELECT id,agent_id,assignment,status,started_at,completed_at,error
           FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at ASC`,
        [run.canvas_id],
      ),
      pool.query<{ id: string; actor_id: string; detail: Record<string, unknown>; created_at: string }>(
        `SELECT id,actor_id,detail,created_at FROM canvas_activity WHERE canvas_id=$1 AND action='handoff' ORDER BY created_at ASC`,
        [run.canvas_id],
      ),
      pool.query<{ id: string; type: string; title: string; created_at: string; updated_at: string }>(
        `SELECT id,type,title,created_at,updated_at FROM canvas_frames WHERE canvas_id=$1 ORDER BY created_at ASC`,
        [run.canvas_id],
      ),
    ])
    const handoffByAgent = new Map<string, string>()
    for (const handoff of handoffs.rows) {
      const to = jsonRecord(handoff.detail).toAgentId
      if (typeof to === 'string') handoffByAgent.set(handoff.actor_id, to)
    }
    agentTurns = assignments.rows.map((row) => ({
      agentId: row.agent_id,
      role: row.assignment,
      status: row.status,
      ...(handoffByAgent.has(row.agent_id) ? { handoffTo: handoffByAgent.get(row.agent_id) } : {}),
      ...(row.started_at ? { startedAt: row.started_at } : {}),
      ...(row.completed_at ? { finishedAt: row.completed_at } : {}),
      ...(row.error ? { error: row.error } : {}),
    }))
    for (const assignment of assignments.rows) canvasTrace.push({
      id: assignment.id,
      kind: 'canvas',
      label: `Canvas Worker · ${assignment.agent_id}`,
      status: assignment.status === 'completed' ? 'completed' : assignment.status === 'failed' ? 'failed' : 'pending',
      startedAt: assignment.started_at ?? undefined,
      finishedAt: assignment.completed_at ?? undefined,
      durationMs: elapsedMs(assignment.started_at, assignment.completed_at),
      agentId: assignment.agent_id,
      input: { assignment: assignment.assignment },
      output: assignment.error ? { error: assignment.error } : { status: assignment.status },
      metadata: { canvasId: run.canvas_id },
    })
    for (const handoff of handoffs.rows) canvasTrace.push({
      id: handoff.id,
      kind: 'canvas',
      label: `Canvas Handoff · ${handoff.actor_id}`,
      status: 'completed',
      startedAt: handoff.created_at,
      agentId: handoff.actor_id,
      input: sanitizeHostActionArgs('canvas.handoff', handoff.detail),
      metadata: { canvasId: run.canvas_id },
    })
    artifacts = frames.rows.map((frame) => ({ id: frame.id, kind: frame.type, title: frame.title }))
    completionRate = assignments.rows.length
      ? assignments.rows.filter((assignment) => assignment.status === 'completed').length / assignments.rows.length
      : completionRate
  }

  const tokenBreakdown = run.input_tokens + run.cached_input_tokens + run.cache_creation_tokens + run.output_tokens
  const trace = buildAgentTrace({
    run,
    events: eventsResult.rows,
    hostActions: hostActionsResult.rows,
    approvals: approvalsResult.rows,
    canvasEvents: canvasTrace,
  })
  const inputData = jsonRecord(eventsResult.rows.find((event) => event.kind === 'input.loaded')?.data)
  return {
    input: typeof inputData.text === 'string'
      ? inputData.text
      : run.trigger_client_msg_no ? `trigger:${run.trigger_client_msg_no}` : undefined,
    answer: run.result_text ?? '',
    retrievedSourceIds: [...new Set(citations.map((item) => item.sourceId))],
    citations,
    toolCalls: nativeTools,
    agentTurns,
    approvals,
    artifacts,
    trace,
    taskCompletion: {
      completed: completionRate >= 1 && !run.run_error,
      completionRate,
      outcome: run.run_error ?? (run.result_text ? 'answer_committed' : approvals.some((item) => item.status === 'pending') ? 'awaiting_approval' : run.status),
    },
    policyViolations: [],
    latencyMs: finiteNumber(run.latency_ms),
    tokenCount: tokenBreakdown || eventTokenCount || undefined,
    ...(run.run_error ? { error: run.run_error } : {}),
    metadata: {
      sourceAgentRunId: runId,
      agentId: run.agent_id,
      agentStatus: run.status,
      canvasId: run.canvas_id,
      reason: run.reason,
      lane: run.lane,
      model: run.model,
    },
  }
}

async function resolveObservations(input: EvalRunInput): Promise<Map<string, EvalObservation>> {
  const observations = new Map<string, EvalObservation>()
  // Keep hydration serial: one suite may contain 100 cases and each historical
  // run fans out to several trace queries. Serial reads avoid turning a manual
  // admin action into an accidental connection-pool flood.
  for (const item of input.cases) {
    observations.set(item.caseId, item.sourceAgentRunId
      ? { ...(await loadAgentRunObservation(item.sourceAgentRunId)), ...(item.observation ?? {}) }
      : item.observation ?? {})
  }
  return observations
}

function runSource(input: EvalRunInput): string {
  const historical = input.cases.filter((item) => item.sourceAgentRunId).length
  if (historical === 0) return 'inline'
  return historical === input.cases.length ? 'agent-os' : 'mixed'
}

async function persistCase(client: PoolClient, runId: string, item: EvalCaseReport, position: number): Promise<void> {
  const caseId = `eval-case-${randomUUID()}`
  await client.query(
    `INSERT INTO eval_cases
       (id,eval_run_id,case_key,name,position,source_agent_run_id,status,score,observation,expectations,failure_reasons)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
    [caseId, runId, item.caseId, item.name, position, item.sourceAgentRunId, item.status, item.score,
      JSON.stringify(item.observation), JSON.stringify(item.expectations), JSON.stringify(item.failureReasons)],
  )
  for (const [stagePosition, stage] of item.stages.entries()) {
    await client.query(
      `INSERT INTO eval_stage_results
         (id,eval_run_id,eval_case_id,stage,position,status,score,duration_ms,findings,metrics,failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
      [`eval-stage-${randomUUID()}`, runId, caseId, stage.stage, stagePosition, stage.status, stage.score,
        stage.durationMs, JSON.stringify(stage.findings), JSON.stringify(stage.metrics), stage.failureReason],
    )
  }
}

export async function createEvalRun(input: EvalRunInput, createdBy: string): Promise<{ id: string; report: EvalRunReport }> {
  if (input.baselineRunId) {
    const baseline = await pool.query<{ suite_key: string }>(`SELECT suite_key FROM eval_runs WHERE id=$1`, [input.baselineRunId])
    if (!baseline.rows[0]) throw Object.assign(new Error('baseline eval run not found'), { status: 404 })
    if (baseline.rows[0].suite_key !== input.suiteKey) {
      throw Object.assign(new Error('baseline eval run must belong to the same suiteKey'), { status: 409 })
    }
  }
  const observations = await resolveObservations(input)
  const observedModels = [...new Set([...observations.values()].flatMap((observation) => {
    const model = jsonRecord(observation.metadata).model
    return typeof model === 'string' && model ? [model] : []
  }))]
  const effectiveInput: EvalRunInput = {
    ...input,
    target: {
      ...(input.target ?? {}),
      ...(!input.target?.model && observedModels.length ? { model: observedModels.length === 1 ? observedModels[0] : 'mixed' } : {}),
    },
  }
  const report = evaluateRun(effectiveInput, observations)
  const id = `eval-${randomUUID()}`
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO eval_runs
         (id,suite_key,suite_name,version,commit_sha,prompt_version,model,baseline_run_id,status,score,pass_threshold,case_count,
          passed_cases,failed_cases,error_cases,source,summary,metadata,created_by,started_at,finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,NOW(),NOW())`,
      [id, report.suiteKey, report.suiteName, report.version, report.target.commitSha ?? null,
        report.target.promptVersion ?? null, report.target.model ?? null, report.baselineRunId, report.status, report.score,
        report.passThreshold, report.summary.caseCount, report.summary.passedCases, report.summary.failedCases,
        report.summary.errorCases, runSource(input), JSON.stringify(report.summary), JSON.stringify(input.metadata ?? {}), createdBy],
    )
    for (const [position, item] of report.cases.entries()) await persistCase(client, id, item, position)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  return { id, report }
}

function toDashboardRun(row: DashboardRunRow): EvalDashboardRun {
  const baselineScore = row.explicit_baseline_score ?? row.previous_score
  return {
    id: row.id,
    suiteKey: row.suite_key,
    suiteName: row.suite_name,
    version: row.version,
    target: {
      ...(row.commit_sha ? { commitSha: row.commit_sha } : {}),
      ...(row.prompt_version ? { promptVersion: row.prompt_version } : {}),
      ...(row.model ? { model: row.model } : {}),
    },
    baselineRunId: row.baseline_run_id,
    status: row.status,
    score: Number(row.score),
    passThreshold: Number(row.pass_threshold),
    caseCount: row.case_count,
    passedCases: row.passed_cases,
    failedCases: row.failed_cases,
    errorCases: row.error_cases,
    source: row.source,
    summary: normalizeRunSummary(row.summary),
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    baselineScore: baselineScore === null ? null : Number(baselineScore),
    scoreDelta: baselineScore === null ? null : Number((Number(row.score) - Number(baselineScore)).toFixed(4)),
  }
}

export async function getEvalDashboard(args: { suiteKey?: string; limit?: number; sinceDays?: number } = {}): Promise<{
  summary: {
    totalRuns: number
    passRate: number
    averageScore: number
    failedRuns: number
    suites: number
    averageLatencyMs: number | null
    totalTokens: number
    totalCostUsd: number
  }
  runs: EvalDashboardRun[]
  stageAverages: EvalRunReport['summary']['stageScores']
  failureClusters: Array<{ category: string; count: number; runCount: number }>
}> {
  const limit = Math.min(200, Math.max(1, args.limit ?? 80))
  const sinceDays = Math.min(365, Math.max(1, args.sinceDays ?? 90))
  const params: unknown[] = [sinceDays]
  let suiteWhere = ''
  if (args.suiteKey) {
    params.push(args.suiteKey)
    suiteWhere = `AND r.suite_key=$${params.length}`
  }
  params.push(limit)
  const { rows } = await pool.query<DashboardRunRow>(
    `WITH scored AS (
       SELECT r.*,
              LAG(r.score) OVER (PARTITION BY r.suite_key ORDER BY r.created_at,r.id) AS previous_score
         FROM eval_runs r
        WHERE r.created_at >= NOW() - ($1::double precision * INTERVAL '1 day')
     )
     SELECT r.*, baseline.score AS explicit_baseline_score
       FROM scored r
       LEFT JOIN eval_runs baseline ON baseline.id=r.baseline_run_id
      WHERE TRUE ${suiteWhere}
      ORDER BY r.created_at DESC
      LIMIT $${params.length}`,
    params,
  )
  const runs = rows.map(toDashboardRun)
  const totalRuns = runs.length
  const stageNames = ['answer', 'teaching', 'rag', 'tools', 'safety', 'task', 'collaboration', 'efficiency'] as const
  const stageAverages = Object.fromEntries(stageNames.map((stage) => {
    const values = runs.flatMap((run) => {
      const value = run.summary?.stageScores?.[stage]
      return typeof value === 'number' ? [value] : []
    })
    return [stage, values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : null]
  })) as EvalRunReport['summary']['stageScores']
  const latencyValues = runs.flatMap((run) => run.summary.resources?.averageLatencyMs === null ||
    run.summary.resources?.averageLatencyMs === undefined ? [] : [run.summary.resources.averageLatencyMs])
  const categoryCounts = new Map<string, { count: number; runCount: number }>()
  for (const run of runs) {
    for (const [category, count] of Object.entries(run.summary.failureCategories ?? {})) {
      const current = categoryCounts.get(category) ?? { count: 0, runCount: 0 }
      current.count += Number(count)
      current.runCount += 1
      categoryCounts.set(category, current)
    }
  }
  return {
    summary: {
      totalRuns,
      passRate: totalRuns ? runs.filter((run) => run.status === 'pass').length / totalRuns : 0,
      averageScore: totalRuns ? runs.reduce((sum, run) => sum + run.score, 0) / totalRuns : 0,
      failedRuns: runs.filter((run) => run.status !== 'pass').length,
      suites: new Set(runs.map((run) => run.suiteKey)).size,
      averageLatencyMs: latencyValues.length
        ? Number((latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length).toFixed(1))
        : null,
      totalTokens: runs.reduce((sum, run) => sum + (run.summary.resources?.totalTokens ?? 0), 0),
      totalCostUsd: Number(runs.reduce((sum, run) => sum + (run.summary.resources?.totalCostUsd ?? 0), 0).toFixed(6)),
    },
    runs,
    stageAverages,
    failureClusters: [...categoryCounts.entries()]
      .map(([category, values]) => ({ category, ...values }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category)),
  }
}

export async function getEvalRunDetail(id: string): Promise<EvalDashboardRun & { cases: Array<{
  id: string
  caseId: string
  name: string
  position: number
  sourceAgentRunId: string | null
  status: string
  score: number
  observation: EvalObservation
  expectations: Record<string, unknown>
  failureReasons: string[]
  failureCategories: string[]
  stages: EvalStageResult[]
}> }> {
  const { rows } = await pool.query<DashboardRunRow>(
    `WITH scored AS (
       SELECT r.*, LAG(r.score) OVER (PARTITION BY r.suite_key ORDER BY r.created_at,r.id) AS previous_score
       FROM eval_runs r
     )
     SELECT r.*, baseline.score AS explicit_baseline_score
       FROM scored r LEFT JOIN eval_runs baseline ON baseline.id=r.baseline_run_id
      WHERE r.id=$1`,
    [id],
  )
  if (!rows[0]) throw Object.assign(new Error('eval run not found'), { status: 404 })
  const [caseRows, stageRows] = await Promise.all([
    pool.query<{
      id: string; case_key: string; name: string; position: number; source_agent_run_id: string | null
      status: string; score: number; observation: EvalObservation; expectations: Record<string, unknown>; failure_reasons: string[]
    }>(`SELECT * FROM eval_cases WHERE eval_run_id=$1 ORDER BY position`, [id]),
    pool.query<{
      eval_case_id: string; stage: EvalStageResult['stage']; status: EvalStageResult['status']; score: number | null
      duration_ms: number; findings: EvalStageResult['findings']; metrics: EvalStageResult['metrics']; failure_reason: string | null; position: number
    }>(`SELECT * FROM eval_stage_results WHERE eval_run_id=$1 ORDER BY eval_case_id,position`, [id]),
  ])
  const stagesByCase = new Map<string, EvalStageResult[]>()
  for (const row of stageRows.rows) {
    const list = stagesByCase.get(row.eval_case_id) ?? []
    list.push({ stage: row.stage, status: row.status, score: row.score === null ? null : Number(row.score),
      durationMs: row.duration_ms, findings: row.findings, metrics: row.metrics, failureReason: row.failure_reason })
    stagesByCase.set(row.eval_case_id, list)
  }
  return {
    ...toDashboardRun(rows[0]),
    cases: caseRows.rows.map((row) => {
      const stages = stagesByCase.get(row.id) ?? []
      return {
        id: row.id,
        caseId: row.case_key,
        name: row.name,
        position: row.position,
        sourceAgentRunId: row.source_agent_run_id,
        status: row.status,
        score: Number(row.score),
        observation: row.observation,
        expectations: row.expectations,
        failureReasons: row.failure_reasons,
        failureCategories: [...new Set(stages.flatMap((stage) => stage.findings.flatMap((finding) =>
          finding.status === 'fail' && finding.category ? [finding.category] : [])))],
        stages,
      }
    }),
  }
}

export async function getEvalComparison(baseRunId: string, candidateRunId: string): Promise<{
  base: EvalDashboardRun
  candidate: EvalDashboardRun
  scoreDelta: number
  targetChanges: Array<{ field: 'commitSha' | 'promptVersion' | 'model'; base: string | null; candidate: string | null }>
  stageDeltas: Array<{ stage: string; base: number | null; candidate: number | null; delta: number | null }>
  caseDeltas: Array<{
    caseId: string
    name: string
    base: number | null
    candidate: number | null
    delta: number | null
    status: 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed'
    stageDeltas: Array<{ stage: string; base: number | null; candidate: number | null; delta: number | null }>
    addedFailureCategories: string[]
    resolvedFailureCategories: string[]
  }>
}> {
  if (baseRunId === candidateRunId) throw Object.assign(new Error('comparison requires two different eval runs'), { status: 400 })
  const [base, candidate] = await Promise.all([getEvalRunDetail(baseRunId), getEvalRunDetail(candidateRunId)])
  if (base.suiteKey !== candidate.suiteKey) {
    throw Object.assign(new Error('comparison runs must belong to the same suiteKey'), { status: 409 })
  }
  const delta = (left: number | null, right: number | null): number | null =>
    left === null || right === null ? null : Number((right - left).toFixed(4))
  const stageDeltas = EVAL_DIMENSIONS.map((stage) => ({
    stage,
    base: base.summary.stageScores[stage],
    candidate: candidate.summary.stageScores[stage],
    delta: delta(base.summary.stageScores[stage], candidate.summary.stageScores[stage]),
  }))
  const baseCases = new Map(base.cases.map((item) => [item.caseId, item]))
  const candidateCases = new Map(candidate.cases.map((item) => [item.caseId, item]))
  const caseIds = [...new Set([...baseCases.keys(), ...candidateCases.keys()])]
  const caseDeltas = caseIds.map((caseId) => {
    const before = baseCases.get(caseId)
    const after = candidateCases.get(caseId)
    const scoreDelta = delta(before?.score ?? null, after?.score ?? null)
    const beforeCategories = new Set(before?.failureCategories ?? [])
    const afterCategories = new Set(after?.failureCategories ?? [])
    return {
      caseId,
      name: after?.name ?? before?.name ?? caseId,
      base: before?.score ?? null,
      candidate: after?.score ?? null,
      delta: scoreDelta,
      status: (!before ? 'added' : !after ? 'removed' : (scoreDelta ?? 0) > 0 ? 'improved' : (scoreDelta ?? 0) < 0 ? 'regressed' : 'unchanged') as
        'improved' | 'regressed' | 'unchanged' | 'added' | 'removed',
      stageDeltas: EVAL_DIMENSIONS.map((stage) => {
        const beforeStage = before?.stages.find((item) => item.stage === stage)?.score ?? null
        const afterStage = after?.stages.find((item) => item.stage === stage)?.score ?? null
        return { stage, base: beforeStage, candidate: afterStage, delta: delta(beforeStage, afterStage) }
      }),
      addedFailureCategories: [...afterCategories].filter((category) => !beforeCategories.has(category)),
      resolvedFailureCategories: [...beforeCategories].filter((category) => !afterCategories.has(category)),
    }
  }).sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0) || left.caseId.localeCompare(right.caseId))
  const { cases: _baseCases, ...baseRun } = base
  const { cases: _candidateCases, ...candidateRun } = candidate
  return {
    base: baseRun,
    candidate: candidateRun,
    scoreDelta: Number((candidate.score - base.score).toFixed(4)),
    targetChanges: (['commitSha', 'promptVersion', 'model'] as const).map((field) => ({
      field,
      base: base.target[field] ?? null,
      candidate: candidate.target[field] ?? null,
    })),
    stageDeltas,
    caseDeltas,
  }
}
