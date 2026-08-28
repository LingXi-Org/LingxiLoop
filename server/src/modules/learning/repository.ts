import type { Queryable } from '../../db/queryable.js'
import type {
  CourseManager,
  CreateCourseInput,
  LearningNotificationPreferences,
  NotificationPreferencesInput,
  UpdateCourseInput,
} from './contracts.js'
import type {
  LearningActivity,
  LearningActivityType,
  LearningMission,
  LearningMissionStep,
  LearningObjective,
  LearningObjectiveStatus,
} from '../../learning/types.js'
import type { LearningAgentRoomScope } from './contracts.js'

export async function listCourses(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT course.id,course.company_id AS "companyId",course.created_by AS "createdBy",
            course.study_room_conversation_id AS "studyRoomId",course.created_at AS "createdAt",
            project.id AS "projectId",project.name,project.description,project.color,project.status,
            project.created_at AS "projectCreatedAt",project.updated_at AS "updatedAt",
            company_member.role AS "companyRole",course_member.role AS "courseRole",
            (SELECT COUNT(*)::int FROM course_members member WHERE member.course_id=course.id) AS "memberCount",
            (company_member.role IN ('owner','admin') OR course_member.role='teacher') AS "canManage"
       FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN company_members company_member ON company_member.company_id=course.company_id AND company_member.user_id=$2
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id AND course_member.company_id=course.company_id AND course_member.user_id=$2
      WHERE course.company_id=$1
        AND (company_member.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)
      ORDER BY project.status,project.updated_at DESC`,
    [companyId, userId],
  )
  return rows
}

export async function canCreateCourse(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query<{ company_role: string; is_teacher: boolean }>(
    `SELECT company_member.role AS company_role,
            EXISTS (SELECT 1 FROM course_members course_member
              JOIN courses course ON course.id=course_member.course_id AND course.company_id=course_member.company_id
              JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
             WHERE course_member.company_id=$1 AND course_member.user_id=$2
               AND course_member.role='teacher' AND project.status='active') AS is_teacher
       FROM company_members company_member
      WHERE company_member.company_id=$1 AND company_member.user_id=$2`,
    [companyId, userId],
  )
  return rows[0] ?? null
}

export async function insertCourse(db: Queryable, args: {
  companyId: string; userId: string; projectId: string; courseId: string; roomId: string; input: CreateCourseInput
}): Promise<void> {
  await db.query(
    `INSERT INTO projects (id,company_id,name,description,color,created_by,is_general)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE)`,
    [args.projectId, args.companyId, args.input.name, args.input.description, args.input.color, args.userId],
  )
  await db.query(
    `INSERT INTO courses (id,company_id,project_id,created_by) VALUES ($1,$2,$3,$4)`,
    [args.courseId, args.companyId, args.projectId, args.userId],
  )
  await db.query(
    `INSERT INTO course_members (course_id,company_id,user_id,role) VALUES ($1,$2,$3,'teacher')`,
    [args.courseId, args.companyId, args.userId],
  )
  const { rows: agents } = await db.query<{ id: string; preset_key: string }>(
    `SELECT id,preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' AND preset_key IN ('nova','sage','milo','trace') AND departed_at IS NULL`,
    [args.companyId],
  )
  const memberIds = [args.userId, ...agents.map((agent) => agent.id)]
  const leaderId = agents.find((agent) => agent.preset_key === 'nova')?.id ?? agents[0]?.id ?? null
  await db.query(
    `INSERT INTO conversations
       (id,kind,title,subtitle,topic,members,leader_id,pinned,tag,company_id,project_id)
     VALUES ($1,'group',$2,$3,$4,$5::jsonb,$6,TRUE,'course',$7,$8)`,
    [args.roomId, `${args.input.name} · Study Room`, `course · ${memberIds.length}`,
      '课程学习、讨论、练习与错因诊断', JSON.stringify(memberIds), leaderId, args.companyId, args.projectId],
  )
  await db.query(`INSERT INTO conversation_counters (conversation_id,next_sequence) VALUES ($1,1)`, [args.roomId])
  await db.query(
    `UPDATE courses SET study_room_conversation_id=$2 WHERE id=$1 AND company_id=$3`,
    [args.courseId, args.roomId, args.companyId],
  )
}

export async function findCourse(db: Queryable, courseId: string, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT course.id,course.company_id AS "companyId",course.project_id AS "projectId",
            course.created_by AS "createdBy",course.study_room_conversation_id AS "studyRoomId",
            project.name,project.description,project.color,project.status,
            company_member.role AS "companyRole",course_member.role AS "courseRole",
            (SELECT COUNT(*)::int FROM course_members member WHERE member.course_id=course.id) AS "memberCount",
            (company_member.role IN ('owner','admin') OR course_member.role='teacher') AS "canManage"
       FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN company_members company_member ON company_member.company_id=course.company_id AND company_member.user_id=$3
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id AND course_member.company_id=course.company_id AND course_member.user_id=$3
      WHERE course.id=$1 AND course.company_id=$2
        AND (company_member.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)`,
    [courseId, companyId, userId],
  )
  return rows[0] ?? null
}

export async function courseManager(db: Queryable, courseId: string, userId: string): Promise<CourseManager | null> {
  const { rows } = await db.query<{
    company_id: string; company_role: string; course_role: string | null; project_id: string; status: string
  }>(
    `SELECT course.company_id,company_member.role AS company_role,course_member.role AS course_role,
            course.project_id,project.status
       FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN company_members company_member ON company_member.company_id=course.company_id AND company_member.user_id=$2
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id AND course_member.company_id=course.company_id AND course_member.user_id=$2
      WHERE course.id=$1`,
    [courseId, userId],
  )
  const row = rows[0]
  return row ? {
    userId, companyId: row.company_id, companyRole: row.company_role,
    courseRole: row.course_role, projectId: row.project_id, status: row.status,
  } : null
}

export async function updateCourseMetadata(db: Queryable, args: {
  courseId: string; companyId: string; projectId: string; patch: UpdateCourseInput
}): Promise<void> {
  const values: unknown[] = []
  const sets: string[] = []
  for (const [field, column] of Object.entries({ name: 'name', description: 'description', color: 'color' }) as Array<[keyof UpdateCourseInput, string]>) {
    if (!Object.hasOwn(args.patch, field)) continue
    values.push(args.patch[field]); sets.push(`${column}=$${values.length}`)
  }
  values.push(args.projectId, args.companyId)
  await db.query(
    `UPDATE projects SET ${sets.join(',')},updated_at=NOW()
      WHERE id=$${values.length - 1} AND company_id=$${values.length}`,
    values,
  )
  if (args.patch.name !== undefined) {
    await db.query(
      `UPDATE conversations conversation SET title=$3,updated_at=NOW()
        FROM courses course
       WHERE course.id=$1 AND course.company_id=$2
         AND conversation.id=course.study_room_conversation_id AND conversation.company_id=course.company_id`,
      [args.courseId, args.companyId, `${args.patch.name} · Study Room`],
    )
    await db.query(
      `UPDATE participants participant SET name=$3,updated_at=NOW()
       FROM courses course JOIN learning_project_teacher_agents pulse
         ON pulse.project_id=course.project_id AND pulse.company_id=course.company_id
      WHERE course.id=$1 AND course.company_id=$2
        AND participant.id=pulse.agent_id AND participant.company_id=pulse.company_id`,
      [args.courseId, args.companyId, `Pulse · ${args.patch.name}`.slice(0, 80)],
    )
  }
}

export async function setCourseArchived(
  db: Queryable,
  companyId: string,
  projectId: string,
  archive: boolean,
): Promise<void> {
  await db.query(
    `UPDATE projects SET status=$3,archived_at=CASE WHEN $3='archived' THEN NOW() ELSE NULL END,updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [projectId, companyId, archive ? 'archived' : 'active'],
  )
}

export async function listCourseMembers(db: Queryable, courseId: string, companyId: string) {
  const { rows } = await db.query(
    `SELECT user_account.id,user_account.display_name AS name,user_account.email,course_member.role,
            course_member.joined_at AS "joinedAt"
       FROM course_members course_member JOIN users user_account ON user_account.id=course_member.user_id
       JOIN courses course ON course.id=course_member.course_id AND course.company_id=course_member.company_id
      WHERE course_member.course_id=$1 AND course_member.company_id=$2
      ORDER BY CASE course_member.role WHEN 'teacher' THEN 0 ELSE 1 END,course_member.joined_at`,
    [courseId, companyId],
  )
  return rows
}

