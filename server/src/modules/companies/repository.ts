import type { Queryable } from '../../db/queryable.js'
import type { InvitationRow } from './contracts.js'

export function listCompanies(db: Queryable, userId: string) {
  return db.query(
    `SELECT company.id,company.name,company.slug,company.created_at AS "createdAt",membership.role
       FROM companies company
       JOIN company_members membership ON membership.company_id=company.id AND membership.user_id=$1
      ORDER BY membership.joined_at ASC`,
    [userId],
  ).then((result) => result.rows)
}

export async function insertCompanyRoot(db: Queryable, args: {
  id: string; name: string; slug: string; userId: string; projectId: string
}): Promise<void> {
  await db.query(
    `INSERT INTO companies (id,name,slug,owner_user_id) VALUES ($1,$2,$3,$4)`,
    [args.id, args.name, args.slug, args.userId],
  )
  await db.query(
    `INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$2,'owner')`,
    [args.id, args.userId],
  )
  await db.query(
    `INSERT INTO projects (id,company_id,name,description,color,created_by,is_general)
     VALUES ($1,$2,'通用工作区','默认工作区与未归类内容','#64748b',$3,TRUE)`,
    [args.projectId, args.id, args.userId],
  )
  const user = await findUser(db, args.userId)
  if (!user) throw new Error('session points to missing user')
  await db.query(
    `INSERT INTO participants (id,kind,name,role,initial,avatar_bg,avatar_url,status,company_id)
     VALUES ($1,'human',$2,NULL,$3,'#FF8870',$4,'avail',$5)
     ON CONFLICT (id,company_id) DO NOTHING`,
    [args.userId, user.display_name, user.display_name.charAt(0).toUpperCase(), user.avatar_url, args.id],
  )
}

export async function findUser(db: Queryable, userId: string) {
  const { rows } = await db.query<{ email: string; display_name: string; avatar_url: string | null }>(
    `SELECT email,display_name,avatar_url FROM users WHERE id=$1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function findCompanyForMember(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query<{
    id: string; name: string; slug: string; description: string; role: string; createdAt: string
  }>(
    `SELECT company.id,company.name,company.slug,company.description,membership.role,
            company.created_at AS "createdAt"
       FROM companies company
       JOIN company_members membership ON membership.company_id=company.id
      WHERE company.id=$1 AND membership.user_id=$2`,
    [companyId, userId],
  )
  return rows[0] ?? null
}

export async function findCompany(db: Queryable, companyId: string) {
  const { rows } = await db.query<{ id: string; name: string; slug: string; description: string }>(
    `SELECT id,name,slug,description FROM companies WHERE id=$1`,
    [companyId],
  )
  return rows[0] ?? null
}

export async function updateCompany(
  db: Queryable,
  companyId: string,
  patch: { name?: string; description?: string },
): Promise<boolean> {
  const values: unknown[] = []
  const sets: string[] = []
  if (patch.name !== undefined) { values.push(patch.name); sets.push(`name=$${values.length}`) }
  if (patch.description !== undefined) { values.push(patch.description); sets.push(`description=$${values.length}`) }
  values.push(companyId)
  const result = await db.query(
    `UPDATE companies SET ${sets.join(',')},updated_at=NOW() WHERE id=$${values.length}`,
    values,
  )
  return (result.rowCount ?? 0) > 0
}

export async function companyRole(db: Queryable, companyId: string, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2 LIMIT 1`,
    [companyId, userId],
  )
  return rows[0]?.role ?? null
}

export function listMembers(db: Queryable, companyId: string) {
  return db.query(
    `SELECT user_account.id,user_account.display_name AS name,user_account.email,membership.role,
            membership.joined_at AS "joinedAt",
            COALESCE(jsonb_agg(jsonb_build_object(
              'courseId',course.id,'name',project.name,'role',course_member.role
            )) FILTER (WHERE course.id IS NOT NULL),'[]'::jsonb) AS courses
       FROM company_members membership
       JOIN users user_account ON user_account.id=membership.user_id
       LEFT JOIN course_members course_member
         ON course_member.company_id=membership.company_id AND course_member.user_id=membership.user_id
       LEFT JOIN courses course ON course.id=course_member.course_id
       LEFT JOIN projects project ON project.id=course.project_id
      WHERE membership.company_id=$1
      GROUP BY user_account.id,user_account.display_name,user_account.email,membership.role,membership.joined_at
      ORDER BY CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,membership.joined_at`,
    [companyId],
  ).then((result) => result.rows)
}

