import type { Queryable } from '../../db/queryable.js'
import type { ProjectTransferStatus } from '../../domain/public.js'

export interface ProjectTransferRecord {
  id: string
  projectId: string
  sourceCompanyId: string
  targetCompanyId: string
  status: ProjectTransferStatus
  requestedBy: string
  teacherConfirmedBy: string | null
  educationConfirmedBy: string | null
  version: number
}

export interface ProjectTransferReadiness {
  teacherOwnerConfirmed: boolean
  educationAdminConfirmed: boolean
  targetMembershipActive: boolean
  targetSeatActive: boolean
  policyEnabled: boolean
  policyVersionConfigured: boolean
  legalBasisConfigured: boolean
  policySnapshot: { contractId: string; policyVersion: string; legalBasis: string } | null
}

interface TransferRow {
  id: string
  project_id: string
  source_company_id: string
  target_company_id: string
  status: ProjectTransferStatus
  requested_by: string
  teacher_confirmed_by: string | null
  education_confirmed_by: string | null
  version: string | number
}

function record(row: TransferRow): ProjectTransferRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceCompanyId: row.source_company_id,
    targetCompanyId: row.target_company_id,
    status: row.status,
    requestedBy: row.requested_by,
    teacherConfirmedBy: row.teacher_confirmed_by,
    educationConfirmedBy: row.education_confirmed_by,
    version: Number(row.version),
  }
}

export async function createProjectTransfer(db: Queryable, input: {
  id: string
  projectId: string
  sourceCompanyId: string
  targetCompanyId: string
  requestedBy: string
}): Promise<{ transfer: ProjectTransferRecord; created: boolean }> {
  const inserted = await db.query<TransferRow>(
    `INSERT INTO project_transfers(id,project_id,source_company_id,target_company_id,requested_by)
     SELECT $1,project.id,project.company_id,target.id,$5
       FROM projects project
       JOIN companies target ON target.id=$4 AND target.type='EDUCATION'
        AND target.status IN ('TRIAL','ACTIVE')
      WHERE project.id=$2 AND project.company_id=$3 AND project.kind='TEACHING'
        AND project.status='ACTIVE'
     ON CONFLICT (project_id) DO NOTHING
     RETURNING *`,
    [input.id, input.projectId, input.sourceCompanyId, input.targetCompanyId, input.requestedBy],
  )
  if (inserted.rows[0]) return { transfer: record(inserted.rows[0]), created: true }
  const existing = await lockProjectTransfer(db, input.projectId)
  if (!existing) throw new Error('active Teaching Project and target Education Company required')
  if (existing.id !== input.id || existing.sourceCompanyId !== input.sourceCompanyId
    || existing.targetCompanyId !== input.targetCompanyId || existing.requestedBy !== input.requestedBy) {
    throw new Error('Project Transfer idempotency identity was reused')
  }
  return { transfer: existing, created: false }
}

export async function lockProjectTransfer(
  db: Queryable,
  projectId: string,
): Promise<ProjectTransferRecord | null> {
  const { rows } = await db.query<TransferRow>(
    `SELECT * FROM project_transfers WHERE project_id=$1 FOR UPDATE`,
    [projectId],
  )
  return rows[0] ? record(rows[0]) : null
}

export async function confirmProjectTransfer(db: Queryable, input: {
  transferId: string
  actorUserId: string
  confirmation: 'teacher' | 'education'
}): Promise<boolean> {
  const prefix = input.confirmation === 'teacher' ? 'teacher' : 'education'
  const result = await db.query(
    `UPDATE project_transfers
        SET ${prefix}_confirmed_by=$2,${prefix}_confirmed_at=NOW(),version=version+1,updated_at=NOW()
      WHERE id=$1 AND status='PENDING' AND ${prefix}_confirmed_by IS NULL`,
    [input.transferId, input.actorUserId],
  )
  return (result.rowCount ?? 0) === 1
}