export async function changeCourseMember(db: Queryable, args: {
  courseId: string; companyId: string; userId: string; role: 'teacher' | 'learner' | null
}): Promise<'updated' | 'not_found' | 'last_teacher'> {
  const { rows: locked } = await db.query(
    `SELECT 1 FROM courses WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [args.courseId, args.companyId],
  )
  if (!locked[0]) return 'not_found'
  const { rows } = await db.query<{ role: string }>(
    `SELECT role FROM course_members WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
    [args.courseId, args.companyId, args.userId],
  )
  const current = rows[0]?.role
  if (!current) return 'not_found'
  if (current === 'teacher' && args.role !== 'teacher') {
    const { rows: counts } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM course_members
        WHERE course_id=$1 AND company_id=$2 AND role='teacher'`,
      [args.courseId, args.companyId],
    )
    if ((counts[0]?.count ?? 0) <= 1) return 'last_teacher'
  }
  if (args.role) {
    await db.query(
      `UPDATE course_members SET role=$4,updated_at=NOW()
        WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
      [args.courseId, args.companyId, args.userId, args.role],
    )
  } else {
    await db.query(
      `DELETE FROM course_members WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
      [args.courseId, args.companyId, args.userId],
    )
  }
  return 'updated'
}

export async function removeMemberFromProjectChannels(db: Queryable, args: {
  companyId: string; projectId: string; userId: string
}) {
  const { rows } = await db.query<{ id: string; title: string; members: string[] }>(
    `UPDATE conversations conversation
        SET members=(SELECT COALESCE(jsonb_agg(value),'[]'::jsonb)
                       FROM jsonb_array_elements(conversation.members) value
                      WHERE value<>to_jsonb($3::text)),updated_at=NOW()
      WHERE conversation.company_id=$1 AND conversation.project_id=$2
        AND conversation.members@>to_jsonb(ARRAY[$3::text])
      RETURNING conversation.id,conversation.title,conversation.members`,
    [args.companyId, args.projectId, args.userId],
  )
  await db.query(
    `UPDATE im_channel_bindings binding
        SET profile=jsonb_set(binding.profile,'{members}',conversation.members,TRUE),updated_at=NOW()
       FROM conversations conversation
      WHERE binding.channel_id=conversation.id AND binding.company_id=$1 AND conversation.company_id=$1
        AND conversation.project_id=$2`,
    [args.companyId, args.projectId],
  )
  return rows
}

export async function listCourseInvitations(db: Queryable, courseId: string, companyId: string) {
  const { rows } = await db.query(
    `SELECT invitation.token_hash AS id,invitation.email,invitation.role,invitation.note,
            invitation.max_uses AS "maxUses",invitation.use_count AS "useCount",
            invitation.created_at AS "createdAt",invitation.expires_at AS "expiresAt",
            invitation.revoked_at AS "revokedAt",invitation.last_accepted_at AS "lastAcceptedAt",
            invitation.last_accepted_by AS "lastAcceptedBy",invitation.invited_by AS "invitedBy",
            user_account.display_name AS "inviterName",
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'userId',recent.user_id,'name',recent.display_name,'role',recent.role,'acceptedAt',recent.accepted_at
            ) ORDER BY recent.accepted_at DESC) FROM (
              SELECT acceptance.user_id,accepted_user.display_name,acceptance.role,acceptance.accepted_at
                FROM course_invitation_acceptances acceptance
                LEFT JOIN users accepted_user ON accepted_user.id=acceptance.user_id
               WHERE acceptance.token_hash=invitation.token_hash ORDER BY acceptance.accepted_at DESC LIMIT 10
            ) recent),'[]'::jsonb) AS acceptances,
            CASE WHEN invitation.revoked_at IS NOT NULL THEN 'revoked'
                 WHEN invitation.expires_at<NOW() THEN 'expired'
                 WHEN invitation.use_count>=invitation.max_uses THEN 'consumed' ELSE 'active' END AS status
       FROM course_invitations invitation
       JOIN courses course ON course.id=invitation.course_id AND course.company_id=invitation.company_id
       LEFT JOIN users user_account ON user_account.id=invitation.invited_by
      WHERE invitation.course_id=$1 AND invitation.company_id=$2 ORDER BY invitation.created_at DESC`,
    [courseId, companyId],
  )
  return rows
}

export async function insertCourseInvitation(db: Queryable, args: {
  tokenHash: string; courseId: string; companyId: string; userId: string; email: string | null
  role: 'teacher' | 'learner'; note: string | null; maxUses: number; expiresAt: Date
}): Promise<void> {
  await db.query(`SELECT 1 FROM courses WHERE id=$1 AND company_id=$2 FOR UPDATE`, [args.courseId, args.companyId])
  if (args.email) {
    await db.query(
      `UPDATE course_invitations SET revoked_at=NOW()
        WHERE course_id=$1 AND company_id=$2 AND email=$3
          AND revoked_at IS NULL AND expires_at>NOW() AND use_count<max_uses`,
      [args.courseId, args.companyId, args.email],
    )
  }
  await db.query(
    `INSERT INTO course_invitations
       (token_hash,course_id,company_id,invited_by,email,role,note,max_uses,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [args.tokenHash, args.courseId, args.companyId, args.userId, args.email,
      args.role, args.note, args.maxUses, args.expiresAt],
  )
}

export async function revokeCourseInvitation(
  db: Queryable,
  courseId: string,
  companyId: string,
  invitationId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE course_invitations SET revoked_at=NOW()
      WHERE token_hash=$1 AND course_id=$2 AND company_id=$3 AND revoked_at IS NULL`,
    [invitationId, courseId, companyId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function courseInvitationPreview(db: Queryable, tokenHash: string) {
  const { rows } = await db.query<{
    course_id: string; company_id: string; email: string | null; role: string; note: string | null
    max_uses: number; use_count: number; expires_at: string; revoked_at: string | null
    course_name: string; project_id: string; project_status: string; room_id: string | null
    company_name: string; company_slug: string; inviter_name: string | null
  }>(
    `SELECT invitation.course_id,invitation.company_id,invitation.email,invitation.role,invitation.note,
            invitation.max_uses,invitation.use_count,invitation.expires_at,invitation.revoked_at,
            project.name AS course_name,project.id AS project_id,project.status AS project_status,
            course.study_room_conversation_id AS room_id,company.name AS company_name,
            company.slug AS company_slug,user_account.display_name AS inviter_name
       FROM course_invitations invitation
       JOIN courses course ON course.id=invitation.course_id AND course.company_id=invitation.company_id
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN companies company ON company.id=course.company_id
       LEFT JOIN users user_account ON user_account.id=invitation.invited_by
      WHERE invitation.token_hash=$1`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function invitationViewer(db: Queryable, userId: string, courseId: string) {
  const { rows } = await db.query<{ email: string; role: string | null }>(
    `SELECT user_account.email,course_member.role FROM users user_account
       LEFT JOIN course_members course_member ON course_member.course_id=$2 AND course_member.user_id=user_account.id
      WHERE user_account.id=$1`,
    [userId, courseId],
  )
  return rows[0] ?? null
}

export async function findVerifiedUser(db: Queryable, userId: string) {
  const { rows } = await db.query<{
    email: string; display_name: string; avatar_url: string | null; email_verified_at: string | null
  }>(
    `SELECT email,display_name,avatar_url,email_verified_at FROM users WHERE id=$1`,
    [userId],
  )
  return rows[0] ?? null
}

export interface LockedCourseInvitation {
  company_id: string; course_id: string; email: string | null; role: 'teacher' | 'learner'
  max_uses: number; use_count: number; expires_at: string; revoked_at: string | null
  project_id: string; project_status: string; room_id: string | null; course_name: string
  company_name: string; company_slug: string
}

export async function lockCourseInvitation(db: Queryable, tokenHash: string, userId: string): Promise<LockedCourseInvitation | null> {
  await db.query(`SELECT 1 FROM users WHERE id=$1 FOR UPDATE`, [userId])
  const { rows } = await db.query<LockedCourseInvitation>(
    `SELECT invitation.company_id,invitation.course_id,invitation.email,invitation.role,
            invitation.max_uses,invitation.use_count,invitation.expires_at,invitation.revoked_at,
            course.project_id,project.status AS project_status,course.study_room_conversation_id AS room_id,
            project.name AS course_name,company.name AS company_name,company.slug AS company_slug
       FROM course_invitations invitation
       JOIN courses course ON course.id=invitation.course_id AND course.company_id=invitation.company_id
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN companies company ON company.id=course.company_id
      WHERE invitation.token_hash=$1 FOR UPDATE OF invitation`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function priorCourseAcceptance(db: Queryable, tokenHash: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM course_invitation_acceptances WHERE token_hash=$1 AND user_id=$2`,
    [tokenHash, userId],
  )
  return Boolean(rows[0])
}

export async function companyMembershipRole(db: Queryable, companyId: string, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2`,
    [companyId, userId],
  )
  return rows[0]?.role ?? null
}

export async function joinInvitationCompany(db: Queryable, args: {
  companyId: string; userId: string; displayName: string; avatarUrl: string
}): Promise<void> {
  await db.query(
    `INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$2,'member')`,
    [args.companyId, args.userId],
  )
  await db.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,avatar_url,status,departed_at)
     VALUES ($1,$2,'human',$3,NULL,$4,'#FF8870',$5,'avail',NULL)
     ON CONFLICT (id,company_id) DO UPDATE SET
       name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,status='avail',departed_at=NULL`,
    [args.userId, args.companyId, args.displayName, args.displayName.charAt(0).toUpperCase(), args.avatarUrl],
  )
}

export async function courseMembershipRole(db: Queryable, courseId: string, userId: string): Promise<'teacher' | 'learner' | null> {
  const { rows } = await db.query<{ role: 'teacher' | 'learner' }>(
    `SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`,
    [courseId, userId],
  )
  return rows[0]?.role ?? null
}

