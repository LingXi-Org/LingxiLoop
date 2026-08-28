import type { Request } from 'express'
import type { AuthedRequest } from '../../auth.js'
import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import { PRIVILEGED_ROLES } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth } from '../../http/request-context.js'
import { wukongClient } from '../../im/wukong.js'

export async function requireCourseManager(
  req: Request & AuthedRequest,
  courseId: string,
): Promise<{ userId: string; companyId: string; companyRole: string; courseRole: string | null; projectId: string; status: string }> {
  const me = requireAuth(req)
  const { rows } = await pool.query<{
    company_id: string; company_role: string; course_role: string | null; project_id: string; status: string
  }>(
    `SELECT course.company_id, company_member.role AS company_role,
            course_member.role AS course_role, course.project_id, project.status
       FROM courses course
       JOIN projects project ON project.id=course.project_id
       JOIN company_members company_member
         ON company_member.company_id=course.company_id AND company_member.user_id=$2
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id AND course_member.user_id=$2
      WHERE course.id=$1`,
    [courseId, me],
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, 'course not found')
  if (!PRIVILEGED_ROLES.has(row.company_role) && row.course_role !== 'teacher') {
    throw new HttpError(403, 'this action requires a course teacher or company admin')
  }
  return {
    userId: me, companyId: row.company_id, companyRole: row.company_role,
    courseRole: row.course_role, projectId: row.project_id, status: row.status,
  }
}

export async function assertCanCreateCourse(userId: string, companyId: string): Promise<void> {
  const { rows } = await pool.query<{ company_role: string; is_teacher: boolean }>(
    `SELECT company_member.role AS company_role,
            EXISTS (
              SELECT 1 FROM course_members course_member
              JOIN courses course ON course.id=course_member.course_id
              JOIN projects project ON project.id=course.project_id
              WHERE course_member.company_id=$1 AND course_member.user_id=$2
                AND course_member.role='teacher' AND project.status='active'
            ) AS is_teacher
       FROM company_members company_member
      WHERE company_member.company_id=$1 AND company_member.user_id=$2`,
    [companyId, userId],
  )
  if (!rows[0]) throw new HttpError(403, 'not a member of this company')
  if (!PRIVILEGED_ROLES.has(rows[0].company_role) && !rows[0].is_teacher) {
    throw new HttpError(403, 'only a company admin or existing teacher can create courses')
  }
}

export async function syncCourseStudyRoom(courseId: string): Promise<void> {
  const { rows } = await pool.query<{
    room_id: string | null; company_id: string; title: string; topic: string | null; leader_id: string | null
  }>(
    `SELECT course.study_room_conversation_id AS room_id, course.company_id,
            conversation.title, conversation.topic, conversation.leader_id
       FROM courses course
       LEFT JOIN conversations conversation ON conversation.id=course.study_room_conversation_id
      WHERE course.id=$1`, [courseId],
  )
  const course = rows[0]
  if (!course?.room_id) return
  const { rows: members } = await pool.query<{ id: string }>(
    `SELECT course_member.user_id AS id FROM course_members course_member WHERE course_member.course_id=$1
     UNION
     SELECT participant.id FROM participants participant
      WHERE participant.company_id=$2 AND participant.kind='agent'
        AND participant.preset_key IN ('nova','sage','milo','trace')
        AND participant.departed_at IS NULL`,
    [courseId, course.company_id],
  )
  const memberIds = members.map((member) => member.id)
  await pool.query(
    `UPDATE conversations SET members=$2::jsonb, subtitle=$3, updated_at=NOW()
      WHERE id=$1 AND company_id=$4`,
    [course.room_id, JSON.stringify(memberIds), `course · ${memberIds.length}`, course.company_id],
  )
  const profile = {
    channelId: course.room_id, channelType: 2, kind: 'group', title: course.title,
    topic: course.topic, members: memberIds, pinned: true, createdAt: new Date().toISOString(),
  }
  await pool.query(
    `INSERT INTO im_channel_bindings (channel_id,company_id,profile,leader_agent_id)
     VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (channel_id) DO UPDATE SET profile=EXCLUDED.profile,leader_agent_id=EXCLUDED.leader_agent_id`,
    [course.room_id, course.company_id, JSON.stringify(profile), course.leader_id],
  )
  await wukongClient().upsertChannel({
    channelId: course.room_id, channelType: 2, title: course.title,
    members: memberIds, ...(course.leader_id ? { leaderAgentId: course.leader_id } : {}),
  })
}

export function buildCourseInviteUrl(token: string): string {
  const base = (env.INVITE_BASE_URL || env.AUTH_DONE_URL).replace(/\/+$/, '')
  return `${base}/invite/course/${encodeURIComponent(token)}`
}
