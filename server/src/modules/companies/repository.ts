import { HttpError } from '../../http/errors.js'
import type { Queryable } from '../../db/queryable.js'
import {
  type CompanyRole,
  companyRoleToWire,
} from '../../domain/access/public.js'
import type { InvitationRow } from './contracts.js'

export function listCompanies(db: Queryable, userId: string) {
  return db.query(
    `SELECT company.id,company.name,company.slug,company.status,company.created_at AS "createdAt",LOWER(membership.role) AS role,membership.is_admin AS "isAdmin"
       FROM companies company
       JOIN company_memberships membership ON membership.company_id=company.id AND membership.user_id=$1
      WHERE membership.status='ACTIVE' AND company.status<>'DELETED'
      ORDER BY membership.created_at ASC`,
    [userId],
  ).then((result) => result.rows)
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
    id: string; name: string; slug: string; description: string; role: string; status: string; createdAt: string
  }>(
    `SELECT company.id,company.name,company.slug,company.description,company.status,LOWER(membership.role) AS role,membership.is_admin AS "isAdmin",
            company.created_at AS "createdAt"
       FROM companies company
       JOIN company_memberships membership ON membership.company_id=company.id
      WHERE company.id=$1 AND membership.user_id=$2 AND membership.status='ACTIVE'`,
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

export async function companyRole(db: Queryable, companyId: string, userId: string): Promise<CompanyRole | null> {
  const { rows } = await db.query<{ role: CompanyRole }>(
    `SELECT role FROM company_memberships
      WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [companyId, userId],
  )
  return rows[0]?.role ?? null
}

export function listMembers(db: Queryable, companyId: string) {
  return db.query(
    `SELECT user_account.id,user_account.display_name AS name,user_account.email,LOWER(membership.role) AS role,membership.is_admin AS "isAdmin",
            membership.created_at AS "joinedAt",
            COALESCE(jsonb_agg(jsonb_build_object(
              'courseId',course.id,'projectKind',project.kind,'name',project.name,'role',
              CASE WHEN project_member.role = 'STUDENT' THEN 'learner' ELSE 'teacher' END
            )) FILTER (WHERE course.id IS NOT NULL),'[]'::jsonb) AS courses
       FROM company_memberships membership
       JOIN users user_account ON user_account.id=membership.user_id
       LEFT JOIN project_memberships project_member
         ON project_member.company_id=membership.company_id
        AND project_member.user_id=membership.user_id AND project_member.status='ACTIVE'
       LEFT JOIN courses course
         ON course.project_id=project_member.project_id AND course.company_id=project_member.company_id
       LEFT JOIN projects project ON project.id=project_member.project_id AND project.company_id=project_member.company_id
      WHERE membership.company_id=$1 AND membership.status='ACTIVE'
      GROUP BY user_account.id,user_account.display_name,user_account.email,membership.role,membership.is_admin,membership.created_at
      ORDER BY membership.is_admin DESC,membership.created_at`,
    [companyId],
  ).then((result) => result.rows)
}

export async function memberRole(db: Queryable, companyId: string, userId: string, lock = false): Promise<CompanyRole | null> {
  const { rows } = await db.query<{ role: CompanyRole }>(
    `SELECT role FROM company_memberships
      WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE'${lock ? ' FOR UPDATE' : ''}`,
    [companyId, userId],
  )
  return rows[0]?.role ?? null
}

export async function setMemberRole(db: Queryable, companyId: string, userId: string, isAdmin: boolean): Promise<void> {
  const result = await db.query(`UPDATE company_memberships SET is_admin=$3,updated_at=NOW()
    WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' AND role='TEACHER'`, [companyId,userId,isAdmin])
  if (result.rowCount !== 1) throw new Error('administrator permission requires an active teacher')
}

export async function assertAdministratorCanDepart(db: Queryable, companyId: string, userId: string): Promise<void> {
  const { rows } = await db.query<{ user_id: string }>(`SELECT user_id FROM company_memberships
    WHERE company_id=$1 AND is_admin AND status='ACTIVE' AND ended_at IS NULL ORDER BY user_id FOR UPDATE`, [companyId])
  if (rows.length === 1 && rows[0]?.user_id === userId) throw new HttpError(409, 'assign another teacher administrator first')
}

export async function removeMemberState(db: Queryable, companyId: string, userId: string, preserveSeat = false): Promise<void> {
  await db.query(`SELECT 1 FROM users WHERE id=$1 FOR UPDATE`, [userId])
  await db.query(`UPDATE company_membership_periods SET ended_at=NOW() WHERE id IN
    (SELECT period_id FROM company_memberships WHERE company_id=$1 AND user_id=$2) AND ended_at IS NULL`, [companyId,userId])
  await db.query(`UPDATE company_memberships SET status='SUSPENDED',is_admin=FALSE,ended_at=NOW(),updated_at=NOW()
    WHERE company_id=$1 AND user_id=$2 AND ended_at IS NULL`, [companyId,userId])
  await db.query(`UPDATE project_memberships SET status='SUSPENDED',updated_at=NOW() WHERE company_id=$1 AND user_id=$2`, [companyId,userId])
  if (!preserveSeat) await db.query(`UPDATE organization_seats SET status='REVOKED',revoked_at=NOW() WHERE company_id=$1 AND user_id=$2`, [companyId,userId])
  await db.query(`UPDATE users SET departed_at=NOW(),access_revoked_at=NOW() WHERE id=$1`, [userId])
  await db.query(`DELETE FROM ws_tickets WHERE user_id=$1`, [userId])
  await db.query(`UPDATE agent_routines SET status='paused',next_run_at=NULL,version=version+1,pause_reason='principal_departed',updated_at=NOW()
    WHERE company_id=$1 AND created_by=$2 AND status='active'`, [companyId,userId])
  await db.query(`UPDATE calendar_events SET status='cancelled',updated_at=NOW() WHERE company_id=$1 AND created_by=$2 AND status IN ('active','paused')`, [companyId,userId])
  await db.query(`UPDATE knowledge_source_jobs job SET status='failed',leased_by=NULL,leased_until=NULL,last_error='principal departed',updated_at=NOW()
    FROM knowledge_sources source WHERE source.id=job.source_id AND source.company_id=$1 AND source.owner_user_id=$2
      AND job.status IN ('queued','processing')`, [companyId,userId])
  await db.query(`UPDATE company_invitations SET revoked_at=NOW() WHERE company_id=$1 AND invited_by=$2 AND revoked_at IS NULL`, [companyId,userId])
  await db.query(`UPDATE project_invitations SET revoked_at=NOW() WHERE company_id=$1 AND invited_by=$2 AND revoked_at IS NULL`, [companyId,userId])
  await db.query(`INSERT INTO company_onboarding_effects(id,company_id,member_id,kind,revoked_at)
    VALUES(gen_random_uuid()::text,$1,$2,'access.revoke',NOW()) ON CONFLICT(company_id,member_id,kind) DO UPDATE
      SET id=EXCLUDED.id,status='pending',revoked_at=EXCLUDED.revoked_at,attempts=0,available_at=NOW(),lease_token=NULL,
          lease_expires_at=NULL,error=NULL,completed_at=NULL,updated_at=NOW()`, [companyId,userId])
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

export async function isDepartedCompanyHuman(db: Queryable, companyId: string, userId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM participants
      WHERE company_id=$1 AND id=$2 AND kind='human' AND departed_at IS NOT NULL`,
    [companyId, userId],
  )
  return (result.rowCount ?? 0) > 0
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
            invitation.role,invitation.is_admin,invitation.note,invitation.max_uses,invitation.use_count,
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
    `SELECT 1 FROM company_memberships
      WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [companyId, userId],
  )
  return Boolean(rows[0])
}

export async function lockCompany(db: Queryable, companyId: string) {
  const { rows } = await db.query<{ status: import('../../domain/public.js').CompanyStatus }>(
    `SELECT status FROM companies WHERE id=$1 FOR UPDATE`,
    [companyId],
  )
  return rows[0]?.status ?? null
}

export async function listInvitations(db: Queryable, companyId: string) {
  const { rows } = await db.query<{
    token_hash: string; email: string | null; role: CompanyRole; is_admin: boolean; note: string | null
    max_uses: number; use_count: number; created_at: string; expires_at: string
    revoked_at: string | null; last_accepted_at: string | null; last_accepted_by: string | null
    invited_by: string; inviter_name: string | null
  }>(
    `SELECT invitation.token_hash,invitation.email,invitation.role,invitation.is_admin,invitation.note,
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
    `SELECT 1 FROM company_memberships membership
       JOIN users user_account ON user_account.id=membership.user_id
      WHERE membership.company_id=$1 AND membership.status='ACTIVE'
        AND LOWER(user_account.email)=$2 LIMIT 1`,
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
  isAdmin: boolean; note: string | null; maxUses: number; expiresAt: Date
}): Promise<void> {
  await db.query(
    `INSERT INTO company_invitations
       (token_hash,company_id,invited_by,email,is_admin,note,max_uses,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [args.tokenHash, args.companyId, args.invitedBy, args.email,
      args.isAdmin, args.note, args.maxUses, args.expiresAt],
  )
}

export async function invitationEmailContext(db: Queryable, companyId: string, inviterId: string) {
  const { rows } = await db.query<{ inviter_email: string; inviter_name: string; company_name: string }>(
    `SELECT user_account.email AS inviter_email,user_account.display_name AS inviter_name,
            company.name AS company_name
       FROM companies company
       JOIN company_memberships membership ON membership.company_id=company.id AND membership.user_id=$2
       JOIN users user_account ON user_account.id=membership.user_id
      WHERE company.id=$1 AND membership.status='ACTIVE'`,
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
    `SELECT token_hash,company_id,invited_by,email,role,is_admin,note,max_uses,use_count,
            created_at,expires_at,revoked_at,last_accepted_at,last_accepted_by
       FROM company_invitations WHERE token_hash=$1 FOR UPDATE`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function companyMembershipSummary(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query<{
    name: string; slug: string; role: CompanyRole; status: import('../../domain/public.js').CompanyStatus
  }>(
    `SELECT company.name,company.slug,company.status,membership.role,membership.is_admin AS "isAdmin"
       FROM companies company
       JOIN company_memberships membership ON membership.company_id=company.id AND membership.user_id=$2
      WHERE company.id=$1 AND membership.status='ACTIVE'`,
    [companyId, userId],
  )
  const row = rows[0]
  return row ? { ...row, role: companyRoleToWire(row.role) } : null
}

export async function lockEducationAdmissions(db: Queryable): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(1282006535)`)
}

/** Caller holds the education admission lock and has authorized both members. */
export async function promoteStudentState(db: Queryable, companyId: string, userId: string): Promise<void> {
  await removeMemberState(db, companyId, userId, true)
  // End the previous identity before changing role; retain the same company seat.
  const { rows } = await db.query<{ id: string }>(`INSERT INTO company_membership_periods(membership_id,role)
    SELECT id,'TEACHER' FROM company_memberships WHERE company_id=$1 AND user_id=$2 RETURNING id`, [companyId,userId])
  await db.query(`UPDATE company_memberships SET role='TEACHER',is_admin=FALSE,status='ACTIVE',ended_at=NULL,
    period_id=$3,updated_at=NOW() WHERE company_id=$1 AND user_id=$2`, [companyId,userId,rows[0]!.id])
  await db.query(`UPDATE users SET departed_at=NULL WHERE id=$1`, [userId])
  await db.query(`UPDATE participants SET departed_at=NULL,status='avail' WHERE company_id=$1 AND id=$2 AND kind='human'`, [companyId,userId])
}