export async function upsertAcceptedCourseMembership(db: Queryable, args: {
  invitation: LockedCourseInvitation; userId: string; role: 'teacher' | 'learner'
}): Promise<'teacher' | 'learner'> {
  const { rows } = await db.query<{ role: 'teacher' | 'learner' }>(
    `INSERT INTO course_members (course_id,company_id,user_id,role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (course_id,user_id) DO UPDATE SET
       role=CASE WHEN course_members.role='teacher' OR EXCLUDED.role='teacher' THEN 'teacher' ELSE 'learner' END,
       updated_at=NOW() RETURNING role`,
    [args.invitation.course_id, args.invitation.company_id, args.userId, args.role],
  )
  return rows[0].role
}

export async function recordCourseAcceptance(db: Queryable, args: {
  tokenHash: string; userId: string; role: 'teacher' | 'learner'
}): Promise<void> {
  await db.query(
    `INSERT INTO course_invitation_acceptances (token_hash,user_id,role) VALUES ($1,$2,$3)`,
    [args.tokenHash, args.userId, args.role],
  )
  await db.query(
    `UPDATE course_invitations SET use_count=use_count+1,last_accepted_at=NOW(),last_accepted_by=$2
      WHERE token_hash=$1`,
    [args.tokenHash, args.userId],
  )
}

export async function courseExists(db: Queryable, courseId: string, companyId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM courses WHERE id=$1 AND company_id=$2`, [courseId, companyId])
  return Boolean(rows[0])
}

export async function courseRole(db: Queryable, courseId: string, companyId: string, userId: string) {
  const { rows } = await db.query<{ role: 'teacher' | 'learner' }>(
    `SELECT role FROM course_members WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
    [courseId, companyId, userId],
  )
  return rows[0]?.role ?? null
}

export async function owningCourseRole(db: Queryable, courseId: string, userId: string) {
  const { rows } = await db.query<{ company_id: string; role: 'teacher'|'learner' }>(
    `SELECT member.company_id,member.role
       FROM course_members member
       JOIN courses course ON course.id=member.course_id AND course.company_id=member.company_id
       JOIN company_members company_member ON company_member.company_id=member.company_id
         AND company_member.user_id=member.user_id
      WHERE member.course_id=$1 AND member.user_id=$2`,
    [courseId,userId],
  )
  return rows[0] ?? null
}

export async function setLearningCourseMembershipRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; userId: string; role: 'teacher'|'learner'; enabled: boolean
  },
): Promise<'updated'|'not_found'|'last_teacher'> {
  const { rows: locked } = await db.query(
    `SELECT 1 FROM courses WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [args.courseId,args.companyId],
  )
  if (!locked[0]) return 'not_found'
  const { rows: companyMember } = await db.query(
    `SELECT 1 FROM company_members WHERE company_id=$1 AND user_id=$2`,
    [args.companyId,args.userId],
  )
  if (!companyMember[0]) return 'not_found'
  const { rows } = await db.query<{ role: 'teacher'|'learner' }>(
    `SELECT role FROM course_members WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
    [args.courseId,args.companyId,args.userId],
  )
  const current = rows[0]?.role
  if (args.enabled) {
    await db.query(
      `INSERT INTO course_members(course_id,company_id,user_id,role)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(course_id,user_id) DO UPDATE SET role=EXCLUDED.role,updated_at=NOW()`,
      [args.courseId,args.companyId,args.userId,args.role],
    )
    return 'updated'
  }
  if (args.role === 'teacher') {
    if (current !== 'teacher') return 'updated'
    const { rows: counts } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM course_members
        WHERE course_id=$1 AND company_id=$2 AND role='teacher'`,
      [args.courseId,args.companyId],
    )
    if (Number(counts[0]?.count ?? 0) <= 1) return 'last_teacher'
    await db.query(
      `UPDATE course_members SET role='learner',updated_at=NOW()
        WHERE course_id=$1 AND company_id=$2 AND user_id=$3 AND role='teacher'`,
      [args.courseId,args.companyId,args.userId],
    )
    return 'updated'
  }
  await db.query(
    `DELETE FROM course_members
      WHERE course_id=$1 AND company_id=$2 AND user_id=$3 AND role='learner'`,
    [args.courseId,args.companyId,args.userId],
  )
  return 'updated'
}

export async function upsertLearningCourseRoom(
  db: Queryable,
  args: {
    companyId: string; courseId: string; conversationId: string
    purpose: 'lab'|'discussion'; createdBy: string
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_course_rooms(course_id,company_id,conversation_id,purpose,created_by)
     SELECT course.id,course.company_id,conversation.id,$4,$5
       FROM courses course
       JOIN conversations conversation ON conversation.company_id=course.company_id
         AND conversation.project_id=course.project_id
      WHERE course.id=$2 AND course.company_id=$1 AND conversation.id=$3
        AND conversation.kind='group'
        AND NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms teacher_room
          WHERE teacher_room.company_id=$1 AND teacher_room.conversation_id=conversation.id)
     ON CONFLICT(conversation_id) DO UPDATE SET
       course_id=EXCLUDED.course_id,company_id=EXCLUDED.company_id,
       purpose=EXCLUDED.purpose,created_by=EXCLUDED.created_by`,
    [args.companyId,args.courseId,args.conversationId,args.purpose,args.createdBy],
  )
  return Boolean(result.rowCount)
}

export async function deleteLearningCourseRoom(
  db: Queryable,
  args: { companyId: string; courseId: string; conversationId: string },
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM learning_course_rooms
      WHERE company_id=$1 AND course_id=$2 AND conversation_id=$3`,
    [args.companyId,args.courseId,args.conversationId],
  )
  return Boolean(result.rowCount)
}

export async function listDeliveries(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT * FROM learning_notification_deliveries
      WHERE company_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`,
    [companyId, userId],
  )
  return rows
}

export async function insertLearningObjective(
  db: Queryable,
  args: {
    id: string
    companyId: string
    courseId: string
    actorId: string
    title: string
    successCriteria: string
    targetLevel: 1 | 2 | 3 | 4
    position: number
  },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_objectives
       (id,course_id,company_id,title,success_criteria,target_level,position,status,created_by)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,'draft',$8
       FROM courses course WHERE course.id=$2 AND course.company_id=$3`,
    [args.id,args.courseId,args.companyId,args.title,args.successCriteria,args.targetLevel,args.position,args.actorId],
  )
  if (!result.rowCount) throw new Error('course not found')
}

export async function insertLearningObjectiveDependency(
  db: Queryable,
  args: { companyId: string; courseId: string; objectiveId: string; prerequisiteId: string },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_objective_dependencies(objective_id,prerequisite_objective_id)
     SELECT objective.id,prerequisite.id
       FROM learning_objectives objective
       JOIN learning_objectives prerequisite
         ON prerequisite.id=$4 AND prerequisite.course_id=objective.course_id
        AND prerequisite.company_id=objective.company_id
      WHERE objective.id=$1 AND objective.course_id=$2 AND objective.company_id=$3
     ON CONFLICT DO NOTHING`,
    [args.objectiveId,args.courseId,args.companyId,args.prerequisiteId],
  )
  if (!result.rowCount) throw new Error('prerequisite objective not found in the current course')
}

export async function listLearningObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<LearningObjective[]> {
  const { rows } = await db.query<{
    id: string; course_id: string; title: string; success_criteria: string; target_level: 1|2|3|4
    position: number; status: LearningObjectiveStatus; prerequisite_ids: string[]
  }>(
    `SELECT objective.id,objective.course_id,objective.title,objective.success_criteria,
            objective.target_level,objective.position,objective.status,
            COALESCE(array_agg(dependency.prerequisite_objective_id)
              FILTER (WHERE dependency.prerequisite_objective_id IS NOT NULL),'{}') AS prerequisite_ids
       FROM learning_objectives objective
       LEFT JOIN learning_objective_dependencies dependency ON dependency.objective_id=objective.id
      WHERE objective.course_id=$2 AND objective.company_id=$1
      GROUP BY objective.id ORDER BY objective.position,objective.created_at`,
    [companyId, courseId],
  )
  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    successCriteria: row.success_criteria,
    targetLevel: row.target_level,
    position: Number(row.position),
    status: row.status,
    prerequisiteIds: row.prerequisite_ids,
  }))
}

