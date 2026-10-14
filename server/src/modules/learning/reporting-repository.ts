import { LEARNING_PERSONA_KEYS } from './preset.js'

import type { Queryable } from '../../db/queryable.js'



export async function studyRoomState(db: Queryable, companyId: string, courseId: string) {
  const { rows } = await db.query<{
    room_id: string | null; company_id: string; title: string; topic: string | null; leader_id: string | null
  }>(
    `SELECT course.study_room_conversation_id AS room_id,course.company_id,
            conversation.title,conversation.topic,conversation.leader_id
       FROM courses course
       LEFT JOIN conversations conversation
         ON conversation.id=course.study_room_conversation_id AND conversation.company_id=course.company_id
      WHERE course.id=$1 AND course.company_id=$2`,
    [courseId,companyId],
  )
  return rows[0] ?? null
}


export async function syncStudyRoomMembers(db: Queryable, args: {
  courseId: string; companyId: string; roomId: string; title: string; topic: string | null; leaderId: string | null
}) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT course_member.user_id AS id FROM project_memberships course_member
       JOIN courses course ON course.project_id=course_member.project_id AND course.company_id=course_member.company_id
      WHERE course.id=$1 AND course_member.company_id=$2 AND course_member.status='ACTIVE'
     UNION
     SELECT participant.id FROM participants participant
      WHERE participant.company_id=$2 AND participant.kind='agent'
        AND participant.preset_key=ANY($3::text[]) AND participant.departed_at IS NULL`,
    [args.courseId, args.companyId, LEARNING_PERSONA_KEYS],
  )
  const members = rows.map((row) => row.id)
  await db.query(
    `UPDATE conversations SET members=$2::jsonb,subtitle=$3,updated_at=NOW()
      WHERE id=$1 AND company_id=$4`,
    [args.roomId, JSON.stringify(members), `course · ${members.length}`, args.companyId],
  )
  const profile = {
    channelId: args.roomId, channelType: 2, kind: 'group', title: args.title,
    topic: args.topic, members, pinned: true, createdAt: new Date().toISOString(),
  }
  await db.query(
    `INSERT INTO im_channel_bindings (channel_id,company_id,profile,leader_agent_id)
     VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (channel_id) DO UPDATE SET
       company_id=EXCLUDED.company_id,profile=EXCLUDED.profile,leader_agent_id=EXCLUDED.leader_agent_id`,
    [args.roomId, args.companyId, JSON.stringify(profile), args.leaderId],
  )
  return members
}
