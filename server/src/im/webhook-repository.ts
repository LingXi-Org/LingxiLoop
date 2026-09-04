import type { Queryable } from '../db/queryable.js'

export interface WebhookBindingRow {
  company_id: string
  profile: Record<string, unknown>
  leader_agent_id: string | null
}

export interface WebhookMemberRow {
  id: string
  name: string
  kind: 'human' | 'agent'
  preset_key: string | null
}

export interface TeacherRoomRow {
  course_id: string
  status: 'active' | 'closed'
  agent_id: string
  is_teacher: boolean
}

export async function lockWebhookReceipt(
  db: Queryable,
  input: { eventId: string; eventType: string; payloadHash: string },
): Promise<{ payloadHash: string; processed: boolean }> {
  await db.query(
    `INSERT INTO wukong_webhook_receipts(event_id,event_type,payload_hash)
     VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING`,
    [input.eventId, input.eventType, input.payloadHash],
  )
  const { rows } = await db.query<{ payload_hash: string; processed_at: string | null }>(
    `SELECT payload_hash,processed_at FROM wukong_webhook_receipts WHERE event_id=$1 FOR UPDATE`,
    [input.eventId],
  )
  if (!rows[0]) throw new Error('failed to lock WuKong webhook receipt')
  return { payloadHash: rows[0].payload_hash, processed: Boolean(rows[0].processed_at) }
}

export async function completeWebhookReceipt(db: Queryable, eventId: string): Promise<void> {
  await db.query(
    `UPDATE wukong_webhook_receipts SET processed_at=NOW(),error=NULL WHERE event_id=$1`,
    [eventId],
  )
}

export async function webhookBinding(db: Queryable, channelId: string): Promise<WebhookBindingRow | null> {
  const { rows } = await db.query<WebhookBindingRow>(
    `SELECT company_id,profile,leader_agent_id FROM im_channel_bindings WHERE channel_id=$1`,
    [channelId],
  )
  return rows[0] ?? null
}

export async function webhookMembers(
  db: Queryable,
  input: { companyId: string; memberIds: string[] },
): Promise<WebhookMemberRow[]> {
  const { rows } = await db.query<WebhookMemberRow>(
    `SELECT id,name,kind,preset_key FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
    [input.companyId, input.memberIds],
  )
  return rows
}

export async function teacherRoomForWebhook(
  db: Queryable,
  input: { channelId: string; authorId: string; companyId: string },
): Promise<TeacherRoomRow | null> {
  const { rows } = await db.query<TeacherRoomRow>(
    `SELECT room.course_id,room.status,teacher_agent.agent_id,
            EXISTS(
              SELECT 1 FROM project_memberships member
               WHERE member.project_id=course.project_id AND member.company_id=room.company_id
                 AND member.user_id=$2 AND member.status='ACTIVE'
                 AND member.role IN ('OWNER','TEACHER')
            ) AS is_teacher
       FROM learning_course_teacher_rooms room
       JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
       JOIN learning_project_teacher_agents teacher_agent
         ON teacher_agent.project_id=course.project_id AND teacher_agent.company_id=course.company_id
      WHERE room.conversation_id=$1 AND room.company_id=$3`,
    [input.channelId, input.authorId, input.companyId],
  )
  return rows[0] ?? null
}

export async function containsManagedTeacherAgent(
  db: Queryable,
  input: { companyId: string; agentIds: string[] },
): Promise<boolean> {
  if (input.agentIds.length === 0) return false
  const { rows } = await db.query(
    `SELECT 1 FROM learning_project_teacher_agents
      WHERE company_id=$1 AND agent_id=ANY($2::text[]) LIMIT 1`,
    [input.companyId, input.agentIds],
  )
  return Boolean(rows[0])
}

export async function webhookConversation(
  db: Queryable,
  input: { channelId: string; companyId: string },
): Promise<{ projectId: string | null; kind: string } | null> {
  const { rows } = await db.query<{ project_id: string | null; kind: string }>(
    `SELECT project_id,kind FROM conversations WHERE id=$1 AND company_id=$2 LIMIT 1`,
    [input.channelId, input.companyId],
  )
  return rows[0] ? { projectId: rows[0].project_id, kind: rows[0].kind } : null
}

export async function enqueueWebhookWork(
  db: Queryable,
  input: {
    workId: string
    companyId: string
    authorizationUserId: string
    agentId: string
    channelId: string
    threadRootClientMsgNo: string | null
    triggerClientMsgNo: string
    reason: string
    executionRole: 'coordinator' | 'specialist'
  },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO agent_work_items(
       id,company_id,authorization_user_id,agent_id,channel_id,thread_root_client_msg_no,
       trigger_client_msg_no,reason,execution_role
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING
     RETURNING id`,
    [
      input.workId,
      input.companyId,
      input.authorizationUserId,
      input.agentId,
      input.channelId,
      input.threadRootClientMsgNo,
      input.triggerClientMsgNo,
      input.reason,
      input.executionRole,
    ],
  )
  return rows[0]?.id ?? null
}
