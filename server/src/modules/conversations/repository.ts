import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import type { SearchBuckets, WorkspacePolicy } from './contracts.js'

export interface ParticipantRow {
  id: string
  kind: 'agent' | 'human'
  name: string
  departed_at: string | null
}

export interface ConversationRow {
  id: string
  kind: string
  title: string
  topic: string | null
  members: string[]
  leader_id: string | null
  pinned: boolean
  project_id: string
}

interface BindingRow {
  profile: Record<string, unknown>
  leader_agent_id: string | null
  preset_key: string | null
}

export async function listParticipants(
  db: Queryable,
  companyId: string,
  ids: string[],
): Promise<ParticipantRow[]> {
  const { rows } = await db.query<ParticipantRow>(
    `SELECT id, kind, name, departed_at
       FROM participants
      WHERE company_id=$1 AND id=ANY($2::text[])`,
    [companyId, ids],
  )
  return rows
}

export async function hasManagedPulse(db: Queryable, companyId: string, ids: string[]): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_project_teacher_agents
      WHERE company_id=$1 AND agent_id=ANY($2::text[]) LIMIT 1`,
    [companyId, ids],
  )
  return Boolean(rows[0])
}

export async function listCourseHumanIds(
  db: Queryable,
  companyId: string,
  courseId: string,
  ids: string[],
): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM course_members
      WHERE company_id=$1 AND course_id=$2 AND user_id=ANY($3::text[])`,
    [companyId, courseId, ids],
  )
  return rows.map((row) => row.user_id)
}

export async function findDirectConversation(
  db: Queryable,
  args: { companyId: string; projectId: string; firstId: string; secondId: string },
): Promise<ConversationRow | null> {
  const { rows } = await db.query<ConversationRow>(
    `SELECT id,kind,title,topic,members,leader_id,pinned,project_id
       FROM conversations
      WHERE company_id=$1 AND project_id=$2 AND kind='direct'
        AND members @> to_jsonb(ARRAY[$3::text])
        AND members @> to_jsonb(ARRAY[$4::text])
        AND jsonb_array_length(members)=2
      ORDER BY updated_at DESC LIMIT 1`,
    [args.companyId, args.projectId, args.firstId, args.secondId],
  )
  return rows[0] ?? null
}

