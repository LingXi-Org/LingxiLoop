import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import type { ContextType } from './contracts.js'

export interface ScopedParticipant {
  id: string
  kind: 'agent' | 'human'
  name: string
  departed_at: string | null
}

export interface ContextThreadRow {
  id: string
  channel_id: string
  context_type: ContextType
  context_id: string
  created_by: string
  participant_ids: string[]
}

export async function lockContextIdentity(db: Queryable, identity: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity])
}

export async function findScopedParticipant(
  db: Queryable,
  args: { companyId: string; participantId: string },
): Promise<ScopedParticipant | null> {
  const { rows } = await db.query<ScopedParticipant>(
    `SELECT participant.id,participant.kind,participant.name,participant.departed_at
       FROM participants participant
      WHERE participant.company_id=$1 AND participant.id=$2`,
    [args.companyId, args.participantId],
  )
  return rows[0] ?? null
}

export async function learningCaseBelongsToStudent(
  db: Queryable,
  args: { companyId: string; projectId: string; caseId: string; studentId: string },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_cases
      WHERE company_id=$1 AND project_id=$2 AND id=$3 AND user_id=$4`,
    [args.companyId, args.projectId, args.caseId, args.studentId],
  )
  return Boolean(rows[0])
}

export async function isManagedTeacherAgent(db: Queryable, companyId: string, agentId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_project_teacher_agents WHERE company_id=$1 AND agent_id=$2`,
    [companyId, agentId],
  )
  return Boolean(rows[0])
}

export async function findActiveDefaultProjectId(db: Queryable, companyId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM projects
      WHERE company_id=$1 AND is_default=TRUE AND status='ACTIVE'
      LIMIT 1`,
    [companyId],
  )
  return rows[0]?.id ?? null
}

export async function listActiveAgentIds(db: Queryable, companyId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM participants
      WHERE company_id=$1 AND kind='agent' AND departed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM learning_project_teacher_agents managed
           WHERE managed.company_id=participants.company_id AND managed.agent_id=participants.id)
      ORDER BY id`,
    [companyId],
  )
  return rows.map((row) => row.id)
}

export async function findContextThread(
  db: Queryable,
  args: { companyId: string; projectId: string; contextType: ContextType; contextId: string },
): Promise<ContextThreadRow | null> {
  const { rows } = await db.query<ContextThreadRow>(
    `SELECT thread.id,thread.channel_id,thread.context_type,thread.context_id,thread.created_by,
            COALESCE(jsonb_agg(member.participant_id ORDER BY member.participant_id)
              FILTER (WHERE member.participant_id IS NOT NULL),'[]'::jsonb) AS participant_ids
       FROM context_threads thread
       LEFT JOIN context_thread_participants member
         ON member.thread_id=thread.id AND member.company_id=thread.company_id
      WHERE thread.company_id=$1 AND thread.project_id=$2
        AND thread.context_type=$3 AND thread.context_id=$4
      GROUP BY thread.id`,
    [args.companyId, args.projectId, args.contextType, args.contextId],
  )
  return rows[0] ?? null
}

export async function insertContextThreadBundle(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    contextType: ContextType
    contextId: string
    createdBy: string
    participantIds: string[]
    profile: ImChannelProfile
  },
): Promise<void> {
  await db.query(
    `INSERT INTO conversations
       (id,kind,title,topic,members,leader_id,pinned,tag,company_id,project_id)
     VALUES ($1,$2,$3,NULL,$4::jsonb,NULL,FALSE,$5,$6,$7)`,
    [args.profile.channelId, args.profile.kind, args.profile.title,
      JSON.stringify(args.participantIds), 'context-thread', args.companyId, args.projectId],
  )
  await db.query(
    `INSERT INTO im_channel_bindings (channel_id,company_id,profile,leader_agent_id,preset_key)
     VALUES ($1,$2,$3::jsonb,NULL,NULL)`,
    [args.profile.channelId, args.companyId, JSON.stringify(args.profile)],
  )
  await db.query(
    `INSERT INTO context_threads
       (id,company_id,project_id,context_type,context_id,channel_id,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [args.id, args.companyId, args.projectId, args.contextType, args.contextId,
      args.profile.channelId, args.createdBy],
  )
  for (const participantId of args.participantIds) {
    await db.query(
      `INSERT INTO context_thread_participants
         (thread_id,company_id,project_id,participant_id)
       VALUES ($1,$2,$3,$4)`,
      [args.id, args.companyId, args.projectId, participantId],
    )
  }
}

export async function findTeacherOperationsChannel(
  db: Queryable,
  args: { companyId: string; projectId: string; channelId: string; agentId: string },
): Promise<{ members: string[] } | null> {
  const { rows } = await db.query<{ members: string[] }>(
    `SELECT conversation.members
       FROM conversations conversation
       JOIN learning_project_teacher_agents managed
         ON managed.company_id=conversation.company_id AND managed.project_id=conversation.project_id
        AND managed.agent_id=$4
      WHERE conversation.id=$3 AND conversation.company_id=$1 AND conversation.project_id=$2`,
    [args.companyId, args.projectId, args.channelId, args.agentId],
  )
  return rows[0] ?? null
}

export async function insertExistingChannelContextThread(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    contextType: ContextType
    contextId: string
    channelId: string
    createdBy: string
    participantIds: string[]
  },
): Promise<void> {
  await db.query(
    `INSERT INTO context_threads
       (id,company_id,project_id,context_type,context_id,channel_id,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [args.id, args.companyId, args.projectId, args.contextType, args.contextId,
      args.channelId, args.createdBy],
  )
  for (const participantId of args.participantIds) {
    await db.query(
      `INSERT INTO context_thread_participants(thread_id,company_id,project_id,participant_id)
       VALUES($1,$2,$3,$4)`,
      [args.id, args.companyId, args.projectId, participantId],
    )
  }
}
