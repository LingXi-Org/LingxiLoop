import type { Queryable } from '../../db/queryable.js'

export interface IdentityUserRow {
  id: string
  email: string
  display_name: string
  email_verified_at: Date | string | null
  is_admin: boolean
}

export interface IdentityCompanyRow {
  id: string
  name: string
  slug: string
  role: string
}

export async function findIdentityUser(db: Queryable, userId: string): Promise<IdentityUserRow | null> {
  const { rows } = await db.query<IdentityUserRow>(
    `SELECT id, email, display_name, email_verified_at, is_admin
       FROM users
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function listIdentityCompanies(db: Queryable, userId: string): Promise<IdentityCompanyRow[]> {
  const { rows } = await db.query<IdentityCompanyRow>(
    `SELECT company.id, company.name, company.slug, member.role
       FROM company_members member
       JOIN companies company ON company.id = member.company_id
      WHERE member.user_id = $1
      ORDER BY member.joined_at ASC`,
    [userId],
  )
  return rows
}

export async function listIdentityProviders(db: Queryable, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ provider: string }>(
    `SELECT provider FROM user_identities WHERE user_id = $1 ORDER BY provider ASC`,
    [userId],
  )
  return rows.map((row) => row.provider)
}

export async function findActiveAccountEmail(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [userId],
  )
  return rows[0]?.email ?? null
}

export async function scrubAccount(db: Queryable, userId: string): Promise<void> {
  await db.query(
    `UPDATE users
        SET deleted_at = NOW(),
            email = $2,
            display_name = 'Deleted user',
            password_hash = NULL,
            avatar_url = NULL,
            email_verified_at = NULL
      WHERE id = $1 AND deleted_at IS NULL`,
    [userId, `deleted+${userId}@lingxiloop.invalid`],
  )
  await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId])
  await db.query(`DELETE FROM ws_tickets WHERE user_id = $1`, [userId])
  await db.query(`DELETE FROM user_identities WHERE user_id = $1`, [userId])
  await db.query(
    `UPDATE participants
        SET departed_at = NOW()
      WHERE id = $1 AND kind = 'human' AND departed_at IS NULL`,
    [userId],
  )
}
