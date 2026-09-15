import type { Queryable } from '../../db/queryable.js'

export interface IdentityUserRow {
  id: string
  email: string
  avatar_seed: string | null
  avatar_url: string | null
  display_name: string
  email_verified_at: Date | string | null
}

export interface IdentityCompanyRow {
  id: string
  name: string
  slug: string
  role: string
  type: 'EDUCATION'
  isAdmin: boolean
  status: import('../../domain/public.js').CompanyStatus
}

export async function findIdentityUser(db: Queryable, userId: string): Promise<IdentityUserRow | null> {
  const { rows } = await db.query<IdentityUserRow>(
    `SELECT id, email, display_name, email_verified_at, avatar_seed, avatar_url
       FROM users
      WHERE id = $1 AND deleted_at IS NULL AND suspended_at IS NULL AND departed_at IS NULL
      LIMIT 1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function listIdentityCompanies(db: Queryable, userId: string): Promise<IdentityCompanyRow[]> {
  const { rows } = await db.query<IdentityCompanyRow>(
    `SELECT company.id, company.name, company.slug, LOWER(member.role) AS role, member.is_admin AS "isAdmin", company.type, company.status
       FROM company_memberships member
       JOIN companies company ON company.id = member.company_id
      WHERE member.user_id = $1 AND member.status='ACTIVE' AND company.status<>'DELETED'
      ORDER BY member.created_at ASC`,
    [userId],
  )
  return rows
}
