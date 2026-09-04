import type { PoolClient } from 'pg'
import type { Queryable } from '../db/queryable.js'
import type { AgentWorkItem, HostAction, HostActionResult } from './types.js'

export interface AgentActionScopeRow {
  capabilities: string[] | null
  teacher_managed: boolean
}

export interface ActionableWorkRow {
  id: string
  progress_fingerprint: string | null
  no_progress_count: number
}

export interface HostActionLedgerRow {
  status: string
  result: unknown
  error: string | null
  approval_id: string | null
  action: string
  args: unknown
}

export async function loadAgentActionScope(
  db: Queryable,
  work: Pick<AgentWorkItem, 'agentId' | 'companyId'>,
): Promise<AgentActionScopeRow | null> {
  const { rows } = await db.query<AgentActionScopeRow>(
    `SELECT p.capabilities,
            EXISTS(SELECT 1 FROM learning_project_teacher_agents pta WHERE pta.company_id=p.company_id AND pta.agent_id=p.id) AS teacher_managed
       FROM participants p
      WHERE p.id=$1 AND p.company_id=$2 AND p.kind='agent' AND p.departed_at IS NULL`,
    [work.agentId, work.companyId],
  )
  return rows[0] ?? null
}

export async function lockHostActionExecution(
  db: PoolClient,
  work: Pick<AgentWorkItem, 'canvasId' | 'id'>,
  idempotencyKey: string,
): Promise<void> {
  if (work.canvasId) {
    await db.query(`SELECT pg_advisory_lock_shared(hashtextextended($1, 0))`, [
      `canvas-workspace:${work.canvasId}`,
    ])
  }
  await db.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [`agent-work:${work.id}`])
  await db.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [idempotencyKey])
}

export async function unlockHostActionExecution(
  db: PoolClient,
  work: Pick<AgentWorkItem, 'canvasId' | 'id'>,
  idempotencyKey: string,
): Promise<void> {
  await db.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [idempotencyKey])
    .catch(() => undefined)
  if (work.canvasId) {
    await db.query(`SELECT pg_advisory_unlock_shared(hashtextextended($1, 0))`, [
      `canvas-workspace:${work.canvasId}`,
    ]).catch(() => undefined)
  }
  await db.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [`agent-work:${work.id}`])
    .catch(() => undefined)
}

export async function beginHostAction(db: PoolClient): Promise<void> {
  await db.query('BEGIN')
}

export async function commitHostAction(db: PoolClient): Promise<void> {
  await db.query('COMMIT')
}

export async function rollbackHostAction(db: PoolClient): Promise<void> {
  await db.query('ROLLBACK').catch(() => undefined)
}

export async function loadActionableWork(
  db: PoolClient,
  work: AgentWorkItem,
  action: HostAction,
  approved: boolean,
  leaseTokenHash: string,
): Promise<ActionableWorkRow | null> {
  const { rows } = approved
    ? await db.query<ActionableWorkRow>(
      `SELECT w.id,w.progress_fingerprint,w.no_progress_count FROM agent_work_items w
        JOIN approvals a ON a.work_id=w.id AND a.idempotency_key=$2
         AND a.source='AGENT_OS' AND a.status='APPROVED'
       WHERE w.id=$1 AND w.company_id=$3 AND w.agent_id=$4 AND w.channel_id=$5`,
      [work.id, action.idempotencyKey, work.companyId, work.agentId, work.channelId],
    )
    : await db.query<ActionableWorkRow>(
      `SELECT id,progress_fingerprint,no_progress_count FROM agent_work_items WHERE id=$1 AND fence=$2 AND lease_token_hash=$3
        AND status='leased' AND lease_expires_at > NOW() AND cancel_requested_at IS NULL`,
      [work.id, work.fence, leaseTokenHash],
    )
  return rows[0] ?? null
}

export async function loadHostAction(
  db: PoolClient,
  idempotencyKey: string,
): Promise<HostActionLedgerRow | null> {
  const { rows } = await db.query<HostActionLedgerRow>(
    `SELECT status, result, error, approval_id, action, args FROM agent_host_actions WHERE idempotency_key=$1`,
    [idempotencyKey],
  )
  return rows[0] ?? null
}