export async function updateLearningObjectiveStatus(
  db: Queryable,
  args: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: LearningObjectiveStatus
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_objectives objective SET status=$5,updated_at=NOW()
      WHERE objective.id=$3 AND objective.course_id=$2 AND objective.company_id=$1
        AND EXISTS(
          SELECT 1 FROM course_members member
           WHERE member.course_id=objective.course_id AND member.company_id=objective.company_id
             AND member.user_id=$4 AND member.role='teacher'
        )`,
    [args.companyId,args.courseId,args.objectiveId,args.teacherId,args.status],
  )
  return Boolean(result.rowCount)
}

interface LearningActivityRow {
  id: string
  course_id: string
  title: string
  instructions: string
  type: LearningActivity['type']
  status: LearningActivity['status']
  evaluation_mode: LearningActivity['evaluationMode']
  target_level: 1 | 2 | 3 | 4
  rubric: unknown[]
  objective_ids: string[]
  due_at: string | null
}

function mapLearningActivity(row: LearningActivityRow): LearningActivity {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    instructions: row.instructions,
    type: row.type,
    status: row.status,
    evaluationMode: row.evaluation_mode,
    targetLevel: row.target_level,
    rubric: Array.isArray(row.rubric) ? row.rubric : [],
    objectiveIds: Array.isArray(row.objective_ids) ? row.objective_ids.map(String) : [],
    ...(row.due_at ? { dueAt: String(row.due_at) } : {}),
  }
}

export async function countCourseObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveIds: string[],
): Promise<number> {
  if (!objectiveIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM learning_objectives
      WHERE company_id=$1 AND course_id=$2 AND id=ANY($3::text[])`,
    [companyId,courseId,objectiveIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function insertLearningActivity(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; actorId: string; title: string; instructions: string
    type: LearningActivityType; evaluationMode: LearningActivity['evaluationMode']; targetLevel: 1|2|3|4
    rubric: unknown[]; objectiveIds: string[]; dueAt?: string
  },
): Promise<void> {
  const result = await db.query(
    `INSERT INTO learning_activities
       (id,course_id,company_id,title,instructions,type,evaluation_mode,target_level,rubric,objective_ids,due_at,created_by)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12
       FROM courses course WHERE course.id=$2 AND course.company_id=$3`,
    [args.id,args.courseId,args.companyId,args.title,args.instructions,args.type,args.evaluationMode,args.targetLevel,
      JSON.stringify(args.rubric),JSON.stringify(args.objectiveIds),args.dueAt ?? null,args.actorId],
  )
  if (!result.rowCount) throw new Error('course not found')
}

export async function findLearningActivity(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<LearningActivity | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT id,course_id,title,instructions,type,status,evaluation_mode,target_level,rubric,objective_ids,due_at
       FROM learning_activities WHERE company_id=$1 AND course_id=$2 AND id=$3`,
    [companyId,courseId,activityId],
  )
  return rows[0] ? mapLearningActivity(rows[0]) : null
}

export async function findVisibleLearningActivity(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<LearningActivity | null> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT id,course_id,title,instructions,type,status,evaluation_mode,target_level,rubric,objective_ids,due_at
       FROM learning_activities
      WHERE company_id=$1 AND course_id=$2 AND id=$3 AND status IN ('published','closed')`,
    [companyId,courseId,activityId],
  )
  return rows[0] ? mapLearningActivity(rows[0]) : null
}

export async function listLearningActivities(
  db: Queryable,
  companyId: string,
  courseId: string,
  includeDrafts: boolean,
): Promise<LearningActivity[]> {
  const { rows } = await db.query<LearningActivityRow>(
    `SELECT id,course_id,title,instructions,type,status,evaluation_mode,target_level,rubric,objective_ids,due_at
       FROM learning_activities
      WHERE company_id=$1 AND course_id=$2 AND ($3::boolean OR status IN ('published','closed'))
      ORDER BY created_at DESC`,
    [companyId,courseId,includeDrafts],
  )
  return rows.map(mapLearningActivity)
}

export async function lockLearningActivityForPublish(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<Pick<LearningActivity, 'type' | 'rubric' | 'objectiveIds'> | null> {
  const { rows } = await db.query<Pick<LearningActivityRow, 'type' | 'rubric' | 'objective_ids'>>(
    `SELECT type,rubric,objective_ids FROM learning_activities
      WHERE company_id=$1 AND course_id=$2 AND id=$3 AND status='draft' FOR UPDATE`,
    [companyId,courseId,activityId],
  )
  const row = rows[0]
  return row ? {
    type: row.type,
    rubric: Array.isArray(row.rubric) ? row.rubric : [],
    objectiveIds: Array.isArray(row.objective_ids) ? row.objective_ids.map(String) : [],
  } : null
}

export async function countPublishedCourseObjectives(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveIds: string[],
): Promise<number> {
  if (!objectiveIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT id FROM learning_objectives
        WHERE company_id=$1 AND course_id=$2 AND status='published' AND id=ANY($3::text[])
        FOR SHARE
     ) locked_objective`,
    [companyId,courseId,objectiveIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function publishLearningActivityRecord(
  db: Queryable,
  args: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_activities activity
        SET status='published',published_by=$4,published_at=NOW(),updated_at=NOW()
      WHERE activity.company_id=$1 AND activity.course_id=$2 AND activity.id=$3 AND activity.status='draft'
        AND EXISTS(SELECT 1 FROM course_members member
          WHERE member.company_id=activity.company_id AND member.course_id=activity.course_id
            AND member.user_id=$4 AND member.role='teacher')`,
    [args.companyId,args.courseId,args.activityId,args.teacherId],
  )
  return Boolean(result.rowCount)
}

export async function closeLearningActivityRecord(
  db: Queryable,
  args: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_activities activity SET status='closed',updated_at=NOW()
      WHERE activity.company_id=$1 AND activity.course_id=$2 AND activity.id=$3 AND activity.status='published'
        AND EXISTS(SELECT 1 FROM course_members member
          WHERE member.company_id=activity.company_id AND member.course_id=activity.course_id
            AND member.user_id=$4 AND member.role='teacher')`,
    [args.companyId,args.courseId,args.activityId,args.teacherId],
  )
  return Boolean(result.rowCount)
}

export async function insertLearningActivityAttempt(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; activityId: string; learnerId: string
    assistance: 'none'|'hint'|'guided'; answer: string; idempotencyKey: string
  },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO learning_attempts(id,course_id,company_id,learner_id,activity_id,assistance,evidence,client_submission_id)
     SELECT $1,course.id,course.company_id,$5,activity.id,$6,$7::jsonb,$8
       FROM courses course
       JOIN learning_activities activity
         ON activity.course_id=course.id AND activity.company_id=course.company_id
        AND activity.id=$4 AND activity.status='published'
       JOIN course_members learner
         ON learner.course_id=course.id AND learner.company_id=course.company_id
        AND learner.user_id=$5 AND learner.role='learner'
      WHERE course.company_id=$2 AND course.id=$3
     ON CONFLICT(company_id,course_id,activity_id,learner_id,client_submission_id)
       WHERE client_submission_id IS NOT NULL
     DO UPDATE SET id=learning_attempts.id
     RETURNING id`,
    [args.id,args.companyId,args.courseId,args.activityId,args.learnerId,args.assistance,
      JSON.stringify({ kind: 'ui_submission', submittedBy: args.learnerId, answer: args.answer }),args.idempotencyKey],
  )
  return rows[0]?.id ?? null
}

interface LearningMissionRow {
  id: string; course_id: string; learner_id: string; conversation_id: string; trigger_client_msg_no: string
  goal: string; success_criteria: string; status: LearningMission['status']; mission_kind: LearningMission['missionKind']
  coordinator_agent_id: string; created_at: string; updated_at: string
}

interface LearningMissionStepRow {
  id: string; mission_id: string; type: LearningMissionStep['type']; description: string; success_criteria: string
  objective_id: string | null; status: LearningMissionStep['status']; position: number; outcome: string | null
  completion_report_id: string | null; completion_attempt_id: string | null
}

function mapLearningMissionStep(step: LearningMissionStepRow): LearningMissionStep {
  return {
    id: step.id,
    type: step.type,
    description: step.description,
    successCriteria: step.success_criteria,
    ...(step.objective_id ? { objectiveId: step.objective_id } : {}),
    status: step.status,
    position: Number(step.position),
    ...(step.outcome ? { outcome: step.outcome } : {}),
    ...(step.completion_report_id ? { completionReportId: step.completion_report_id } : {}),
    ...(step.completion_attempt_id ? { completionAttemptId: step.completion_attempt_id } : {}),
  }
}

