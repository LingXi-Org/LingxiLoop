import type { Queryable } from '../db/queryable.js'
import type { AgentWorkItem } from './types.js'

export interface ApprovalResolutionRow {
  id: string
  agent_id: string
  channel_id: string
  work_id: string
  idempotency_key: string
  action: string
  args: unknown
  status: string
  run_id: string
  cell_id: string
  call_index: number
  summary: string
  requested_at: string
  requested_by: string | null
  authorization_user_id: string
  expires_at: string | null
  scope: Record<string, unknown>
  preview: Record<string, unknown>
}

export interface ApprovalWorkSourceRow {
  company_id: string
  authorization_user_id: string | null
  agent_id: string
  channel_id: string
  thread_root_client_msg_no: string | null
  reason: AgentWorkItem['reason']
  fence: string
  execution_role: AgentWorkItem['executionRole']
}

export async function listVisibleApprovals(
  db: Queryable,
  input: { companyId: string; userId: string },
): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT approval.* FROM approvals approval
      JOIN conversations conversation ON conversation.id=approval.channel_id
     WHERE approval.company_id=$1 AND approval.source='AGENT_OS'
       AND conversation.company_id=approval.company_id
       AND conversation.members @> to_jsonb(ARRAY[$2::text])
     ORDER BY approval.requested_at DESC LIMIT 100`,
    [input.companyId, input.userId],
  )
  return rows
}

export async function lockVisibleApproval(
  db: Queryable,
  input: { approvalId: string; companyId: string; userId: string },
): Promise<ApprovalResolutionRow | null> {
  const { rows } = await db.query<ApprovalResolutionRow>(
    `SELECT approval.id,approval.agent_id,approval.channel_id,approval.work_id,
            approval.idempotency_key,approval.action,approval.args,approval.status,
            approval.summary,approval.requested_at,approval.requested_by,approval.scope,approval.preview,
            approval.authorization_user_id,approval.expires_at,
            host.run_id,host.cell_id,host.call_index
       FROM approvals approval
       JOIN agent_host_actions host ON host.idempotency_key=approval.idempotency_key
       JOIN conversations conversation ON conversation.id=approval.channel_id
      WHERE approval.id=$1 AND approval.company_id=$2 AND approval.source='AGENT_OS'
         AND conversation.company_id=approval.company_id
         AND conversation.members @> to_jsonb(ARRAY[$3::text])
      FOR UPDATE OF approval`,
    [input.approvalId, input.companyId, input.userId],
  )
  return rows[0] ?? null
}

export async function cancelApproval(
  db: Queryable,
  input: { approvalId: string; userId: string; reason: string },
): Promise<void> {
  await db.query(
    `UPDATE approvals
        SET status='CANCELLED',resolved_at=NOW(),resolved_by=$2,cancel_reason=$3,error=$3
      WHERE id=$1 AND status='PENDING'`,
    [input.approvalId, input.userId, input.reason],
  )
}

export async function decideApproval(
  db: Queryable,
  input: { approvalId: string; status: 'APPROVED' | 'REJECTED'; userId: string },
): Promise<void> {
  await db.query(
    `UPDATE approvals SET status=$2,resolved_at=NOW(),resolved_by=$3 WHERE id=$1 AND status='PENDING'`,
    [input.approvalId, input.status, input.userId],
  )
}

export async function approvalWorkSource(
  db: Queryable,
  workId: string,
): Promise<ApprovalWorkSourceRow | null> {
  const { rows } = await db.query<ApprovalWorkSourceRow>(
    `SELECT company_id,authorization_user_id,agent_id,channel_id,thread_root_client_msg_no,reason,fence,execution_role
       FROM agent_work_items WHERE id=$1`,
    [workId],
  )
  return rows[0] ?? null
}

export async function recordApprovalResult(
  db: Queryable,
  input: { approvalId: string; result: unknown; error: string | null },
): Promise<void> {
  await db.query(
    `UPDATE approvals
        SET status='EXECUTED',executed_at=NOW(),result=$2::jsonb,error=$3
      WHERE id=$1 AND status='APPROVED'`,
    [input.approvalId, input.result === undefined ? null : JSON.stringify(input.result), input.error],
  )
}

export async function supersedeApproval(
  db: Queryable,
  input: {
    approval: ApprovalResolutionRow
    approvalId: string
    authorizationUserId: string
    args: unknown
    summary: string
    requestedBy: string
    scope: Record<string, unknown>
    preview: Record<string, unknown>
    expiresAt: string
  },
): Promise<ApprovalResolutionRow> {
  const cellId = `${input.approval.cell_id}-revision-${input.approvalId}`
  const idempotencyKey = `${input.approval.run_id}:${cellId}:${input.approval.call_index}`
  const reason = `superseded by modified approval ${input.approvalId}`
  await cancelApproval(db, {
    approvalId: input.approval.id,
    userId: input.authorizationUserId,
    reason,
  })
  await db.query(
    `UPDATE agent_host_actions
        SET status='failed',error=$2,updated_at=NOW()
      WHERE idempotency_key=$1 AND status='awaiting_approval'`,
    [input.approval.idempotency_key, reason],
  )
  await db.query(
    `INSERT INTO agent_host_actions(
       idempotency_key,work_id,run_id,cell_id,call_index,action,args,status,approval_id
     ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'awaiting_approval',$8)`,
    [idempotencyKey, input.approval.work_id, input.approval.run_id, cellId,
      input.approval.call_index, input.approval.action, JSON.stringify(input.args), input.approvalId],
  )
  const { rows } = await db.query<ApprovalResolutionRow>(
    `INSERT INTO approvals(
       id,company_id,agent_id,channel_id,source,work_id,authorization_user_id,
       idempotency_key,action,args,summary,requested_by,scope,preview,expires_at,
       supersedes_approval_id
     ) SELECT $1,company_id,agent_id,channel_id,'AGENT_OS',work_id,$2,
              $3,action,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9,$10
         FROM approvals WHERE id=$10 AND source='AGENT_OS'
     RETURNING id,agent_id,channel_id,work_id,idempotency_key,action,args,status,
               summary,requested_at,requested_by,scope,preview,authorization_user_id,expires_at,
               $11::text AS run_id,$12::text AS cell_id,$13::int AS call_index`,
    [input.approvalId, input.authorizationUserId, idempotencyKey, JSON.stringify(input.args),
      input.summary, input.requestedBy, JSON.stringify(input.scope), JSON.stringify(input.preview),
      input.expiresAt, input.approval.id, input.approval.run_id, cellId, input.approval.call_index],
  )
  if (!rows[0]) throw new Error('approval replacement source missing')
  return rows[0]
}

export async function approvalChannelType(
  db: Queryable,
  input: { channelId: string; companyId: string },
): Promise<number> {
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [input.channelId, input.companyId],
  )
  return Number(rows[0]?.profile.channelType ?? 2)
}

export async function enqueueApprovalResume(
  db: Queryable,
  input: {
    approvalId: string
    companyId: string
    agentId: string
    channelId: string
    executionRole: AgentWorkItem['executionRole']
    authorizationUserId: string | null
  },
): Promise<void> {
  await db.query(
    `INSERT INTO agent_work_items(
       id,company_id,authorization_user_id,agent_id,channel_id,trigger_client_msg_no,reason,priority,execution_role
     ) VALUES($1,$2,$3,$4,$5,$6,'resume',200,$7)
     ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING`,
    [
      `resume-${input.approvalId}`,
      input.companyId,
      input.authorizationUserId,
      input.agentId,
      input.channelId,
      `approval:${input.approvalId}`,
      input.executionRole,
    ],
  )
}