export async function projectTransferReadiness(
  db: Queryable,
  transfer: ProjectTransferRecord,
): Promise<ProjectTransferReadiness> {
  const { rows } = await db.query<{
    teacher_confirmed: boolean
    education_confirmed: boolean
    memberships_ready: boolean
    seats_ready: boolean
    contract_id: string | null
    policy_enabled: boolean
    policy_version: string | null
    legal_basis: string | null
  }>(
    `SELECT transfer.teacher_confirmed_by IS NOT NULL AS teacher_confirmed,
            transfer.education_confirmed_by IS NOT NULL AS education_confirmed,
            NOT EXISTS (
              SELECT 1 FROM project_memberships member
              LEFT JOIN company_memberships target_member
                ON target_member.company_id=transfer.target_company_id
               AND target_member.user_id=member.user_id AND target_member.status='ACTIVE'
              WHERE member.project_id=transfer.project_id
                AND member.company_id=transfer.source_company_id
                AND target_member.user_id IS NULL
            ) AS memberships_ready,
            NOT EXISTS (
              SELECT 1 FROM project_memberships member
              LEFT JOIN organization_seats seat
                ON seat.company_id=transfer.target_company_id AND seat.user_id=member.user_id
               AND seat.status='ACTIVE' AND seat.contract_id=contract.id
              WHERE member.project_id=transfer.project_id
                AND member.company_id=transfer.source_company_id
                AND seat.user_id IS NULL
            ) AS seats_ready,
            contract.id AS contract_id,
            COALESCE(contract.config #>> '{transfer,enabled}','')='true' AS policy_enabled,
            NULLIF(BTRIM(contract.config #>> '{transfer,policyVersion}'),'') AS policy_version,
            NULLIF(BTRIM(contract.config #>> '{transfer,legalBasis}'),'') AS legal_basis
       FROM project_transfers transfer
       JOIN companies target ON target.id=transfer.target_company_id
        AND target.type='EDUCATION' AND target.status IN ('TRIAL','ACTIVE')
       LEFT JOIN education_contracts contract ON contract.company_id=transfer.target_company_id
        AND contract.status IN ('TRIAL','ACTIVE')
        AND contract.starts_at <= CURRENT_TIMESTAMP AND contract.ends_at > CURRENT_TIMESTAMP
      WHERE transfer.id=$1`,
    [transfer.id],
  )
  const row = rows[0]
  const policySnapshot = row?.contract_id && row.policy_version && row.legal_basis
    ? { contractId: row.contract_id, policyVersion: row.policy_version, legalBasis: row.legal_basis }
    : null
  return {
    teacherOwnerConfirmed: row?.teacher_confirmed ?? false,
    educationAdminConfirmed: row?.education_confirmed ?? false,
    targetMembershipActive: row?.memberships_ready ?? false,
    targetSeatActive: Boolean(row?.contract_id) && (row?.seats_ready ?? false),
    policyEnabled: row?.policy_enabled ?? false,
    policyVersionConfigured: Boolean(row?.policy_version),
    legalBasisConfigured: Boolean(row?.legal_basis),
    policySnapshot,
  }
}