function mapLearningMission(row: LearningMissionRow, steps: LearningMissionStepRow[]): LearningMission {
  return {
    id: row.id,
    courseId: row.course_id,
    learnerId: row.learner_id,
    conversationId: row.conversation_id,
    triggerClientMsgNo: row.trigger_client_msg_no,
    goal: row.goal,
    successCriteria: row.success_criteria,
    missionKind: row.mission_kind,
    coordinatorAgentId: row.coordinator_agent_id,
    status: row.status,
    steps: steps.map(mapLearningMissionStep),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

const learningMissionColumns = `mission.id,mission.course_id,mission.learner_id,mission.conversation_id,
  mission.trigger_client_msg_no,mission.goal,mission.success_criteria,mission.status,mission.mission_kind,
  mission.coordinator_agent_id,mission.created_at,mission.updated_at`

async function learningMissionSteps(
  db: Queryable,
  companyId: string,
  courseId: string,
  missionIds: string[],
): Promise<LearningMissionStepRow[]> {
  if (!missionIds.length) return []
  const { rows } = await db.query<LearningMissionStepRow>(
    `SELECT step.id,step.mission_id,step.type,step.description,step.success_criteria,step.objective_id,
            step.status,step.position,step.outcome,step.completion_report_id,step.completion_attempt_id
       FROM learning_mission_steps step
       JOIN learning_missions mission ON mission.id=step.mission_id
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.id=ANY($3::text[])
      ORDER BY step.mission_id,step.position,step.created_at`,
    [companyId,courseId,missionIds],
  )
  return rows
}

export async function findLearningMission(
  db: Queryable,
  companyId: string,
  courseId: string,
  missionId: string,
): Promise<LearningMission | null> {
  const { rows } = await db.query<LearningMissionRow>(
    `SELECT ${learningMissionColumns} FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.id=$3`,
    [companyId,courseId,missionId],
  )
  if (!rows[0]) return null
  return mapLearningMission(rows[0], await learningMissionSteps(db, companyId, courseId, [missionId]))
}

export async function listLearningMissions(
  db: Queryable,
  args: { companyId: string; courseId: string; userId: string; includeAllLearners: boolean },
): Promise<LearningMission[]> {
  const { rows } = await db.query<LearningMissionRow>(
    `SELECT ${learningMissionColumns} FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND ($3::boolean OR mission.learner_id=$4)
      ORDER BY mission.updated_at DESC LIMIT 100`,
    [args.companyId,args.courseId,args.includeAllLearners,args.userId],
  )
  const steps = await learningMissionSteps(db, args.companyId, args.courseId, rows.map((row) => row.id))
  const byMission = new Map<string, LearningMissionStepRow[]>()
  for (const step of steps) {
    const bucket = byMission.get(step.mission_id)
    if (bucket) bucket.push(step)
    else byMission.set(step.mission_id, [step])
  }
  return rows.map((row) => mapLearningMission(row, byMission.get(row.id) ?? []))
}

export async function updateLearningMissionCoordinator(
  db: Queryable,
  args: { companyId: string; courseId: string; missionId: string; teacherId: string; agentId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions mission SET coordinator_agent_id=agent.id,updated_at=NOW()
       FROM participants agent,conversations conversation
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.id=$3
        AND conversation.id=mission.conversation_id AND conversation.company_id=mission.company_id
        AND agent.id=$5 AND agent.company_id=mission.company_id AND agent.kind='agent' AND agent.departed_at IS NULL
        AND agent.capabilities @> '["canvas","learning"]'::jsonb AND conversation.members ? agent.id
        AND EXISTS(SELECT 1 FROM course_members teacher
          WHERE teacher.company_id=mission.company_id AND teacher.course_id=mission.course_id
            AND teacher.user_id=$4 AND teacher.role='teacher')`,
    [args.companyId,args.courseId,args.missionId,args.teacherId,args.agentId],
  )
  return Boolean(result.rowCount)
}

export interface LearningRoomState {
  companyId: string
  courseId: string
  projectId: string
  courseTitle: string
  courseStatus: 'active' | 'archived'
  purpose: 'study' | 'lab' | 'discussion'
}

export async function findLearningRoomState(
  db: Queryable,
  scope: LearningAgentRoomScope,
): Promise<LearningRoomState | null> {
  const { rows } = await db.query<{
    company_id: string; course_id: string; project_id: string; title: string
    status: LearningRoomState['courseStatus']; purpose: LearningRoomState['purpose']
  }>(
    `SELECT course.company_id,course.id AS course_id,course.project_id,project.name AS title,project.status,
            CASE WHEN course.study_room_conversation_id=$1 THEN 'study'::text ELSE room.purpose END AS purpose
       FROM courses course
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       LEFT JOIN learning_course_rooms room
         ON room.course_id=course.id AND room.company_id=course.company_id AND room.conversation_id=$1
      WHERE course.company_id=$2 AND project.status='active'
        AND (course.study_room_conversation_id=$1 OR room.conversation_id=$1)
      LIMIT 1`,
    [scope.channelId,scope.companyId],
  )
  const row = rows[0]
  return row ? {
    companyId: row.company_id,
    courseId: row.course_id,
    projectId: row.project_id,
    courseTitle: row.title,
    courseStatus: row.status,
    purpose: row.purpose,
  } : null
}

export async function lockLearningMission(
  db: Queryable,
  args: LearningAgentRoomScope & { courseId: string; missionId: string; statuses: LearningMission['status'][] },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_missions
      WHERE company_id=$1 AND course_id=$2 AND conversation_id=$3 AND id=$4 AND status=ANY($5::text[])
      FOR UPDATE`,
    [args.companyId,args.courseId,args.channelId,args.missionId,args.statuses],
  )
  return Boolean(rows[0])
}

export async function countLearningMissionSteps(db: Queryable, missionId: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM learning_mission_steps WHERE mission_id=$1`,
    [missionId],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function insertLearningMissionStep(
  db: Queryable,
  args: {
    id: string; missionId: string; type: LearningMissionStep['type']; description: string
    successCriteria: string; objectiveId?: string; position: number
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_mission_steps(id,mission_id,type,description,success_criteria,objective_id,position)
     SELECT $1,$2,$3,$4,$5,$6,$7
      WHERE NOT EXISTS(SELECT 1 FROM learning_mission_steps step
        WHERE step.mission_id=$2 AND lower(step.description)=lower($4))`,
    [args.id,args.missionId,args.type,args.description,args.successCriteria,args.objectiveId ?? null,args.position],
  )
  return Boolean(result.rowCount)
}

export async function learningMissionPlanningSummary(
  db: Queryable,
  missionId: string,
): Promise<{ total: number; checks: number; reflections: number }> {
  const { rows } = await db.query<{ total: number; checks: number; reflections: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE type='check')::int AS checks,
            COUNT(*) FILTER (WHERE type='reflect')::int AS reflections
       FROM learning_mission_steps WHERE mission_id=$1`,
    [missionId],
  )
  return {
    total: Number(rows[0]?.total ?? 0),
    checks: Number(rows[0]?.checks ?? 0),
    reflections: Number(rows[0]?.reflections ?? 0),
  }
}

export async function activateLearningMission(db: Queryable, missionId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions SET status='active',updated_at=NOW() WHERE id=$1 AND status='planning'`,
    [missionId],
  )
  return Boolean(result.rowCount)
}

export async function updateLearningMissionStepRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; channelId: string; missionId: string; stepId: string
    status: LearningMissionStep['status']; outcome?: string; sourceReportId?: string; attemptId?: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_mission_steps step
        SET status=$6,outcome=$7,
            completion_report_id=(SELECT report.id FROM canvas_assignment_reports report
              WHERE report.id=$8 AND report.company_id=$1),
            completion_attempt_id=(SELECT attempt.id FROM learning_attempts attempt
              JOIN learning_missions owning_mission ON owning_mission.id=$4
              WHERE attempt.id=$9 AND attempt.company_id=$1 AND attempt.course_id=$2
                AND attempt.learner_id=owning_mission.learner_id),
            updated_at=NOW()
       FROM learning_missions mission
      WHERE step.id=$5 AND step.mission_id=$4 AND mission.id=step.mission_id
        AND mission.company_id=$1 AND mission.course_id=$2 AND mission.conversation_id=$3
        AND ($6<>'completed'
          OR ($8 IS NOT NULL AND EXISTS(SELECT 1 FROM canvas_assignment_reports report
            WHERE report.id=$8 AND report.company_id=$1))
          OR ($9 IS NOT NULL AND EXISTS(SELECT 1 FROM learning_attempts attempt
            WHERE attempt.id=$9 AND attempt.company_id=$1 AND attempt.course_id=$2
              AND attempt.learner_id=mission.learner_id)))`,
    [args.companyId,args.courseId,args.channelId,args.missionId,args.stepId,args.status,
      args.outcome?.trim() ?? null,args.sourceReportId ?? null,args.attemptId ?? null],
  )
  return Boolean(result.rowCount)
}

export async function learningMissionCompletionSummary(
  db: Queryable,
  missionId: string,
): Promise<{ unresolved: number; reflections: number }> {
  const { rows } = await db.query<{ unresolved: number; reflections: number }>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS unresolved,
            COUNT(*) FILTER (WHERE type='reflect' AND status='completed')::int AS reflections
       FROM learning_mission_steps WHERE mission_id=$1`,
    [missionId],
  )
  return {
    unresolved: Number(rows[0]?.unresolved ?? 0),
    reflections: Number(rows[0]?.reflections ?? 0),
  }
}

export async function completeLearningMissionRecord(db: Queryable, missionId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions SET status='completed',completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status IN ('active','paused')`,
    [missionId],
  )
  return Boolean(result.rowCount)
}

export async function findEligibleLearningMissionCoordinator(
  db: Queryable,
  args: { companyId: string; channelId: string; preferredPreset: string; currentAgentId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT participant.id FROM participants participant
       JOIN conversations conversation ON conversation.id=$2 AND conversation.company_id=$1
      WHERE participant.company_id=$1 AND participant.kind='agent' AND participant.departed_at IS NULL
        AND participant.capabilities @> '["canvas","learning"]'::jsonb
        AND conversation.members ? participant.id
      ORDER BY CASE WHEN participant.preset_key=$3 THEN 0 WHEN participant.preset_key='nova' THEN 1
        WHEN participant.id=$4 THEN 2 ELSE 3 END,participant.id LIMIT 1`,
    [args.companyId,args.channelId,args.preferredPreset,args.currentAgentId],
  )
  return rows[0]?.id ?? null
}

