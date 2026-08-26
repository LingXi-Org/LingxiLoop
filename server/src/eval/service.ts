import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import type {
  EvalAgentTurnObservation,
  EvalCaseReport,
  EvalObservation,
  EvalRunInput,
  EvalRunReport,
  EvalStageResult,
  EvalToolCallObservation,
} from './contracts.js'
import { evaluateRun } from './evaluator.js'

interface AgentRunSourceRow {
  id: string
  agent_id: string
  status: string
  run_error: string | null
  result_text: string | null
  canvas_id: string | null
  latency_ms: string | number | null
  token_count: number
  input_tokens: number
  cached_input_tokens: number
  cache_creation_tokens: number
  output_tokens: number
}

interface DashboardRunRow {
  id: string
  suite_key: string
  suite_name: string
  version: string
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

async function loadAgentRunObservation(runId: string): Promise<EvalObservation> {
  const { rows } = await pool.query<AgentRunSourceRow>(
    `SELECT r.id, r.agent_id, COALESCE(w.status, r.status) AS status, COALESCE(w.error, r.error) AS run_error,
            w.result_text, w.canvas_id,
            EXTRACT(EPOCH FROM (COALESCE(w.finished_at, r.finished_at, r.updated_at) -
              COALESCE(w.lease_started_at, r.started_at))) * 1000 AS latency_ms,
            r.token_count, r.input_tokens, r.cached_input_tokens,
            r.cache_creation_tokens, r.output_tokens
       FROM agent_runs r
       LEFT JOIN agent_work_items w ON w.id = r.id
      WHERE r.id = $1
      LIMIT 1`,
    [runId],
  )
  const run = rows[0]
  if (!run) throw Object.assign(new Error(`Agent OS run not found: ${runId}`), { status: 404 })

  const [eventsResult, hostActionsResult, legacyToolsResult] = await Promise.all([
    pool.query<{ kind: string; data: Record<string, unknown> }>(
      `SELECT kind,data FROM agent_events
        WHERE run_id=$1 AND kind IN ('knowledge.context.loaded','model.completed')
        ORDER BY created_at ASC`,
      [runId],
    ),
    pool.query<{ action: string; args: unknown; result: unknown; status: string; error: string | null; created_at: string }>(
      `SELECT action,args,result,status,error,created_at FROM agent_host_actions WHERE run_id=$1 ORDER BY created_at ASC`,
      [runId],
    ),
    pool.query<{ name: string; args: unknown; result: unknown; status: string; error: string | null; duration_ms: number | null; created_at: string }>(
      `SELECT name,args,result,status,error,duration_ms,created_at FROM tool_calls WHERE run_id=$1 ORDER BY created_at ASC`,
      [runId],
    ),
  ])

  const knowledge = jsonRecord(eventsResult.rows.find((row) => row.kind === 'knowledge.context.loaded')?.data)
  const eventTokenCount = eventsResult.rows
    .filter((row) => row.kind === 'model.completed')
    .reduce((sum, row) => {
      const usage = jsonRecord(jsonRecord(row.data).usage)
      return sum + (finiteNumber(usage.inputTokens) ?? 0) + (finiteNumber(usage.outputTokens) ?? 0)
    }, 0)
  const citations = Array.isArray(knowledge.citations)
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
  const nativeTools: EvalToolCallObservation[] = hostActionsResult.rows.map((row) => ({
    name: row.action,
    args: row.args,
    result: row.result,
    status: row.status === 'succeeded' ? 'ok' : row.status === 'failed' ? 'error' : 'pending',
  }))
  const legacyTools: EvalToolCallObservation[] = legacyToolsResult.rows.map((row) => ({
    name: row.name,
    args: row.args,
    result: row.result,
    status: row.status === 'ok' ? 'ok' : row.status === 'error' ? 'error' : 'pending',
    ...(row.duration_ms !== null ? { durationMs: row.duration_ms } : {}),
  }))

  let agentTurns: EvalAgentTurnObservation[] = [{
    agentId: run.agent_id,
    status: run.status,
    ...(run.run_error ? { error: run.run_error } : {}),
  }]
  if (run.canvas_id) {
    const [assignments, handoffs] = await Promise.all([
      pool.query<{
        agent_id: string; assignment: string; status: string; started_at: string | null
        completed_at: string | null; error: string | null
      }>(
        `SELECT agent_id,assignment,status,started_at,completed_at,error
           FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at ASC`,
        [run.canvas_id],
      ),
      pool.query<{ actor_id: string; detail: Record<string, unknown> }>(
        `SELECT actor_id,detail FROM canvas_activity WHERE canvas_id=$1 AND action='handoff' ORDER BY created_at ASC`,
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
  }

  const tokenBreakdown = run.input_tokens + run.cached_input_tokens + run.cache_creation_tokens + run.output_tokens
  return {
    answer: run.result_text ?? '',
    retrievedSourceIds: [...new Set(citations.map((item) => item.sourceId))],
    citations,
    toolCalls: [...nativeTools, ...legacyTools],
    agentTurns,
    latencyMs: finiteNumber(run.latency_ms),
    tokenCount: tokenBreakdown || run.token_count || eventTokenCount || undefined,
    ...(run.run_error ? { error: run.run_error } : {}),
    metadata: { sourceAgentRunId: runId, agentId: run.agent_id, agentStatus: run.status, canvasId: run.canvas_id },
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
  const report = evaluateRun(input, observations)
  const id = `eval-${randomUUID()}`
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO eval_runs
         (id,suite_key,suite_name,version,baseline_run_id,status,score,pass_threshold,case_count,
          passed_cases,failed_cases,error_cases,source,summary,metadata,created_by,started_at,finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,NOW(),NOW())`,
      [id, report.suiteKey, report.suiteName, report.version, report.baselineRunId, report.status, report.score,
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
    baselineRunId: row.baseline_run_id,
    status: row.status,
    score: Number(row.score),
    passThreshold: Number(row.pass_threshold),
    caseCount: row.case_count,
    passedCases: row.passed_cases,
    failedCases: row.failed_cases,
    errorCases: row.error_cases,
    source: row.source,
    summary: row.summary,
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    baselineScore: baselineScore === null ? null : Number(baselineScore),
    scoreDelta: baselineScore === null ? null : Number((Number(row.score) - Number(baselineScore)).toFixed(4)),
  }
}

export async function getEvalDashboard(args: { suiteKey?: string; limit?: number; sinceDays?: number } = {}): Promise<{
  summary: { totalRuns: number; passRate: number; averageScore: number; failedRuns: number; suites: number }
  runs: EvalDashboardRun[]
  stageAverages: EvalRunReport['summary']['stageScores']
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
  const stageNames = ['answer', 'rag', 'tools', 'collaboration'] as const
  const stageAverages = Object.fromEntries(stageNames.map((stage) => {
    const values = runs.flatMap((run) => {
      const value = run.summary?.stageScores?.[stage]
      return typeof value === 'number' ? [value] : []
    })
    return [stage, values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : null]
  })) as EvalRunReport['summary']['stageScores']
  return {
    summary: {
      totalRuns,
      passRate: totalRuns ? runs.filter((run) => run.status === 'pass').length / totalRuns : 0,
      averageScore: totalRuns ? runs.reduce((sum, run) => sum + run.score, 0) / totalRuns : 0,
      failedRuns: runs.filter((run) => run.status !== 'pass').length,
      suites: new Set(runs.map((run) => run.suiteKey)).size,
    },
    runs,
    stageAverages,
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
    cases: caseRows.rows.map((row) => ({
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
      stages: stagesByCase.get(row.id) ?? [],
    })),
  }
}