export async function markProjectTransferReady(
  db: Queryable,
  transfer: ProjectTransferRecord,
  snapshot: NonNullable<ProjectTransferReadiness['policySnapshot']>,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE project_transfers SET status='READY',policy_snapshot=$3::jsonb,
            version=version+1,updated_at=NOW()
      WHERE id=$1 AND status='PENDING' AND version=$2`,
    [transfer.id, transfer.version, JSON.stringify(snapshot)],
  )
  return (result.rowCount ?? 0) === 1
}

export async function resolveProjectTransfer(db: Queryable, input: {
  transferId: string
  expected: 'PENDING' | 'READY'
  next: 'REJECTED' | 'CANCELLED'
  reason: string
}): Promise<boolean> {
  const result = await db.query(
    `UPDATE project_transfers SET status=$3,resolution_reason=$4,version=version+1,updated_at=NOW()
      WHERE id=$1 AND status=$2`,
    [input.transferId, input.expected, input.next, input.reason],
  )
  return (result.rowCount ?? 0) === 1
}

const PROJECT_OWNED_TABLES = [
  'boards', 'calendar_events', 'canvases', 'conversations', 'project_invitations',
  'project_memberships', 'courses', 'documents', 'knowledge_note_bindings',
  'knowledge_notebook_bindings', 'knowledge_source_chat_sessions', 'knowledge_sources',
  'knowledge_source_bindings',
  'document_mention_deliveries', 'project_visits', 'context_threads',
  'context_thread_participants', 'learning_project_teacher_agents',
  'learning_knowledge_units', 'learning_knowledge_unit_dependencies', 'learning_activities',
  'learning_activity_knowledge_units', 'learning_missions', 'learning_mission_steps',
  'learning_attempts', 'learning_evaluations', 'evidence_records', 'evidence_links',
  'evidence_claims', 'evidence_claim_evidence', 'learning_states', 'learning_cases',
  'learning_case_actions', 'notification_intents', 'notification_preferences',
  'notification_deliveries', 'notification_delivery_intents', 'attention_items',
  'attention_projection_events', 'teacher_briefings', 'teacher_briefing_attention_items',
] as const

export const PROJECT_TRANSFER_MUTABLE_TABLES = PROJECT_OWNED_TABLES

export async function completeProjectTransferOwnership(
  db: Queryable,
  transfer: ProjectTransferRecord,
): Promise<boolean> {
  const updates = PROJECT_OWNED_TABLES.map((table, index) =>
    `m${index} AS (UPDATE ${table} SET company_id=$3 WHERE project_id=$1 AND company_id=$2 RETURNING 1)`,
  ).join(',\n')
  const { rows } = await db.query<{ id: string }>(
    `WITH conversation_scope AS MATERIALIZED (
       SELECT id FROM conversations WHERE project_id=$1 AND company_id=$2
     ), course_scope AS MATERIALIZED (
       SELECT id FROM courses WHERE project_id=$1 AND company_id=$2
     ), document_scope AS MATERIALIZED (
       SELECT id FROM documents WHERE project_id=$1 AND company_id=$2
     ), calendar_scope AS MATERIALIZED (
       SELECT id FROM calendar_events WHERE project_id=$1 AND company_id=$2
     ), canvas_scope AS MATERIALIZED (
       SELECT id FROM canvases WHERE project_id=$1 AND company_id=$2
     ), source_scope AS MATERIALIZED (
       SELECT id FROM knowledge_sources WHERE project_id=$1 AND company_id=$2
     ), participant_copy AS (
       INSERT INTO participants
         (id,kind,name,role,initial,avatar_bg,status,bio,tools,system_prompt,capabilities,
          updated_at,departed_at,status_updated_at,avatar_url,preset_key,company_id,email)
       SELECT participant.id,participant.kind,participant.name,participant.role,participant.initial,
              participant.avatar_bg,participant.status,participant.bio,participant.tools,
              participant.system_prompt,participant.capabilities,NOW(),participant.departed_at,
              participant.status_updated_at,participant.avatar_url,participant.preset_key,$3,participant.email
         FROM participants participant
        WHERE participant.company_id=$2 AND (
          EXISTS (SELECT 1 FROM project_memberships member
                   WHERE member.project_id=$1 AND member.company_id=$2 AND member.user_id=participant.id)
          OR EXISTS (SELECT 1 FROM learning_project_teacher_agents teacher
                      WHERE teacher.project_id=$1 AND teacher.company_id=$2 AND teacher.agent_id=participant.id)
          OR EXISTS (SELECT 1 FROM learning_missions mission
                      WHERE mission.project_id=$1 AND mission.company_id=$2 AND mission.coordinator_agent_id=participant.id)
          OR EXISTS (SELECT 1 FROM canvas_agent_assignments assignment
                      WHERE assignment.canvas_id IN (SELECT id FROM canvas_scope)
                        AND assignment.agent_id=participant.id)
          OR EXISTS (SELECT 1 FROM canvas_assignment_reports report
                      WHERE report.canvas_id IN (SELECT id FROM canvas_scope)
                        AND report.company_id=$2 AND report.author_agent_id=participant.id)
          OR EXISTS (SELECT 1 FROM teacher_briefings briefing
                      WHERE briefing.project_id=$1 AND briefing.company_id=$2
                        AND briefing.sender_agent_id=participant.id)
          OR EXISTS (SELECT 1 FROM context_thread_participants thread_participant
                      WHERE thread_participant.project_id=$1 AND thread_participant.company_id=$2
                        AND thread_participant.participant_id=participant.id)
          OR EXISTS (SELECT 1 FROM agent_work_items work
                      WHERE work.company_id=$2 AND work.agent_id=participant.id AND (
                        work.channel_id IN (SELECT id FROM conversation_scope)
                        OR work.canvas_id IN (SELECT id FROM canvas_scope)))
          OR EXISTS (SELECT 1 FROM approvals approval
                      WHERE approval.company_id=$2 AND approval.agent_id=participant.id
                        AND approval.channel_id IN (SELECT id FROM conversation_scope))
          OR EXISTS (SELECT 1 FROM agent_os_sessions session
                      WHERE session.company_id=$2 AND session.agent_id=participant.id
                        AND session.channel_id IN (SELECT id FROM conversation_scope))
          OR EXISTS (SELECT 1 FROM agent_routines routine
                      WHERE routine.company_id=$2 AND routine.agent_id=participant.id
                        AND routine.channel_id IN (SELECT id FROM conversation_scope))
          OR EXISTS (SELECT 1 FROM agent_memory_evidence memory
                      WHERE memory.company_id=$2 AND memory.agent_id=participant.id
                        AND memory.conversation_id IN (SELECT id FROM conversation_scope))
          OR EXISTS (SELECT 1 FROM agent_handoffs handoff
                      WHERE handoff.company_id=$2
                        AND handoff.conversation_id IN (SELECT id FROM conversation_scope)
                        AND participant.id IN (handoff.from_agent_id,handoff.to_agent_id))
          OR EXISTS (SELECT 1 FROM conversations conversation
                      WHERE conversation.project_id=$1 AND conversation.company_id=$2
                        AND (conversation.leader_id=participant.id OR conversation.members ? participant.id))
        ) ON CONFLICT (id,company_id) DO NOTHING RETURNING 1
     ), indirect_convene AS (
       UPDATE convene_sessions SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_convening AS (
       UPDATE convening_info SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_reads AS (
       UPDATE conversation_reads SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_messages AS (
       UPDATE email_messages SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_attachments AS (
       UPDATE email_attachments SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_counters AS (
       UPDATE email_sequence_counters SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_bindings AS (
       UPDATE im_channel_bindings SET company_id=$3 WHERE company_id=$2
        AND channel_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_polls AS (
       UPDATE im_polls SET company_id=$3 WHERE company_id=$2
        AND channel_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_acceptances AS (
       UPDATE im_send_acceptances SET company_id=$3 WHERE company_id=$2
        AND channel_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_receipts AS (
       UPDATE im_read_receipt_advances SET company_id=$3 WHERE company_id=$2
        AND channel_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_reactions AS (
       UPDATE message_reactions SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_handoffs AS (
       UPDATE agent_handoffs SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_memory AS (
       UPDATE agent_memory_evidence SET company_id=$3 WHERE company_id=$2
        AND conversation_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_sessions AS (
       UPDATE agent_os_sessions SET company_id=$3 WHERE company_id=$2
        AND channel_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_routines AS (
       UPDATE agent_routines SET company_id=$3 WHERE company_id=$2
        AND channel_id IN (SELECT id FROM conversation_scope) RETURNING 1
     ), indirect_work AS (
       UPDATE agent_work_items SET company_id=$3 WHERE company_id=$2 AND (
         channel_id IN (SELECT id FROM conversation_scope)
         OR canvas_id IN (SELECT id FROM canvas_scope)
       ) RETURNING id
     ), indirect_approvals AS (
       UPDATE approvals SET company_id=$3 WHERE company_id=$2 AND (
         channel_id IN (SELECT id FROM conversation_scope)
         OR work_id IN (SELECT id FROM indirect_work)
       ) RETURNING 1
     ), indirect_dispatches AS (
       UPDATE calendar_dispatches SET company_id=$3 WHERE company_id=$2
        AND event_id IN (SELECT id FROM calendar_scope) RETURNING 1
     ), indirect_reminders AS (
       UPDATE calendar_reminders SET company_id=$3 WHERE company_id=$2
        AND event_id IN (SELECT id FROM calendar_scope) RETURNING 1
     ), indirect_mentions AS (
       UPDATE document_mentions SET company_id=$3 WHERE company_id=$2
        AND document_id IN (SELECT id FROM document_scope) RETURNING 1
     ), indirect_reports AS (
       UPDATE canvas_assignment_reports SET company_id=$3 WHERE company_id=$2
        AND canvas_id IN (SELECT id FROM canvas_scope) RETURNING 1
     ), indirect_insights AS (
       UPDATE knowledge_insight_bindings SET company_id=$3 WHERE company_id=$2
        AND source_id IN (SELECT id FROM source_scope) RETURNING 1
     ), indirect_course_rooms AS (
       UPDATE learning_course_rooms SET company_id=$3 WHERE company_id=$2
        AND course_id IN (SELECT id FROM course_scope) RETURNING 1
     ), indirect_teacher_rooms AS (
       UPDATE learning_course_teacher_rooms SET company_id=$3 WHERE company_id=$2
        AND course_id IN (SELECT id FROM course_scope) RETURNING 1
     ), indirect_effects AS (
       UPDATE learning_effects SET company_id=$3 WHERE company_id=$2
        AND course_id IN (SELECT id FROM course_scope) RETURNING 1
     ), ${updates}, transferred AS (
       UPDATE projects SET company_id=$3,kind='INSTITUTIONAL_COURSE',plan_id=NULL,
              status='ACTIVE',updated_at=NOW()
        WHERE id=$1 AND company_id=$2 AND kind='TEACHING' AND status='TRANSFER_PENDING'
        RETURNING id
     ) SELECT id FROM transferred`,
    [transfer.projectId, transfer.sourceCompanyId, transfer.targetCompanyId],
  )
  return Boolean(rows[0])
}

export async function markProjectTransferCompleted(
  db: Queryable,
  transferId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE project_transfers SET status='COMPLETED',completed_at=NOW(),version=version+1,updated_at=NOW()
      WHERE id=$1 AND status='READY'`,
    [transferId],
  )
  return (result.rowCount ?? 0) === 1
}