export async function upsertLearningMission(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; learnerId: string; channelId: string
    triggerClientMsgNo: string; goal: string; successCriteria: string; missionKind: LearningMission['missionKind']
    coordinatorAgentId: string; createdBy: string
  },
): Promise<{ id: string; inserted: boolean }> {
  const { rows } = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO learning_missions
       (id,course_id,company_id,learner_id,conversation_id,trigger_client_msg_no,goal,success_criteria,
        mission_kind,coordinator_agent_id,created_by)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,$8,$9,$10,$11
       FROM courses course WHERE course.id=$2 AND course.company_id=$3
     ON CONFLICT(course_id,learner_id,conversation_id,trigger_client_msg_no)
     DO UPDATE SET updated_at=learning_missions.updated_at RETURNING id,(xmax=0) AS inserted`,
    [args.id,args.courseId,args.companyId,args.learnerId,args.channelId,args.triggerClientMsgNo,args.goal,
      args.successCriteria,args.missionKind,args.coordinatorAgentId,args.createdBy],
  )
  if (!rows[0]) throw new Error('course not found')
  return rows[0]
}

export async function enqueueLearningMissionCoordinatorWork(
  db: Queryable,
  args: {
    id: string; companyId: string; coordinatorAgentId: string; channelId: string
    threadRootClientMsgNo: string; missionId: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,
        reason,status,priority,execution_role)
     VALUES($1,$2,$3,$4,$5,$6,'handoff','queued',190,'coordinator')
     ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING`,
    [args.id,args.companyId,args.coordinatorAgentId,args.channelId,args.threadRootClientMsgNo,
      `mission-coordinator:${args.missionId}`],
  )
}

export async function learningChannelType(
  db: Queryable,
  companyId: string,
  channelId: string,
): Promise<number> {
  const { rows } = await db.query<{ channel_type: number }>(
    `SELECT COALESCE((profile->>'channelType')::int,2) AS channel_type
       FROM im_channel_bindings WHERE company_id=$1 AND channel_id=$2`,
    [companyId,channelId],
  )
  return Number(rows[0]?.channel_type ?? 2)
}

export async function findLearningDocumentEvidence(
  db: Queryable,
  args: { companyId: string; projectId: string; documentId: string },
): Promise<{ id: string; revision: number; authorId: string } | null> {
  const { rows } = await db.query<{ id: string; revision: number; author_id: string }>(
    `SELECT document.id,COALESCE(MAX(document_update.id),0)::int AS revision,
            COALESCE((array_agg(document_update.author_id ORDER BY document_update.id DESC)
              FILTER(WHERE document_update.author_id IS NOT NULL))[1],document.created_by) AS author_id
       FROM documents document
       LEFT JOIN document_updates document_update ON document_update.document_id=document.id
      WHERE document.id=$1 AND document.company_id=$2 AND document.project_id=$3
      GROUP BY document.id`,
    [args.documentId,args.companyId,args.projectId],
  )
  const row = rows[0]
  return row ? { id: row.id, revision: Number(row.revision), authorId: row.author_id } : null
}

export async function findLearningCanvasEvidence(
  db: Queryable,
  args: { companyId: string; projectId: string; frameId: string },
): Promise<{ id: string; revision: number; authorId: string } | null> {
  const { rows } = await db.query<{ id: string; revision: number; updated_by: string }>(
    `SELECT frame.id,frame.revision,frame.updated_by
       FROM canvas_frames frame JOIN canvases canvas ON canvas.id=frame.canvas_id
      WHERE frame.id=$1 AND canvas.company_id=$2 AND canvas.project_id=$3`,
    [args.frameId,args.companyId,args.projectId],
  )
  const row = rows[0]
  return row ? { id: row.id, revision: Number(row.revision), authorId: row.updated_by } : null
}

export async function insertAgentLearningAttempt(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; channelId: string; learnerId: string
    activityId?: string; missionStepId?: string; assistance: 'none'|'hint'|'guided'
    evidence: Record<string, unknown>
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_attempts
       (id,course_id,company_id,learner_id,activity_id,mission_step_id,assistance,evidence)
     SELECT $1,course.id,course.company_id,$5,activity.id,step.id,$8,$9::jsonb
       FROM courses course
       LEFT JOIN learning_activities activity
         ON activity.id=$6 AND activity.course_id=course.id AND activity.company_id=course.company_id
           AND activity.status='published'
       LEFT JOIN learning_mission_steps step ON step.id=$7
       LEFT JOIN learning_missions mission
         ON mission.id=step.mission_id AND mission.course_id=course.id
           AND mission.company_id=course.company_id AND mission.conversation_id=$4 AND mission.learner_id=$5
      WHERE course.id=$2 AND course.company_id=$3
        AND (($6::text IS NOT NULL AND activity.id IS NOT NULL AND $7::text IS NULL)
          OR ($7::text IS NOT NULL AND mission.id IS NOT NULL AND $6::text IS NULL))`,
    [args.id,args.courseId,args.companyId,args.channelId,args.learnerId,args.activityId ?? null,
      args.missionStepId ?? null,args.assistance,JSON.stringify(args.evidence)],
  )
  return Boolean(result.rowCount)
}

export async function learningMasteryContext(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string },
) {
  const { rows } = await db.query<{
    objective_id: string; level: number; status: string; next_review_at: string | null
  }>(
    `SELECT mastery.objective_id,mastery.level,mastery.status,mastery.next_review_at
       FROM learning_mastery mastery
      WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3`,
    [args.companyId,args.courseId,args.learnerId],
  )
  return rows.map((row) => ({
    objectiveId: row.objective_id,
    level: Number(row.level),
    status: row.status,
    nextReviewAt: row.next_review_at ? String(row.next_review_at) : null,
  }))
}

export async function activeLearningMissionId(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; channelId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT mission.id FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.learner_id=$3
        AND mission.conversation_id=$4 AND mission.status IN ('planning','active','paused')
      ORDER BY mission.updated_at DESC LIMIT 1`,
    [args.companyId,args.courseId,args.learnerId,args.channelId],
  )
  return rows[0]?.id ?? null
}

export async function countPendingLearningEvaluations(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'`,
    [companyId,courseId],
  )
  return Number(rows[0]?.count ?? 0)
}

export interface LearningEvaluationAttempt {
  learnerId: string
  assistance: 'none'|'hint'|'guided'
  activityId: string | null
  activityType: 'lesson'|'practice'|'assessment'|'project'|'review' | null
  evaluationMode: 'agent_formative'|'teacher_required' | null
  targetLevel: number
  objectiveIds: string[]
}

export async function findLearningEvaluationAttempt(
  db: Queryable,
  args: { companyId: string; courseId: string; attemptId: string },
): Promise<LearningEvaluationAttempt | null> {
  const { rows } = await db.query<{
    learner_id: string; assistance: LearningEvaluationAttempt['assistance']; activity_id: string | null
    activity_type: LearningEvaluationAttempt['activityType']; evaluation_mode: LearningEvaluationAttempt['evaluationMode']
    target_level: number; objective_ids: string[]
  }>(
    `SELECT attempt.learner_id,attempt.assistance,attempt.activity_id,activity.type AS activity_type,
            activity.evaluation_mode,
            COALESCE(activity.target_level,objective.target_level,2) AS target_level,
            COALESCE(activity.objective_ids,
              CASE WHEN step.objective_id IS NOT NULL THEN jsonb_build_array(step.objective_id) ELSE '[]'::jsonb END
            ) AS objective_ids
       FROM learning_attempts attempt
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.course_id=attempt.course_id
       LEFT JOIN learning_mission_steps step ON step.id=attempt.mission_step_id
       LEFT JOIN learning_missions mission ON mission.id=step.mission_id
         AND mission.company_id=attempt.company_id AND mission.course_id=attempt.course_id
       LEFT JOIN learning_objectives objective ON objective.id=step.objective_id
         AND objective.company_id=attempt.company_id AND objective.course_id=attempt.course_id
      WHERE attempt.id=$1 AND attempt.company_id=$2 AND attempt.course_id=$3
        AND (attempt.activity_id IS NULL OR activity.status='published')
        AND (attempt.mission_step_id IS NULL OR mission.id IS NOT NULL)`,
    [args.attemptId,args.companyId,args.courseId],
  )
  const row = rows[0]
  return row ? {
    learnerId: row.learner_id, assistance: row.assistance, activityId: row.activity_id,
    activityType: row.activity_type, evaluationMode: row.evaluation_mode,
    targetLevel: Number(row.target_level), objectiveIds: (row.objective_ids ?? []).map(String),
  } : null
}

export async function learningMasteryLevels(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; objectiveIds: string[] },
): Promise<number[]> {
  const { rows } = await db.query<{ level: number }>(
    `SELECT mastery.level FROM learning_mastery mastery
      WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3
        AND mastery.objective_id=ANY($4::text[])`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveIds],
  )
  return rows.map((row) => Number(row.level))
}