export async function loadProgressState(
  db: PoolClient,
  work: Pick<AgentWorkItem, 'channelId' | 'canvasId' | 'companyId'>,
): Promise<unknown> {
  const { rows } = await db.query<{ state: unknown }>(
    `WITH scope AS (
      SELECT project_id FROM conversations WHERE id=$1 AND company_id=$3
    ) SELECT jsonb_build_object(
      'mission',(SELECT jsonb_agg(jsonb_build_array(m.id,m.status,m.updated_at)) FROM learning_missions m WHERE m.company_id=$3 AND m.project_id=(SELECT project_id FROM scope) AND m.conversation_id=$1 AND m.status IN ('PLANNING','ACTIVE','PAUSED')),
      'steps',(SELECT jsonb_agg(jsonb_build_array(s.id,s.status,s.updated_at)) FROM learning_mission_steps s JOIN learning_missions m ON m.company_id=s.company_id AND m.project_id=s.project_id AND m.id=s.mission_id WHERE m.company_id=$3 AND m.project_id=(SELECT project_id FROM scope) AND m.conversation_id=$1 AND m.status IN ('PLANNING','ACTIVE','PAUSED')),
      'assignments',(SELECT jsonb_agg(jsonb_build_array(a.id,a.status,a.updated_at)) FROM canvas_agent_assignments a WHERE a.canvas_id=$2),
      'reports',(SELECT jsonb_agg(r.id ORDER BY r.created_at) FROM canvas_assignment_reports r WHERE r.canvas_id=$2),
      'evidence',(
        SELECT jsonb_agg(jsonb_build_array(attempt.id,attempt.status,attempt.submitted_at))
          FROM learning_attempts attempt
         WHERE attempt.company_id=$3 AND attempt.project_id=(SELECT project_id FROM scope)
      )
    ) AS state`,
    [work.channelId, work.canvasId ?? null, work.companyId],
  )
  return rows[0]?.state ?? {}
}

export async function loadLastSucceededAction(
  db: PoolClient,
  workId: string,
): Promise<{ action: string; args: unknown } | null> {
  const { rows } = await db.query<{ action: string; args: unknown }>(
    `SELECT action,args FROM agent_host_actions WHERE work_id=$1 AND status='succeeded' ORDER BY created_at DESC LIMIT 1`,
    [workId],
  )
  return rows[0] ?? null
}

export async function updateWorkProgress(
  db: PoolClient,
  workId: string,
  fingerprint: string,
  noProgressCount: number,
): Promise<void> {
  await db.query(
    `UPDATE agent_work_items SET progress_fingerprint=$2,no_progress_count=$3 WHERE id=$1`,
    [workId, fingerprint, noProgressCount],
  )
}

export async function insertNoProgressFailure(
  db: PoolClient,
  workId: string,
  action: HostAction,
  error: string,
): Promise<void> {
  await db.query(
    `INSERT INTO agent_host_actions(idempotency_key,work_id,run_id,cell_id,call_index,action,args,status,error)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'failed',$8) ON CONFLICT(idempotency_key) DO NOTHING`,
    [
      action.idempotencyKey,
      workId,
      action.runId,
      action.cellId,
      action.callIndex,
      action.action,
      JSON.stringify(action.args),
      error,
    ],
  )
}

export async function insertHostAction(
  db: PoolClient,
  workId: string,
  action: HostAction,
): Promise<void> {
  await db.query(
    `INSERT INTO agent_host_actions
       (idempotency_key, work_id, run_id, cell_id, call_index, action, args)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      action.idempotencyKey,
      workId,
      action.runId,
      action.cellId,
      action.callIndex,
      action.action,
      JSON.stringify(action.args),
    ],
  )
}

export async function insertHostApproval(
  db: PoolClient,
  input: {
    approvalId: string
    work: AgentWorkItem
    action: HostAction
    summary: string
    requestedBy: string | null
    scope: Record<string, unknown>
    preview: Record<string, unknown>
    ttlMs: number
  },
): Promise<void> {
  await db.query(
    `INSERT INTO approvals
       (id, company_id, agent_id, channel_id, source, work_id, authorization_user_id,
        idempotency_key, action, args, summary, requested_by, scope, preview, expires_at)
     VALUES ($1,$2,$3,$4,'AGENT_OS',$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb,
             NOW()+($14::bigint*INTERVAL '1 millisecond'))
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      input.approvalId,
      input.work.companyId,
      input.work.agentId,
      input.work.channelId,
      input.work.id,
      input.work.authorizationUserId,
      input.action.idempotencyKey,
      input.action.action,
      JSON.stringify(input.action.args),
      input.summary,
      input.requestedBy,
      JSON.stringify(input.scope),
      JSON.stringify(input.preview),
      input.ttlMs,
    ],
  )
}

export async function markHostActionAwaitingApproval(
  db: PoolClient,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM approvals WHERE idempotency_key=$1`,
    [idempotencyKey],
  )
  await db.query(
    `UPDATE agent_host_actions SET status='awaiting_approval', approval_id=$2, updated_at=NOW() WHERE idempotency_key=$1`,
    [idempotencyKey, rows[0].id],
  )
  return rows[0].id
}

export async function markHostActionPending(
  db: PoolClient,
  idempotencyKey: string,
): Promise<void> {
  await db.query(
    `UPDATE agent_host_actions SET status='pending', error=NULL, updated_at=NOW() WHERE idempotency_key=$1`,
    [idempotencyKey],
  )
}

export async function saveHostActionResult(
  db: PoolClient,
  idempotencyKey: string,
  result: HostActionResult,
): Promise<void> {
  await db.query(
    `UPDATE agent_host_actions SET status=$2, result=$3::jsonb, error=$4, updated_at=NOW() WHERE idempotency_key=$1`,
    [
      idempotencyKey,
      result.ok ? 'succeeded' : 'failed',
      result.ok
        ? JSON.stringify({
          __hostActionResult: true,
          value: result.value ?? null,
          ...(result.directive ? { directive: result.directive } : {}),
        })
        : null,
      result.error ?? null,
    ],
  )
}
