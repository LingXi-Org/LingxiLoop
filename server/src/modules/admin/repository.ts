import type { Queryable } from '../../db/queryable.js'
import type {
  AdminStats,
  AdminUser,
  AppSettingKey,
  AppSettings,
  EnqueueWaitlistInput,
  WaitlistFilter,
  WaitlistRow,
} from './contracts.js'

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

const DEFAULT_SETTINGS: AppSettings = {
  waitlist_enabled: false,
  signups_paused: false,
}

export async function seedAdminEmails(db: Queryable, emails: readonly string[]): Promise<number> {
  if (emails.length === 0) return 0
  const result = await db.query(
    `UPDATE users SET is_admin = TRUE
      WHERE LOWER(email) = ANY($1::text[]) AND is_admin = FALSE`,
    [emails],
  )
  return result.rowCount ?? 0
}

export async function readSettings(db: Queryable): Promise<AppSettings> {
  const { rows } = await db.query<{ key: string; value: unknown }>('SELECT key, value FROM app_settings')
  const values = new Map(rows.map((row) => [row.key, row.value]))
  return {
    waitlist_enabled: typeof values.get('waitlist_enabled') === 'boolean'
      ? values.get('waitlist_enabled') as boolean
      : DEFAULT_SETTINGS.waitlist_enabled,
    signups_paused: typeof values.get('signups_paused') === 'boolean'
      ? values.get('signups_paused') as boolean
      : DEFAULT_SETTINGS.signups_paused,
  }
}

export async function writeSetting(
  db: Queryable,
  key: AppSettingKey,
  value: boolean,
  updatedBy: string,
): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), updatedBy],
  )
}

export async function readWaitlistEnabled(db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = 'waitlist_enabled' LIMIT 1`,
  )
  return rows[0]?.value === true
}

interface WaitlistDbRow {
  id: string
  provider: string
  provider_id: string
  email: string
  display_name: string
  avatar_url: string | null
  status: WaitlistRow['status']
  note: string | null
  requested_at: string
  decided_at: string | null
  decided_by: string | null
}

function mapWaitlist(row: WaitlistDbRow): WaitlistRow {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.provider_id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
    note: row.note,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  }
}

export async function upsertWaitlist(
  db: Queryable,
  id: string,
  input: EnqueueWaitlistInput,
): Promise<WaitlistRow> {
  const { rows } = await db.query<WaitlistDbRow>(
    `INSERT INTO waitlist (id, provider, provider_id, email, display_name, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider, provider_id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url, requested_at = NOW(),
           status = CASE WHEN waitlist.status = 'rejected' THEN 'rejected' ELSE 'pending' END
     RETURNING *`,
    [id, input.provider, input.providerId, input.email, input.displayName, input.avatarUrl],
  )
  return mapWaitlist(rows[0]!)
}

function waitlistWhere(filter: WaitlistFilter): { sql: string; params: unknown[] } {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.status) {
    params.push(filter.status)
    where.push(`status = $${params.length}`)
  }
  const query = filter.q?.trim().toLowerCase()
  if (query) {
    params.push(`%${query}%`)
    const index = params.length
    where.push(`(LOWER(email) LIKE $${index} OR LOWER(display_name) LIKE $${index}
      OR LOWER(provider) LIKE $${index} OR LOWER(provider_id) LIKE $${index}
      OR LOWER(COALESCE(note, '')) LIKE $${index})`)
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

export async function listWaitlistRows(
  db: Queryable,
  filter: WaitlistFilter,
): Promise<{ items: WaitlistRow[]; total: number }> {
  const { sql, params } = waitlistWhere(filter)
  const count = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM waitlist ${sql}`, params)
  const limit = Math.min(500, Math.max(1, filter.limit ?? 50))
  const offset = Math.max(0, filter.offset ?? 0)
  const pageParams = [...params, limit, offset]
  const { rows } = await db.query<WaitlistDbRow>(
    `SELECT * FROM waitlist ${sql} ORDER BY requested_at DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams,
  )
  return { items: rows.map(mapWaitlist), total: Number(count.rows[0]?.n ?? 0) }
}

export async function lockWaitlistRow(db: Queryable, id: string): Promise<WaitlistRow | null> {
  const { rows } = await db.query<WaitlistDbRow>('SELECT * FROM waitlist WHERE id = $1 FOR UPDATE', [id])
  return rows[0] ? mapWaitlist(rows[0]) : null
}

export async function userExistsByEmail(db: Queryable, email: string): Promise<boolean> {
  const result = await db.query('SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1', [email.toLowerCase()])
  return (result.rowCount ?? 0) > 0
}

export async function hasPendingInvitation(db: Queryable, email: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM company_invitations WHERE LOWER(email) = $1
       AND revoked_at IS NULL AND expires_at > NOW() AND use_count < max_uses LIMIT 1`,
    [email.toLowerCase()],
  )
  return (result.rowCount ?? 0) > 0
}