export async function verifyIndependentLearningReport(
  db: Queryable,
  args: { companyId: string; courseId: string; sourceReportId: string; verifierReportId: string },
): Promise<'supported'|'unsupported'|null> {
  const { rows } = await db.query<{
    source_author: string; verifier_author: string; verifies_report_id: string | null; verdict: string | null
  }>(
    `SELECT source.author_agent_id AS source_author,verifier.author_agent_id AS verifier_author,
            verifier.verifies_report_id,verifier.verdict
       FROM canvas_assignment_reports source
       JOIN canvases canvas ON canvas.id=source.canvas_id AND canvas.company_id=source.company_id
       JOIN courses course ON course.project_id=canvas.project_id AND course.company_id=canvas.company_id
       JOIN canvas_assignment_reports verifier ON verifier.id=$2
         AND verifier.canvas_id=source.canvas_id AND verifier.company_id=source.company_id
      WHERE source.id=$1 AND source.company_id=$3 AND course.id=$4`,
    [args.sourceReportId,args.verifierReportId,args.companyId,args.courseId],
  )
  const row = rows[0]
  if (!row || row.verifies_report_id !== args.sourceReportId || row.source_author === row.verifier_author) return null
  return row.verdict === 'supported' ? 'supported' : 'unsupported'
}

export async function insertLearningEvaluation(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; attemptId: string; demonstratedLevel: number
    confidence: number; rubricResults: unknown[]; feedback: string; evaluatorId: string
    status: 'accepted'|'pending'; sourceReportId?: string; verifierReportId?: string
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_evaluations
       (id,attempt_id,demonstrated_level,confidence,rubric_results,feedback,evaluator_id,evaluator_kind,
        status,source_report_id,verifier_report_id)
     SELECT $1,attempt.id,$5,$6,$7::jsonb,$8,$9,'agent',$10,$11,$12
       FROM learning_attempts attempt
      WHERE attempt.id=$4 AND attempt.company_id=$2 AND attempt.course_id=$3`,
    [args.id,args.companyId,args.courseId,args.attemptId,args.demonstratedLevel,args.confidence,
      JSON.stringify(args.rubricResults),args.feedback,args.evaluatorId,args.status,
      args.sourceReportId ?? null,args.verifierReportId ?? null],
  )
  return Boolean(result.rowCount)
}

export async function independentLearningEvidenceKeys(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; objectiveId: string },
): Promise<string[]> {
  const { rows } = await db.query<{ evidence_key: string | null }>(
    `SELECT DISTINCT COALESCE(attempt.activity_id,attempt.mission_step_id) AS evidence_key
       FROM learning_mastery_events event
       JOIN learning_evaluations evaluation ON evaluation.id=event.evaluation_id
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE event.company_id=$1 AND event.course_id=$2 AND event.learner_id=$3 AND event.objective_id=$4
        AND evaluation.status='accepted' AND attempt.assistance='none' AND evaluation.demonstrated_level>=3`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveId],
  )
  return rows.map((row) => row.evidence_key).filter((value): value is string => Boolean(value))
}

export async function learningEvaluationEvidenceKey(
  db: Queryable,
  args: { companyId: string; courseId: string; evaluationId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ evidence_key: string | null }>(
    `SELECT COALESCE(attempt.activity_id,attempt.mission_step_id) AS evidence_key
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
      WHERE evaluation.id=$1 AND attempt.company_id=$2 AND attempt.course_id=$3`,
    [args.evaluationId,args.companyId,args.courseId],
  )
  return rows[0]?.evidence_key ?? null
}

export async function lockLearningMastery(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string; objectiveId: string },
): Promise<{ level: number; independentEvidenceCount: number; reviewIntervalDays: number }> {
  const { rows } = await db.query<{
    level: number; independent_evidence_count: number; review_interval_days: number
  }>(
    `SELECT mastery.level,mastery.independent_evidence_count,mastery.review_interval_days
       FROM learning_mastery mastery
      WHERE mastery.company_id=$1 AND mastery.course_id=$2 AND mastery.learner_id=$3
        AND mastery.objective_id=$4 FOR UPDATE`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveId],
  )
  return rows[0] ? {
    level: Number(rows[0].level), independentEvidenceCount: Number(rows[0].independent_evidence_count),
    reviewIntervalDays: Number(rows[0].review_interval_days),
  } : { level: 0, independentEvidenceCount: 0, reviewIntervalDays: 1 }
}

export async function upsertLearningMastery(
  db: Queryable,
  args: {
    companyId: string; courseId: string; learnerId: string; objectiveId: string; level: number
    status: string; independentEvidenceCount: number; reviewIntervalDays: number
  },
): Promise<void> {
  await db.query(
    `INSERT INTO learning_mastery
       (course_id,company_id,learner_id,objective_id,level,status,independent_evidence_count,
        review_interval_days,next_review_at)
     SELECT course.id,course.company_id,$3,$4,$5,$6,$7,$8,NOW()+($8::int * INTERVAL '1 day')
       FROM courses course WHERE course.id=$2 AND course.company_id=$1
     ON CONFLICT(course_id,learner_id,objective_id) DO UPDATE SET
       level=EXCLUDED.level,status=EXCLUDED.status,
       independent_evidence_count=EXCLUDED.independent_evidence_count,
       review_interval_days=EXCLUDED.review_interval_days,next_review_at=EXCLUDED.next_review_at,
       version=learning_mastery.version+1,updated_at=NOW()`,
    [args.companyId,args.courseId,args.learnerId,args.objectiveId,args.level,args.status,
      args.independentEvidenceCount,args.reviewIntervalDays],
  )
}

export async function insertLearningMasteryEvent(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; learnerId: string; objectiveId: string
    evaluationId: string; previousLevel: number; nextLevel: number; kind: string; reason: string; actorId: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO learning_mastery_events
       (id,course_id,company_id,learner_id,objective_id,evaluation_id,previous_level,next_level,kind,reason,actor_id)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,$8,$9,$10,$11
       FROM courses course WHERE course.id=$3 AND course.company_id=$2`,
    [args.id,args.companyId,args.courseId,args.learnerId,args.objectiveId,args.evaluationId,
      args.previousLevel,args.nextLevel,args.kind,args.reason,args.actorId],
  )
}

export async function markLearningAttemptEvaluated(
  db: Queryable,
  args: { companyId: string; courseId: string; attemptId: string },
): Promise<void> {
  await db.query(
    `UPDATE learning_attempts SET status='evaluated'
      WHERE id=$1 AND company_id=$2 AND course_id=$3`,
    [args.attemptId,args.companyId,args.courseId],
  )
}

export interface PendingLearningEvaluation {
  attemptId: string
  demonstratedLevel: number
  confidence: number
  learnerId: string
  assistance: 'none'|'hint'|'guided'
  activityType: 'lesson'|'practice'|'assessment'|'project'|'review' | null
  targetLevel: number
  objectiveIds: string[]
}

export async function lockPendingLearningEvaluation(
  db: Queryable,
  args: { companyId: string; courseId: string; evaluationId: string },
): Promise<PendingLearningEvaluation | null> {
  const { rows } = await db.query<{
    attempt_id: string; demonstrated_level: number; confidence: number; learner_id: string
    assistance: PendingLearningEvaluation['assistance']; activity_type: PendingLearningEvaluation['activityType']
    target_level: number; objective_ids: string[]
  }>(
    `SELECT evaluation.attempt_id,evaluation.demonstrated_level,evaluation.confidence,
            attempt.learner_id,attempt.assistance,activity.type AS activity_type,
            COALESCE(activity.target_level,objective.target_level,2) AS target_level,
            COALESCE(activity.objective_ids,
              CASE WHEN step.objective_id IS NOT NULL THEN jsonb_build_array(step.objective_id) ELSE '[]'::jsonb END
            ) AS objective_ids
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.course_id=attempt.course_id
       LEFT JOIN learning_mission_steps step ON step.id=attempt.mission_step_id
       LEFT JOIN learning_missions mission ON mission.id=step.mission_id
         AND mission.company_id=attempt.company_id AND mission.course_id=attempt.course_id
       LEFT JOIN learning_objectives objective ON objective.id=step.objective_id
         AND objective.company_id=attempt.company_id AND objective.course_id=attempt.course_id
      WHERE evaluation.id=$1 AND attempt.company_id=$2 AND attempt.course_id=$3
        AND evaluation.status='pending' FOR UPDATE`,
    [args.evaluationId,args.companyId,args.courseId],
  )
  const row = rows[0]
  return row ? {
    attemptId: row.attempt_id, demonstratedLevel: Number(row.demonstrated_level),
    confidence: Number(row.confidence), learnerId: row.learner_id, assistance: row.assistance,
    activityType: row.activity_type, targetLevel: Number(row.target_level),
    objectiveIds: (row.objective_ids ?? []).map(String),
  } : null
}

export async function reviewLearningEvaluationRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; evaluationId: string; status: 'accepted'|'rejected'
    reason: string; teacherId: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_evaluations evaluation
        SET status=$4,review_reason=$5,reviewed_by=$6,reviewed_at=NOW()
       FROM learning_attempts attempt
      WHERE evaluation.id=$3 AND evaluation.attempt_id=attempt.id
        AND attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'`,
    [args.companyId,args.courseId,args.evaluationId,args.status,args.reason,args.teacherId],
  )
  return Boolean(result.rowCount)
}

