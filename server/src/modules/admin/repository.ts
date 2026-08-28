import type { Queryable } from '../../db/queryable.js'
import type { AdminStats, AdminUser } from './contracts.js'

interface UserRow {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  is_admin: boolean
  created_at: string
  last_login_at: string | null
  company_count: string
  suspended_at: string | null
  suspension_reason: string | null
  suspended_by: string | null
}

function mapUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    avatarUrl: row.avatar_url,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    companyCount: Number(row.company_count),
    suspended: row.suspended_at !== null,
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
    suspendedBy: row.suspended_by,
  }
}

const userProjection = `u.id, u.email, u.display_name, u.avatar_url, u.is_admin,
  u.created_at, u.last_login_at, u.suspended_at, u.suspension_reason, u.suspended_by,
  (SELECT COUNT(*)::int FROM company_members cm WHERE cm.user_id = u.id) AS company_count`

export async function isAdmin(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id=$1', [userId])
  return rows[0]?.is_admin === true
}

export async function listUsers(
  db: Queryable,
  input: { q: string; limit: number; offset: number },
): Promise<{ items: AdminUser[]; total: number }> {
  const params: unknown[] = []
  const where = input.q
    ? (() => {
        params.push(`%${input.q.toLowerCase()}%`)
        return `WHERE LOWER(u.email) LIKE $1 OR LOWER(u.display_name) LIKE $1`
      })()
    : ''
  params.push(input.limit, input.offset)
  const [{ rows }, count] = await Promise.all([
    db.query<UserRow>(
      `SELECT ${userProjection} FROM users u ${where}
       ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM users u ${where}`, params.slice(0, -2)),
  ])
  return { items: rows.map(mapUser), total: Number(count.rows[0]?.n ?? 0) }
}

export async function findUser(db: Queryable, userId: string): Promise<AdminUser | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT ${userProjection} FROM users u WHERE u.id=$1`,
    [userId],
  )
  return rows[0] ? mapUser(rows[0]) : null
}

export async function listUserCompanies(db: Queryable, userId: string) {
  const { rows } = await db.query<{
    id: string
    name: string
    slug: string
    role: string
    created_at: string
    agent_count: number
  }>(
    `SELECT c.id, c.name, c.slug, cm.role, c.created_at,
       (SELECT COUNT(*)::int FROM participants p
         WHERE p.company_id=c.id AND p.kind='agent' AND p.departed_at IS NULL) AS agent_count
     FROM company_members cm JOIN companies c ON c.id=cm.company_id
     WHERE cm.user_id=$1 ORDER BY cm.joined_at ASC`,
    [userId],
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    createdAt: row.created_at,
    agentCount: Number(row.agent_count),
  }))
}

export async function setAdmin(db: Queryable, userId: string, value: boolean): Promise<boolean> {
  const result = await db.query('UPDATE users SET is_admin=$2 WHERE id=$1', [userId, value])
  return (result.rowCount ?? 0) > 0
}

export async function readStats(db: Queryable): Promise<AdminStats> {
  const [users, waitlist, companies, agents] = await Promise.all([
    db.query<{ total: string; admins: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE is_admin)::text AS admins FROM users`,
    ),
    db.query<{ pending: string; approved: string; rejected: string }>(
      `SELECT COUNT(*) FILTER (WHERE status='pending')::text AS pending,
              COUNT(*) FILTER (WHERE status='approved')::text AS approved,
              COUNT(*) FILTER (WHERE status='rejected')::text AS rejected FROM waitlist`,
    ),
    db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM companies'),
    db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM participants WHERE kind='agent' AND departed_at IS NULL`,
    ),
  ])
  return {
    users: {
      total: Number(users.rows[0]?.total ?? 0),
      admins: Number(users.rows[0]?.admins ?? 0),
    },
    waitlist: {
      pending: Number(waitlist.rows[0]?.pending ?? 0),
      approved: Number(waitlist.rows[0]?.approved ?? 0),
      rejected: Number(waitlist.rows[0]?.rejected ?? 0),
    },
    companies: Number(companies.rows[0]?.n ?? 0),
    agents: Number(agents.rows[0]?.n ?? 0),
  }
}