export async function insertApprovedUser(
  db: Queryable,
  input: { userId: string; row: WaitlistRow; isAdmin: boolean },
): Promise<void> {
  await db.query(
    `INSERT INTO users (id, email, display_name, password_hash, email_verified_at, is_admin)
       VALUES ($1, $2, $3, NULL, NOW(), $4)`,
    [input.userId, input.row.email, input.row.displayName, input.isAdmin],
  )
  await db.query(
    `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
       VALUES ($1, $2, $3, $4)`,
    [input.row.provider, input.row.providerId, input.userId, input.row.email.toLowerCase()],
  )
}

export async function insertPersonalCompany(
  db: Queryable,
  input: { companyId: string; userId: string; displayName: string; slug: string },
): Promise<boolean> {
  await db.query('SAVEPOINT admin_company_insert')
  try {
    await db.query(
      'INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)',
      [input.companyId, `${input.displayName}'s workspace`, input.slug, input.userId],
    )
    await db.query('RELEASE SAVEPOINT admin_company_insert')
    return true
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (code !== '23505' && !/duplicate key/.test(error instanceof Error ? error.message : String(error))) throw error
    await db.query('ROLLBACK TO SAVEPOINT admin_company_insert')
    return false
  }
}

export async function insertCompanyOwner(db: Queryable, companyId: string, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [companyId, userId],
  )
}

export async function attachApprovedAvatar(
  db: Queryable,
  input: { userId: string; companyId: string | null; displayName: string; avatarUrl: string | null },
): Promise<void> {
  await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [input.avatarUrl, input.userId])
  if (!input.companyId) return
  await db.query(
    `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id)
       VALUES ($1, 'human', $2, NULL, $3, '#FF8870', $4, 'avail', $5)
       ON CONFLICT (id, company_id) DO NOTHING`,
    [input.userId, input.displayName, input.displayName.charAt(0).toUpperCase(), input.avatarUrl, input.companyId],
  )
}

export async function markWaitlistApproved(db: Queryable, id: string, decidedBy: string): Promise<void> {
  await db.query(
    `UPDATE waitlist SET status = 'approved', decided_at = NOW(), decided_by = $2 WHERE id = $1`,
    [id, decidedBy],
  )
}

export async function rejectPendingWaitlist(
  db: Queryable,
  id: string,
  decidedBy: string,
  note: string | null,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE waitlist SET status = 'rejected', decided_at = NOW(), decided_by = $2, note = $3
      WHERE id = $1 AND status = 'pending'`,
    [id, decidedBy, note],
  )
  return (result.rowCount ?? 0) > 0
}

export async function suspendUserRecord(
  db: Queryable,
  input: { userId: string; adminId: string; reason: string | null },
): Promise<'updated' | 'missing' | 'already-suspended'> {
  const result = await db.query(
    `UPDATE users SET suspended_at = NOW(), suspension_reason = $2, suspended_by = $3
      WHERE id = $1 AND suspended_at IS NULL`,
    [input.userId, input.reason, input.adminId],
  )
  if ((result.rowCount ?? 0) > 0) return 'updated'
  const exists = await db.query('SELECT 1 FROM users WHERE id = $1', [input.userId])
  return (exists.rowCount ?? 0) > 0 ? 'already-suspended' : 'missing'
}

export async function revokeUserSessions(db: Queryable, userId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

export async function unsuspendUserRecord(db: Queryable, userId: string): Promise<'updated' | 'missing' | 'active'> {
  const result = await db.query(
    `UPDATE users SET suspended_at = NULL, suspension_reason = NULL, suspended_by = NULL
      WHERE id = $1 AND suspended_at IS NOT NULL`,
    [userId],
  )
  if ((result.rowCount ?? 0) > 0) return 'updated'
  const exists = await db.query('SELECT 1 FROM users WHERE id = $1', [userId])
  return (exists.rowCount ?? 0) > 0 ? 'active' : 'missing'
}