export async function listLearningCourseSummaries(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT course.id,course.company_id,course.project_id,project.name AS title,project.description,
            project.status,member.role AS course_role,
            ((course.study_room_conversation_id IS NOT NULL)::int
              + (SELECT COUNT(*)::int FROM learning_course_rooms room
                  WHERE room.course_id=course.id AND room.company_id=course.company_id)) AS room_count,
            (SELECT COUNT(*)::int FROM learning_objectives objective
              WHERE objective.course_id=course.id AND objective.company_id=course.company_id
                AND objective.status<>'archived') AS objective_count,
            (SELECT COUNT(*)::int FROM course_members learner
              WHERE learner.course_id=course.id AND learner.company_id=course.company_id
                AND learner.role='learner') AS learner_count,
            course.created_at,project.updated_at
       FROM courses course
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN course_members member ON member.course_id=course.id
         AND member.company_id=course.company_id AND member.user_id=$2
       JOIN company_members company_member ON company_member.company_id=member.company_id
         AND company_member.user_id=member.user_id
      WHERE course.company_id=$1 ORDER BY project.status,project.updated_at DESC`,
    [companyId,userId],
  )
  return rows
}

export async function listDueLearningMastery(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT mastery.course_id,mastery.objective_id,objective.title,mastery.level,
            mastery.status,mastery.next_review_at
       FROM learning_mastery mastery
       JOIN learning_objectives objective ON objective.id=mastery.objective_id
         AND objective.company_id=mastery.company_id AND objective.course_id=mastery.course_id
       JOIN course_members member ON member.course_id=mastery.course_id
         AND member.company_id=mastery.company_id AND member.user_id=mastery.learner_id
         AND member.role='learner'
      WHERE mastery.company_id=$1 AND mastery.learner_id=$2 AND mastery.next_review_at<=NOW()
      ORDER BY mastery.next_review_at LIMIT 50`,
    [companyId,userId],
  )
  return rows
}

export async function countViewerPendingLearningReviews(
  db: Queryable,
  companyId: string,
  userId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
       JOIN course_members member ON member.course_id=attempt.course_id
         AND member.company_id=attempt.company_id AND member.user_id=$2 AND member.role='teacher'
      WHERE attempt.company_id=$1 AND evaluation.status='pending'`,
    [companyId,userId],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function listViewerLearningMastery(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT mastery.course_id,mastery.objective_id,objective.title,mastery.level,
            mastery.status,mastery.next_review_at,mastery.review_interval_days
       FROM learning_mastery mastery
       JOIN learning_objectives objective ON objective.id=mastery.objective_id
         AND objective.company_id=mastery.company_id AND objective.course_id=mastery.course_id
       JOIN course_members member ON member.course_id=mastery.course_id
         AND member.company_id=mastery.company_id AND member.user_id=mastery.learner_id
         AND member.role='learner'
      WHERE mastery.company_id=$1 AND mastery.learner_id=$2 ORDER BY objective.position`,
    [companyId,userId],
  )
  return rows
}

export async function listLearningEvidenceRecords(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string },
) {
  const { rows } = await db.query(
    `SELECT attempt.id,attempt.activity_id,attempt.mission_step_id,attempt.assistance,attempt.status,
            attempt.evidence,attempt.submitted_at AS created_at,evaluation.id AS evaluation_id,
            evaluation.demonstrated_level,evaluation.confidence,evaluation.rubric_results,
            evaluation.feedback,evaluation.status AS evaluation_status
       FROM learning_attempts attempt
       LEFT JOIN learning_evaluations evaluation ON evaluation.attempt_id=attempt.id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND attempt.learner_id=$3
      ORDER BY attempt.submitted_at DESC LIMIT 200`,
    [args.companyId,args.courseId,args.learnerId],
  )
  return rows
}

export async function listPendingLearningEvaluationRecords(
  db: Queryable,
  companyId: string,
  courseId: string,
) {
  const { rows } = await db.query(
    `SELECT evaluation.id,evaluation.attempt_id,evaluation.demonstrated_level,evaluation.confidence,
            evaluation.rubric_results,evaluation.feedback,evaluation.created_at,
            evaluation.source_report_id,evaluation.verifier_report_id,
            source.author_agent_id AS builder_agent_id,verifier.author_agent_id AS verifier_agent_id,
            verifier.verdict AS verifier_verdict,attempt.learner_id,attempt.activity_id,
            attempt.assistance,attempt.evidence,activity.title AS activity_title
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.course_id=attempt.course_id
       LEFT JOIN canvas_assignment_reports source ON source.id=evaluation.source_report_id
         AND source.company_id=attempt.company_id
       LEFT JOIN canvas_assignment_reports verifier ON verifier.id=evaluation.verifier_report_id
         AND verifier.company_id=attempt.company_id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'
      ORDER BY evaluation.created_at ASC`,
    [companyId,courseId],
  )
  return rows
}

export async function listLearningCourseProgress(db: Queryable, companyId: string, courseId: string) {
  const { rows } = await db.query(
    `SELECT member.user_id,user_account.display_name,user_account.email,
            COALESCE(mastery_summary.average_level,0)::float AS average_level,
            COALESCE(mastery_summary.verified_objectives,0)::int AS verified_objectives,
            COALESCE(mastery_summary.due_objectives,0)::int AS due_objectives,
            COALESCE(attempt_summary.attempts,0)::int AS attempts
       FROM course_members member
       JOIN users user_account ON user_account.id=member.user_id
       LEFT JOIN LATERAL (
         SELECT AVG(mastery.level) AS average_level,
                COUNT(*) FILTER(WHERE mastery.level>=3) AS verified_objectives,
                COUNT(*) FILTER(WHERE mastery.next_review_at<=NOW()) AS due_objectives
           FROM learning_mastery mastery
          WHERE mastery.company_id=member.company_id AND mastery.course_id=member.course_id
            AND mastery.learner_id=member.user_id
       ) mastery_summary ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS attempts FROM learning_attempts attempt
          WHERE attempt.company_id=member.company_id AND attempt.course_id=member.course_id
            AND attempt.learner_id=member.user_id
       ) attempt_summary ON TRUE
      WHERE member.company_id=$1 AND member.course_id=$2 AND member.role='learner'
      ORDER BY user_account.display_name`,
    [companyId,courseId],
  )
  return rows
}

export async function findNotificationPreferences(
  db: Queryable,
  companyId: string,
  userId: string,
  courseId?: string,
): Promise<LearningNotificationPreferences | null> {
  const { rows } = await db.query<LearningNotificationPreferences>(
    `SELECT company_id,user_id,course_id,in_app_enabled,email_enabled,timezone,
            preferred_time::text,quiet_start::text,quiet_end::text
       FROM learning_notification_preferences
      WHERE company_id=$1 AND user_id=$2
        AND (course_id IS NOT DISTINCT FROM $3 OR ($3::text IS NOT NULL AND course_id IS NULL))
      ORDER BY course_id NULLS LAST LIMIT 1`,
    [companyId, userId, courseId ?? null],
  )
  return rows[0] ?? null
}

export async function upsertNotificationPreferences(
  db: Queryable,
  args: LearningScopeNotificationPreferences,
): Promise<void> {
  if (args.courseId) {
    await db.query(
      `INSERT INTO learning_notification_preferences
         (id,company_id,user_id,course_id,in_app_enabled,email_enabled,timezone,preferred_time,quiet_start,quiet_end)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(company_id,user_id,course_id) WHERE course_id IS NOT NULL DO UPDATE SET
         in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,
         timezone=EXCLUDED.timezone,preferred_time=EXCLUDED.preferred_time,
         quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=NOW()`,
      [args.id,args.companyId,args.userId,args.courseId,args.inAppEnabled,args.emailEnabled,args.timezone,
        args.preferredTime,args.quietStart ?? null,args.quietEnd ?? null],
    )
    return
  }
  await db.query(
    `INSERT INTO learning_notification_preferences
       (id,company_id,user_id,course_id,in_app_enabled,email_enabled,timezone,preferred_time,quiet_start,quiet_end)
     VALUES($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(company_id,user_id) WHERE course_id IS NULL DO UPDATE SET
       in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,
       timezone=EXCLUDED.timezone,preferred_time=EXCLUDED.preferred_time,
       quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=NOW()`,
    [args.id,args.companyId,args.userId,args.inAppEnabled,args.emailEnabled,args.timezone,
      args.preferredTime,args.quietStart ?? null,args.quietEnd ?? null],
  )
}

interface LearningScopeNotificationPreferences extends NotificationPreferencesInput {
  id: string
  companyId: string
  userId: string
}

export async function studyRoomState(db: Queryable, courseId: string) {
  const { rows } = await db.query<{
    room_id: string | null; company_id: string; title: string; topic: string | null; leader_id: string | null
  }>(
    `SELECT course.study_room_conversation_id AS room_id,course.company_id,
            conversation.title,conversation.topic,conversation.leader_id
       FROM courses course
       LEFT JOIN conversations conversation
         ON conversation.id=course.study_room_conversation_id AND conversation.company_id=course.company_id
      WHERE course.id=$1`,
    [courseId],
  )
  return rows[0] ?? null
}

export async function syncStudyRoomMembers(db: Queryable, args: {
  courseId: string; companyId: string; roomId: string; title: string; topic: string | null; leaderId: string | null
}) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT course_member.user_id AS id FROM course_members course_member
      WHERE course_member.course_id=$1 AND course_member.company_id=$2
     UNION
     SELECT participant.id FROM participants participant
      WHERE participant.company_id=$2 AND participant.kind='agent'
        AND participant.preset_key IN ('nova','sage','milo','trace') AND participant.departed_at IS NULL`,
    [args.courseId, args.companyId],
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