export async function memberRole(db: Queryable, companyId: string, userId: string, lock = false): Promise<string | null> {
  const { rows } = await db.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [companyId, userId],
  )
  return rows[0]?.role ?? null
}

export async function setMemberRole(
  db: Queryable,
  companyId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await db.query(
    `UPDATE company_members SET role=$3 WHERE company_id=$1 AND user_id=$2`,
    [companyId, userId, role],
  )
}

export async function lockTeachingCourses(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT course.id,project.name
       FROM course_members membership
       JOIN courses course ON course.id=membership.course_id AND course.company_id=membership.company_id
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE membership.company_id=$1 AND membership.user_id=$2 AND membership.role='teacher'
        AND project.status='active'
      ORDER BY course.id
      FOR UPDATE OF course`,
    [companyId, userId],
  )
  return rows
}

export async function teacherCount(db: Queryable, companyId: string, courseId: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM course_members
      WHERE company_id=$1 AND course_id=$2 AND role='teacher'`,
    [companyId, courseId],
  )
  return rows[0]?.count ?? 0
}

export async function removeMemberState(db: Queryable, companyId: string, userId: string): Promise<void> {
  await db.query(`DELETE FROM company_members WHERE company_id=$1 AND user_id=$2`, [companyId, userId])
  await db.query(
    `UPDATE participants SET departed_at=NOW(),status='offboarded'
      WHERE company_id=$1 AND id=$2 AND kind='human'`,
    [companyId, userId],
  )
  await db.query(
    `UPDATE conversations conversation
        SET members=(SELECT COALESCE(jsonb_agg(value),'[]'::jsonb)
                       FROM jsonb_array_elements(conversation.members) value
                      WHERE value<>to_jsonb($2::text)),updated_at=NOW()
      WHERE company_id=$1 AND members@>to_jsonb(ARRAY[$2::text])`,
    [companyId, userId],
  )
  await db.query(
    `UPDATE im_channel_bindings binding
        SET profile=jsonb_set(binding.profile,'{members}',conversation.members,TRUE)
       FROM conversations conversation
      WHERE binding.channel_id=conversation.id AND binding.company_id=$1
        AND conversation.company_id=$1`,
    [companyId],
  )
}

export async function listCompanyChannels(db: Queryable, companyId: string) {
  const { rows } = await db.query<{ channel_id: string; title: string; members: string[] }>(
    `SELECT binding.channel_id,COALESCE(binding.profile->>'title',binding.channel_id) AS title,
            conversation.members
       FROM im_channel_bindings binding
       JOIN conversations conversation
         ON conversation.id=binding.channel_id AND conversation.company_id=binding.company_id
      WHERE binding.company_id=$1`,
    [companyId],
  )
  return rows
}

