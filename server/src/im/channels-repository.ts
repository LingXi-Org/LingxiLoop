import type { Queryable } from '../db/queryable.js'

export interface WorkspaceChannelRow {
  channel_id: string
  profile: Record<string, unknown>
  leader_agent_id: string | null
  preset_key: string | null
  kind: string
  title: string
  members: string[]
  muted: boolean
  muted_until: string | null
}

export async function workspaceChannels(
  db: Queryable,
  input: { companyId: string; userId: string; projectId: string },
): Promise<WorkspaceChannelRow[]> {
  const { rows } = await db.query<WorkspaceChannelRow>(
    `SELECT binding.channel_id,binding.profile,binding.leader_agent_id,binding.preset_key,
            conversation.kind,conversation.members,
            CASE WHEN conversation.kind='direct'
              THEN COALESCE(other_participant.name,conversation.title) ELSE conversation.title END AS title,
            (mute.user_id IS NOT NULL AND (mute.muted_until IS NULL OR mute.muted_until>NOW())) AS muted,
            mute.muted_until
       FROM im_channel_bindings binding
       JOIN conversations conversation ON conversation.id=binding.channel_id
       LEFT JOIN conversation_mutes mute
         ON mute.conversation_id=conversation.id AND mute.user_id=$2
       LEFT JOIN LATERAL (
         SELECT participant.name
           FROM jsonb_array_elements_text(conversation.members) WITH ORDINALITY AS member(id,ord)
           JOIN participants participant
             ON participant.id=member.id AND participant.company_id=conversation.company_id
          WHERE member.id<>$2 ORDER BY member.ord LIMIT 1
       ) other_participant ON conversation.kind='direct'
      WHERE binding.company_id=$1 AND conversation.company_id=$1 AND conversation.project_id=$3
        AND conversation.members @> to_jsonb(ARRAY[$2::text])
        AND (NOT EXISTS(
          SELECT 1 FROM learning_course_teacher_rooms room WHERE room.conversation_id=binding.channel_id
        ) OR EXISTS(
          SELECT 1 FROM learning_course_teacher_rooms room
          JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
          JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
          JOIN project_memberships course_member
            ON course_member.project_id=course.project_id AND course_member.company_id=course.company_id
            AND course_member.user_id=$2 AND course_member.status='ACTIVE'
            AND course_member.role IN ('OWNER','TEACHER')
          WHERE room.conversation_id=binding.channel_id AND room.company_id=binding.company_id
            AND room.status='active' AND project.status='ACTIVE'
        ))
      ORDER BY (binding.profile->>'pinned')::boolean DESC,binding.created_at`,
    [input.companyId, input.userId, input.projectId],
  )
  return rows
}
