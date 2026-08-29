import type { Queryable } from '../../db/queryable.js'

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