export async function invitationWithCompany(db: Queryable, tokenHash: string) {
  const { rows } = await db.query<InvitationRow & {
    company_name: string; company_slug: string; inviter_name: string | null
  }>(
    `SELECT invitation.token_hash,invitation.company_id,invitation.invited_by,invitation.email,
            invitation.role,invitation.note,invitation.max_uses,invitation.use_count,
            invitation.created_at,invitation.expires_at,invitation.revoked_at,
            invitation.last_accepted_at,invitation.last_accepted_by,
            company.name AS company_name,company.slug AS company_slug,user_account.display_name AS inviter_name
       FROM company_invitations invitation
       JOIN companies company ON company.id=invitation.company_id
       LEFT JOIN users user_account ON user_account.id=invitation.invited_by
      WHERE invitation.token_hash=$1`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function isCompanyMember(db: Queryable, companyId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM company_members WHERE company_id=$1 AND user_id=$2 LIMIT 1`,
    [companyId, userId],
  )
  return Boolean(rows[0])
}

export async function lockCompany(db: Queryable, companyId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM companies WHERE id=$1 FOR UPDATE`, [companyId])
  return Boolean(rows[0])
}

export async function listInvitations(db: Queryable, companyId: string) {
  const { rows } = await db.query<{
    token_hash: string; email: string | null; role: string; note: string | null
    max_uses: number; use_count: number; created_at: string; expires_at: string
    revoked_at: string | null; last_accepted_at: string | null; last_accepted_by: string | null
    invited_by: string; inviter_name: string | null
  }>(
    `SELECT invitation.token_hash,invitation.email,invitation.role,invitation.note,
            invitation.max_uses,invitation.use_count,invitation.created_at,invitation.expires_at,
            invitation.revoked_at,invitation.last_accepted_at,invitation.last_accepted_by,
            invitation.invited_by,user_account.display_name AS inviter_name
       FROM company_invitations invitation
       LEFT JOIN users user_account ON user_account.id=invitation.invited_by
      WHERE invitation.company_id=$1
      ORDER BY invitation.created_at DESC LIMIT 200`,
    [companyId],
  )
  return rows
}

export async function emailAlreadyMember(db: Queryable, companyId: string, email: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM company_members membership
       JOIN users user_account ON user_account.id=membership.user_id
      WHERE membership.company_id=$1 AND LOWER(user_account.email)=$2 LIMIT 1`,
    [companyId, email],
  )
  return Boolean(rows[0])
}

export async function revokeActiveEmailInvitations(db: Queryable, companyId: string, email: string): Promise<void> {
  await db.query(
    `UPDATE company_invitations SET revoked_at=NOW()
      WHERE company_id=$1 AND email=$2 AND revoked_at IS NULL AND expires_at>NOW() AND use_count<max_uses`,
    [companyId, email],
  )
}

export async function insertInvitation(db: Queryable, args: {
  tokenHash: string; companyId: string; invitedBy: string; email: string | null
  role: string; note: string | null; maxUses: number; expiresAt: Date
}): Promise<void> {
  await db.query(
    `INSERT INTO company_invitations
       (token_hash,company_id,invited_by,email,role,note,max_uses,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [args.tokenHash, args.companyId, args.invitedBy, args.email, args.role, args.note, args.maxUses, args.expiresAt],
  )
}

export async function invitationEmailContext(db: Queryable, companyId: string, inviterId: string) {
  const { rows } = await db.query<{ inviter_email: string; inviter_name: string; company_name: string }>(
    `SELECT user_account.email AS inviter_email,user_account.display_name AS inviter_name,
            company.name AS company_name
       FROM companies company
       JOIN company_members membership ON membership.company_id=company.id AND membership.user_id=$2
       JOIN users user_account ON user_account.id=membership.user_id
      WHERE company.id=$1`,
    [companyId, inviterId],
  )
  return rows[0] ?? null
}

export async function revokeInvitation(db: Queryable, companyId: string, tokenHash: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE company_invitations SET revoked_at=NOW()
      WHERE token_hash=$1 AND company_id=$2 AND revoked_at IS NULL`,
    [tokenHash, companyId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function lockInvitation(db: Queryable, tokenHash: string): Promise<InvitationRow | null> {
  const { rows } = await db.query<InvitationRow>(
    `SELECT token_hash,company_id,invited_by,email,role,note,max_uses,use_count,
            created_at,expires_at,revoked_at,last_accepted_at,last_accepted_by
       FROM company_invitations WHERE token_hash=$1 FOR UPDATE`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function insertAcceptedMembership(db: Queryable, args: {
  invitation: InvitationRow; userId: string; displayName: string; avatarUrl: string | null
}): Promise<void> {
  await db.query(
    `INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$2,$3)`,
    [args.invitation.company_id, args.userId, args.invitation.role],
  )
  await db.query(
    `INSERT INTO participants (id,kind,name,role,initial,avatar_bg,avatar_url,status,company_id)
     VALUES ($1,'human',$2,NULL,$3,'#FF8870',$4,'avail',$5)
     ON CONFLICT (id,company_id) DO UPDATE SET
       name=EXCLUDED.name,initial=EXCLUDED.initial,avatar_url=EXCLUDED.avatar_url,
       status='avail',departed_at=NULL`,
    [args.userId, args.displayName, args.displayName.charAt(0).toUpperCase(), args.avatarUrl, args.invitation.company_id],
  )
  await db.query(
    `UPDATE company_invitations
        SET use_count=use_count+1,last_accepted_at=NOW(),last_accepted_by=$2
      WHERE token_hash=$1`,
    [args.invitation.token_hash, args.userId],
  )
}

export async function companyMembershipSummary(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query<{ name: string; slug: string; role: string }>(
    `SELECT company.name,company.slug,membership.role
       FROM companies company
       JOIN company_members membership ON membership.company_id=company.id AND membership.user_id=$2
      WHERE company.id=$1`,
    [companyId, userId],
  )
  return rows[0] ?? null
}
