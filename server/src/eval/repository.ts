import { randomUUID } from 'node:crypto'
import type { Queryable } from '../db/queryable.js'
import type {
  EvalCaseReport,
  EvalObservation,
  EvalRunInput,
  EvalRunReport,
  EvalStageResult,
} from './contracts.js'

export interface AgentRunSourceRow {
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

export interface AgentEventRow {
  id: string
  kind: string
  data: Record<string, unknown>
  created_at: string
  sequence: number | null
}

export interface HostActionRow {
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

export interface ApprovalRow {
  id: string
  action: string
  status: string
  requested_at: string
  resolved_at: string | null
}

export interface CanvasAssignmentRow {
  id: string
  agent_id: string
  assignment: string
  status: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export interface CanvasHandoffRow {
  id: string
  actor_id: string
  detail: Record<string, unknown>
  created_at: string
}

export interface CanvasFrameRow {
  id: string
  type: string
  title: string
  created_at: string
  updated_at: string
}

export interface DashboardRunRow {
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

export interface EvalCaseRow {
  id: string
  case_key: string
  name: string
  position: number
  source_agent_run_id: string | null
  status: string
  score: number
  observation: EvalObservation
  expectations: Record<string, unknown>
  failure_reasons: string[]
}

export interface EvalStageRow {
  eval_case_id: string
  stage: EvalStageResult['stage']
  status: EvalStageResult['status']
  score: number | null
  duration_ms: number
  findings: EvalStageResult['findings']
  metrics: EvalStageResult['metrics']
  failure_reason: string | null
  position: number
}

export async function findAgentRun(db: Queryable, runId: string): Promise<AgentRunSourceRow | null> {
  const { rows } = await db.query<AgentRunSourceRow>(
    `SELECT r.id, r.agent_id, COALESCE(w.status, r.status) AS status, COALESCE(w.error, r.error) AS run_error,
       w.result_text, w.canvas_id, w.reason, w.lane, w.trigger_client_msg_no,
       COALESCE(w.lease_started_at, r.started_at) AS started_at,
       COALESCE(w.finished_at, r.finished_at, r.updated_at) AS finished_at,
       EXTRACT(EPOCH FROM (COALESCE(w.finished_at, r.finished_at, r.updated_at) -
         COALESCE(w.lease_started_at, r.started_at))) * 1000 AS latency_ms,
       r.input_tokens, r.cached_input_tokens, r.cache_creation_tokens, r.output_tokens, r.model
     FROM agent_runs r LEFT JOIN agent_work_items w ON w.id=r.id
     WHERE r.id=$1 LIMIT 1`,
    [runId],
  )
  return rows[0] ?? null
}

export async function listAgentEvents(db: Queryable, runId: string): Promise<AgentEventRow[]> {
  const { rows } = await db.query<AgentEventRow>(
    `SELECT id,kind,data,created_at,sequence FROM agent_events
     WHERE run_id=$1 ORDER BY created_at ASC, sequence ASC NULLS LAST`,
    [runId],
  )
  return rows
}

export async function listHostActions(db: Queryable, runId: string): Promise<HostActionRow[]> {
  const { rows } = await db.query<HostActionRow>(
    `SELECT idempotency_key,action,args,result,status,error,approval_id,cell_id,call_index,created_at,updated_at
     FROM agent_host_actions WHERE run_id=$1 ORDER BY created_at ASC`,
    [runId],
  )
  return rows
}

export async function listApprovals(db: Queryable, runId: string): Promise<ApprovalRow[]> {
  const { rows } = await db.query<ApprovalRow>(
    `SELECT a.id,a.action,a.status,a.requested_at,a.resolved_at
     FROM agent_os_approvals a JOIN agent_host_actions h ON h.approval_id=a.id
     WHERE h.run_id=$1 ORDER BY a.requested_at ASC`,
    [runId],
  )
  return rows
}

export async function loadCanvasTrace(db: Queryable, canvasId: string) {
  const [assignments, handoffs, frames] = await Promise.all([
    db.query<CanvasAssignmentRow>(
      `SELECT id,agent_id,assignment,status,started_at,completed_at,error
       FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at ASC`,
      [canvasId],
    ),
    db.query<CanvasHandoffRow>(
      `SELECT id,actor_id,detail,created_at FROM canvas_activity
       WHERE canvas_id=$1 AND action='handoff' ORDER BY created_at ASC`,
      [canvasId],
    ),
    db.query<CanvasFrameRow>(
      `SELECT id,type,title,created_at,updated_at FROM canvas_frames
       WHERE canvas_id=$1 ORDER BY created_at ASC`,
      [canvasId],
    ),
  ])
  return { assignments: assignments.rows, handoffs: handoffs.rows, frames: frames.rows }
}

export async function findBaselineSuite(db: Queryable, runId: string): Promise<string | null> {
  const { rows } = await db.query<{ suite_key: string }>('SELECT suite_key FROM eval_runs WHERE id=$1', [runId])
  return rows[0]?.suite_key ?? null
}

export type TransactionRunner = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

async function insertCase(db: Queryable, runId: string, item: EvalCaseReport, position: number): Promise<void> {
  const caseId = `eval-case-${randomUUID()}`
  await db.query(
    `INSERT INTO eval_cases
       (id,eval_run_id,case_key,name,position,source_agent_run_id,status,score,observation,expectations,failure_reasons)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
    [caseId, runId, item.caseId, item.name, position, item.sourceAgentRunId, item.status, item.score,
      JSON.stringify(item.observation), JSON.stringify(item.expectations), JSON.stringify(item.failureReasons)],
  )
  for (const [stagePosition, stage] of item.stages.entries()) {
    await db.query(
      `INSERT INTO eval_stage_results
         (id,eval_run_id,eval_case_id,stage,position,status,score,duration_ms,findings,metrics,failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
      [`eval-stage-${randomUUID()}`, runId, caseId, stage.stage, stagePosition, stage.status, stage.score,
        stage.durationMs, JSON.stringify(stage.findings), JSON.stringify(stage.metrics), stage.failureReason],
    )
  }
}

export async function persistEvalRun(
  transaction: TransactionRunner,
  args: { id: string; report: EvalRunReport; input: EvalRunInput; createdBy: string; source: string },
): Promise<void> {
  await transaction(async (db) => {
    await db.query(
      `INSERT INTO eval_runs
         (id,suite_key,suite_name,version,commit_sha,prompt_version,model,baseline_run_id,status,score,pass_threshold,case_count,
          passed_cases,failed_cases,error_cases,source,summary,metadata,created_by,started_at,finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,NOW(),NOW())`,
      [args.id, args.report.suiteKey, args.report.suiteName, args.report.version,
        args.report.target.commitSha ?? null, args.report.target.promptVersion ?? null, args.report.target.model ?? null,
        args.report.baselineRunId, args.report.status, args.report.score, args.report.passThreshold,
        args.report.summary.caseCount, args.report.summary.passedCases, args.report.summary.failedCases,
        args.report.summary.errorCases, args.source, JSON.stringify(args.report.summary),
        JSON.stringify(args.input.metadata ?? {}), args.createdBy],
    )
    for (const [position, item] of args.report.cases.entries()) await insertCase(db, args.id, item, position)
  })
}

export async function listDashboardRuns(
  db: Queryable,
  args: { suiteKey?: string; limit: number; sinceDays: number },
): Promise<DashboardRunRow[]> {
  const params: unknown[] = [args.sinceDays]
  let suiteWhere = ''
  if (args.suiteKey) {
    params.push(args.suiteKey)
    suiteWhere = `AND r.suite_key=$${params.length}`
  }
  params.push(args.limit)
  const { rows } = await db.query<DashboardRunRow>(
    `WITH scored AS (
       SELECT r.*, LAG(r.score) OVER (PARTITION BY r.suite_key ORDER BY r.created_at,r.id) AS previous_score
       FROM eval_runs r WHERE r.created_at >= NOW() - ($1::double precision * INTERVAL '1 day')
     )
     SELECT r.*, baseline.score AS explicit_baseline_score FROM scored r
     LEFT JOIN eval_runs baseline ON baseline.id=r.baseline_run_id
     WHERE TRUE ${suiteWhere} ORDER BY r.created_at DESC LIMIT $${params.length}`,
    params,
  )
  return rows
}

export async function findDashboardRun(db: Queryable, id: string): Promise<DashboardRunRow | null> {
  const { rows } = await db.query<DashboardRunRow>(
    `WITH scored AS (
       SELECT r.*, LAG(r.score) OVER (PARTITION BY r.suite_key ORDER BY r.created_at,r.id) AS previous_score
       FROM eval_runs r
     )
     SELECT r.*, baseline.score AS explicit_baseline_score FROM scored r
     LEFT JOIN eval_runs baseline ON baseline.id=r.baseline_run_id WHERE r.id=$1`,
    [id],
  )
  return rows[0] ?? null
}

export async function listEvalCases(db: Queryable, runId: string): Promise<EvalCaseRow[]> {
  const { rows } = await db.query<EvalCaseRow>('SELECT * FROM eval_cases WHERE eval_run_id=$1 ORDER BY position', [runId])
  return rows
}

export async function listEvalStages(db: Queryable, runId: string): Promise<EvalStageRow[]> {
  const { rows } = await db.query<EvalStageRow>(
    'SELECT * FROM eval_stage_results WHERE eval_run_id=$1 ORDER BY eval_case_id,position',
    [runId],
  )
  return rows
}