export async function findConversationWorkspacePolicy(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<WorkspacePolicy | null> {
  const { rows } = await db.query<{ project_status: string; course_id: string | null }>(
    `SELECT project.status AS project_status,course.id AS course_id
       FROM projects project
       LEFT JOIN courses course
         ON course.project_id=project.id AND course.company_id=project.company_id
      WHERE project.id=$1 AND project.company_id=$2`,
    [projectId, companyId],
  )
  const row = rows[0]
  return row ? { projectStatus: row.project_status, courseId: row.course_id } : null
}

export async function findConversationForUpdate(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  const { rows } = await db.query<ConversationRow>(
    `SELECT id,kind,title,topic,members,leader_id,pinned,project_id
       FROM conversations
      WHERE id=$1 AND company_id=$2
      FOR UPDATE`,
    [conversationId, companyId],
  )
  return rows[0] ?? null
}

export async function findConversation(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  const { rows } = await db.query<ConversationRow>(
    `SELECT id,kind,title,topic,members,leader_id,pinned,project_id
       FROM conversations
      WHERE id=$1 AND company_id=$2`,
    [conversationId, companyId],
  )
  return rows[0] ?? null
}

export async function findBindingForUpdate(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<BindingRow | null> {
  const { rows } = await db.query<BindingRow>(
    `SELECT profile,leader_agent_id,preset_key
       FROM im_channel_bindings
      WHERE channel_id=$1 AND company_id=$2
      FOR UPDATE`,
    [conversationId, companyId],
  )
  return rows[0] ?? null
}

export async function createConversationBundle(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    kind: 'direct' | 'group'
    title: string
    topic: string | null
    members: string[]
    leaderId: string | null
    tag: string | null
    profile: ImChannelProfile
  },
): Promise<boolean> {
  const inserted = await db.query(
    `INSERT INTO conversations
       (id,kind,title,topic,members,leader_id,pinned,tag,company_id,project_id)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,FALSE,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [args.id, args.kind, args.title, args.topic, JSON.stringify(args.members), args.leaderId,
      args.tag, args.companyId, args.projectId],
  )
  if ((inserted.rowCount ?? 0) === 0) return false
  await db.query(
    `INSERT INTO conversation_counters (conversation_id,next_sequence) VALUES ($1,1)`,
    [args.id],
  )
  await upsertBinding(db, args.companyId, args.profile, args.leaderId, null)
  return true
}

export async function upsertBinding(
  db: Queryable,
  companyId: string,
  profile: ImChannelProfile,
  leaderId: string | null,
  presetKey: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO im_channel_bindings (channel_id,company_id,profile,leader_agent_id,preset_key)
     VALUES ($1,$2,$3::jsonb,$4,$5)
     ON CONFLICT (channel_id) DO UPDATE
       SET profile=EXCLUDED.profile,leader_agent_id=EXCLUDED.leader_agent_id,
           preset_key=EXCLUDED.preset_key,updated_at=NOW()
     WHERE im_channel_bindings.company_id=EXCLUDED.company_id`,
    [profile.channelId, companyId, JSON.stringify(profile), leaderId, presetKey],
  )
}

export async function updateConversation(
  db: Queryable,
  args: {
    id: string
    companyId: string
    title?: string
    topic?: string | null
    members?: string[]
    leaderId?: string | null
    pinned?: boolean
  },
): Promise<void> {
  const values: unknown[] = []
  const sets: string[] = []
  const add = (column: string, value: unknown, cast = '') => {
    values.push(value)
    sets.push(`${column}=$${values.length}${cast}`)
  }
  if (Object.hasOwn(args, 'title')) add('title', args.title)
  if (Object.hasOwn(args, 'topic')) add('topic', args.topic)
  if (Object.hasOwn(args, 'members')) add('members', JSON.stringify(args.members), '::jsonb')
  if (Object.hasOwn(args, 'leaderId')) add('leader_id', args.leaderId)
  if (Object.hasOwn(args, 'pinned')) add('pinned', args.pinned)
  values.push(args.id, args.companyId)
  await db.query(
    `UPDATE conversations SET ${sets.join(',')},updated_at=NOW()
      WHERE id=$${values.length - 1} AND company_id=$${values.length}`,
    values,
  )
}

export async function setMute(
  db: Queryable,
  args: { userId: string; companyId: string; conversationId: string; until: Date | null; mute: boolean },
): Promise<void> {
  if (!args.mute) {
    await db.query(
      `DELETE FROM conversation_mutes mute
        USING conversations conversation
       WHERE mute.user_id=$1 AND mute.conversation_id=$2
         AND conversation.id=mute.conversation_id AND conversation.company_id=$3`,
      [args.userId, args.conversationId, args.companyId],
    )
    return
  }
  await db.query(
    `INSERT INTO conversation_mutes (user_id,conversation_id,muted_at,muted_until)
     SELECT $1,$2,NOW(),$3
       FROM conversations
      WHERE id=$2 AND company_id=$4 AND members @> to_jsonb(ARRAY[$1::text])
     ON CONFLICT (user_id,conversation_id)
     DO UPDATE SET muted_at=NOW(),muted_until=EXCLUDED.muted_until`,
    [args.userId, args.conversationId, args.until, args.companyId],
  )
}

export async function participantAllowedInProject(
  db: Queryable,
  args: { participantId: string; companyId: string; projectId: string },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM participants participant
      WHERE participant.id=$1 AND participant.company_id=$2 AND participant.departed_at IS NULL
        AND (
          participant.kind='agent'
          OR NOT EXISTS (SELECT 1 FROM courses WHERE company_id=$2 AND project_id=$3)
          OR EXISTS (
            SELECT 1 FROM courses course
            JOIN course_members member
              ON member.course_id=course.id AND member.company_id=course.company_id
            WHERE course.company_id=$2 AND course.project_id=$3 AND member.user_id=participant.id
          )
        )`,
    [args.participantId, args.companyId, args.projectId],
  )
  return Boolean(rows[0])
}

export async function searchWorkspace(
  db: Queryable,
  args: { companyId: string; projectId: string; userId: string; raw: string },
): Promise<SearchBuckets> {
  const escaped = args.raw.replace(/[\\%_]/g, (character) => `\\${character}`)
  const contains = `%${escaped}%`
  const exact = escaped
  const prefix = `${escaped}%`
  const common = [args.companyId, args.userId, contains, exact, prefix, args.projectId]
  const participantsPromise = db.query(
    `SELECT participant.id,participant.kind,participant.name,participant.role,participant.initial,
            CASE WHEN participant.kind='agent' THEN 'transparent' ELSE participant.avatar_bg END AS "avatarBg",
            CASE WHEN participant.kind='agent' THEN NULL ELSE participant.avatar_url END AS "avatarUrl",
            participant.status,participant.bio
       FROM participants participant
       LEFT JOIN learning_project_teacher_agents pulse
         ON pulse.company_id=participant.company_id AND pulse.agent_id=participant.id
      WHERE participant.company_id=$1 AND participant.departed_at IS NULL
        AND (pulse.agent_id IS NULL OR EXISTS (
          SELECT 1 FROM courses course
          JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
            AND teacher.user_id=$2 AND teacher.role='teacher'
          WHERE course.company_id=pulse.company_id AND course.project_id=pulse.project_id AND pulse.project_id=$6))
        AND (participant.kind='agent' OR EXISTS (
          SELECT 1 FROM projects project
          LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
          LEFT JOIN course_members member ON member.course_id=course.id AND member.company_id=course.company_id
            AND member.user_id=participant.id
          WHERE project.id=$6 AND project.company_id=$1
            AND (project.is_general=TRUE OR member.user_id IS NOT NULL)))
        AND (participant.name ILIKE $3 ESCAPE '\\' OR participant.role ILIKE $3 ESCAPE '\\' OR participant.id ILIKE $3 ESCAPE '\\')
      ORDER BY CASE WHEN lower(participant.name)=lower($4) THEN 0 WHEN participant.name ILIKE $5 ESCAPE '\\' THEN 1 ELSE 2 END,
               CASE participant.kind WHEN 'agent' THEN 0 ELSE 1 END,participant.name
      LIMIT 8`, common)
  const roomsPromise = db.query(
    `WITH my_rooms AS (
       SELECT conversation.id,conversation.kind,
              COALESCE(other_participant.name,conversation.title) AS title,
              conversation.members,project.name AS "projectName",conversation.updated_at
         FROM conversations conversation
         LEFT JOIN projects project ON project.id=conversation.project_id AND project.company_id=conversation.company_id
         LEFT JOIN LATERAL (
           SELECT participant.name
             FROM jsonb_array_elements_text(conversation.members) WITH ORDINALITY AS member(id,ord)
             JOIN participants participant ON participant.id=member.id AND participant.company_id=conversation.company_id
            WHERE member.id<>$2 ORDER BY member.ord LIMIT 1
         ) other_participant ON TRUE
        WHERE conversation.company_id=$1 AND conversation.project_id=$6 AND conversation.kind='direct'
          AND conversation.members @> to_jsonb(ARRAY[$2::text])
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(conversation.members) member(member_id)
            JOIN learning_project_teacher_agents pulse
              ON pulse.agent_id=member.member_id AND pulse.company_id=conversation.company_id))
     SELECT room.id,room.kind,room.title,room.members,room."projectName"
       FROM my_rooms room
      WHERE room.title ILIKE $3 ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM participants participant
         WHERE participant.company_id=$1 AND participant.name ILIKE $3 ESCAPE '\\'
           AND participant.id<>$2 AND room.members @> to_jsonb(ARRAY[participant.id::text]))
      ORDER BY CASE WHEN lower(room.title)=lower($4) THEN 0 WHEN room.title ILIKE $5 ESCAPE '\\' THEN 1 ELSE 2 END,
               room.updated_at DESC LIMIT 8`, common)
  const groupsPromise = db.query(
    `SELECT conversation.id,conversation.kind,conversation.title,conversation.members,project.name AS "projectName"
       FROM conversations conversation
       LEFT JOIN projects project ON project.id=conversation.project_id AND project.company_id=conversation.company_id
      WHERE conversation.company_id=$1 AND conversation.project_id=$6 AND conversation.kind='group'
        AND conversation.members @> to_jsonb(ARRAY[$2::text])
        AND (NOT EXISTS (
          SELECT 1 FROM learning_course_teacher_rooms room
           WHERE room.conversation_id=conversation.id AND room.company_id=conversation.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
            JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
            JOIN projects course_project ON course_project.id=course.project_id AND course_project.company_id=course.company_id
            JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
              AND teacher.user_id=$2 AND teacher.role='teacher'
            WHERE room.conversation_id=conversation.id AND room.company_id=conversation.company_id
              AND room.status='active' AND course_project.status='active'))
        AND (conversation.title ILIKE $3 ESCAPE '\\' OR conversation.topic ILIKE $3 ESCAPE '\\')
      ORDER BY CASE WHEN lower(conversation.title)=lower($4) THEN 0 WHEN conversation.title ILIKE $5 ESCAPE '\\' THEN 1 ELSE 2 END,
               conversation.updated_at DESC LIMIT 8`, common)
  const messagesPromise = db.query(
    `SELECT message.id,message.conversation_id AS "conversationId",
            CASE WHEN conversation.kind='direct' THEN COALESCE(other_participant.name,conversation.title) ELSE conversation.title END AS "conversationTitle",
            conversation.kind AS "conversationKind",message.author_id AS "authorId",
            author.name AS "authorName",message.body,message.created_at AS "createdAt"
       FROM messages message
       JOIN conversations conversation ON conversation.id=message.conversation_id AND conversation.company_id=$1
       LEFT JOIN participants author ON author.id=message.author_id AND author.company_id=conversation.company_id
       LEFT JOIN LATERAL (
         SELECT participant.name
           FROM jsonb_array_elements_text(conversation.members) WITH ORDINALITY AS member(id,ord)
           JOIN participants participant ON participant.id=member.id AND participant.company_id=conversation.company_id
          WHERE member.id<>$2 ORDER BY member.ord LIMIT 1
       ) other_participant ON TRUE
      WHERE conversation.project_id=$4 AND conversation.members @> to_jsonb(ARRAY[$2::text])
        AND (NOT EXISTS (
          SELECT 1 FROM learning_course_teacher_rooms room
           WHERE room.conversation_id=conversation.id AND room.company_id=conversation.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
            JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
            JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
            JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
              AND teacher.user_id=$2 AND teacher.role='teacher'
            WHERE room.conversation_id=conversation.id AND room.company_id=conversation.company_id
              AND room.status='active' AND project.status='active'))
        AND message.kind='text' AND message.body ILIKE $3 ESCAPE '\\'
      ORDER BY message.created_at DESC LIMIT 15`,
    [args.companyId, args.userId, contains, args.projectId],
  )
  const [participants, rooms, groups, messages] = await Promise.all([
    participantsPromise, roomsPromise, groupsPromise, messagesPromise,
  ])
  return { participants: participants.rows, rooms: rooms.rows, groups: groups.rows,
    messages: messages.rows as Array<Record<string, unknown> & { body: string }> }
}
