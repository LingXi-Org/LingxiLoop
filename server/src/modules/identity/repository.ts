import type { Queryable } from '../../db/queryable.js'

export interface IdentityUserRow {
  id: string
  email: string
  display_name: string
  email_verified_at: Date | string | null
}

export interface IdentityCompanyRow {
  id: string
  name: string
  slug: string
  role: string
  type: 'PERSONAL' | 'EDUCATION'
  status: import('../../domain/public.js').CompanyStatus
}

export async function findIdentityUser(db: Queryable, userId: string): Promise<IdentityUserRow | null> {
  const { rows } = await db.query<IdentityUserRow>(
    `SELECT id, email, display_name, email_verified_at
       FROM users
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function listIdentityCompanies(db: Queryable, userId: string): Promise<IdentityCompanyRow[]> {
  const { rows } = await db.query<IdentityCompanyRow>(
    `SELECT company.id, company.name, company.slug, LOWER(member.role) AS role, company.type, company.status
       FROM company_memberships member
       JOIN companies company ON company.id = member.company_id
      WHERE member.user_id = $1 AND member.status='ACTIVE' AND company.status<>'DELETED'
      ORDER BY CASE company.type WHEN 'PERSONAL' THEN 0 ELSE 1 END, member.created_at ASC`,
    [userId],
  )
  return rows
}
