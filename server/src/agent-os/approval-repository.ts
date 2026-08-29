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
  scope: Record<string, unknown>
  preview: Record<string, unknown>
}

export interface ApprovalWorkSourceRow {
  company_id: string
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
    `SELECT approval.* FROM agent_os_approvals approval
      JOIN conversations conversation ON conversation.id=approval.channel_id
     WHERE approval.company_id=$1 AND conversation.company_id=approval.company_id
       AND conversation.members @> to_jsonb(ARRAY[$2::text])
       AND (NOT EXISTS(
         SELECT 1 FROM learning_course_teacher_rooms room WHERE room.conversation_id=approval.channel_id
       ) OR EXISTS(
         SELECT 1 FROM learning_course_teacher_rooms room
         JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
         JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
         JOIN course_members teacher
           ON teacher.course_id=course.id AND teacher.company_id=course.company_id
           AND teacher.user_id=$2 AND teacher.role='teacher'
         WHERE room.conversation_id=approval.channel_id AND room.company_id=approval.company_id
           AND room.status='active' AND project.status='active'
       ))
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
            host.run_id,host.cell_id,host.call_index
       FROM agent_os_approvals approval
       JOIN agent_host_actions host ON host.idempotency_key=approval.idempotency_key
       JOIN conversations conversation ON conversation.id=approval.channel_id
      WHERE approval.id=$1 AND approval.company_id=$2
        AND conversation.company_id=approval.company_id
        AND conversation.members @> to_jsonb(ARRAY[$3::text])
        AND (NOT EXISTS(
          SELECT 1 FROM learning_course_teacher_rooms room WHERE room.conversation_id=approval.channel_id
        ) OR EXISTS(
          SELECT 1 FROM learning_course_teacher_rooms room
          JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
          JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
          JOIN course_members teacher
            ON teacher.course_id=course.id AND teacher.company_id=course.company_id
            AND teacher.user_id=$3 AND teacher.role='teacher'
          WHERE room.conversation_id=approval.channel_id AND room.company_id=approval.company_id
            AND room.status='active' AND project.status='active'
        ))
      FOR UPDATE OF approval`,
    [input.approvalId, input.companyId, input.userId],
  )
  return rows[0] ?? null
}

export async function expireApproval(
  db: Queryable,
  input: { approvalId: string; userId: string; error: string },
): Promise<void> {
  await db.query(
    `UPDATE agent_os_approvals
        SET status='expired',resolved_at=NOW(),resolved_by=$2,error=$3
      WHERE id=$1`,
    [input.approvalId, input.userId, input.error],
  )
}

export async function decideApproval(
  db: Queryable,
  input: { approvalId: string; status: 'approved' | 'rejected'; userId: string },
): Promise<void> {
  await db.query(
    `UPDATE agent_os_approvals SET status=$2,resolved_at=NOW(),resolved_by=$3 WHERE id=$1`,
    [input.approvalId, input.status, input.userId],
  )
}

export async function approvalWorkSource(
  db: Queryable,
  workId: string,
): Promise<ApprovalWorkSourceRow | null> {
  const { rows } = await db.query<ApprovalWorkSourceRow>(
    `SELECT company_id,agent_id,channel_id,thread_root_client_msg_no,reason,fence,execution_role
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
    `UPDATE agent_os_approvals SET result=$2::jsonb,error=$3 WHERE id=$1`,
    [input.approvalId, input.result === undefined ? null : JSON.stringify(input.result), input.error],
  )
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
  },
): Promise<void> {
  await db.query(
    `INSERT INTO agent_work_items(
       id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,priority,execution_role
     ) VALUES($1,$2,$3,$4,$5,'resume',200,$6)
     ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING`,
    [
      `resume-${input.approvalId}`,
      input.companyId,
      input.agentId,
      input.channelId,
      `approval:${input.approvalId}`,
      input.executionRole,
    ],
  )
}
