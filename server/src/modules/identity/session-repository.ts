import type { Queryable } from '../../db/queryable.js'

export interface SessionRow {
  userId: string
  expiresAt: Date | string
  lastUsedAt: Date | string
  suspendedAt: Date | string | null
  deletedAt: Date | string | null
}

export async function insertSession(
  db: Queryable,
  input: { tokenHash: string; userId: string; expiresAt: Date; ip: string | null; userAgent: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.tokenHash, input.userId, input.expiresAt, input.ip, input.userAgent],
  )
  await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [input.userId])
}

export async function findSession(db: Queryable, tokenHash: string): Promise<SessionRow | null> {
  const { rows } = await db.query<{
    user_id: string
    expires_at: Date | string
    last_used_at: Date | string
    suspended_at: Date | string | null
    deleted_at: Date | string | null
  }>(
    `SELECT session.user_id, session.expires_at, session.last_used_at,
            app_user.suspended_at, app_user.deleted_at
       FROM sessions session
       JOIN users app_user ON app_user.id = session.user_id
      WHERE session.token_hash = $1`,
    [tokenHash],
  )
  const row = rows[0]
  return row ? {
    userId: row.user_id,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    suspendedAt: row.suspended_at,
    deletedAt: row.deleted_at,
  } : null
}

export async function deleteSessionByHash(db: Queryable, tokenHash: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash])
}

export async function touchSession(db: Queryable, tokenHash: string): Promise<void> {
  await db.query(`UPDATE sessions SET last_used_at = NOW() WHERE token_hash = $1`, [tokenHash])
}

export async function insertAuditEvent(
  db: Queryable,
  input: {
    kind: string
    userId: string | null
    companyId: string | null
    ip: string | null
    userAgent: string | null
    detail: Record<string, unknown> | null
  },
): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (user_id, company_id, ip, user_agent, kind, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.userId,
      input.companyId,
      input.ip,
      input.userAgent,
      input.kind,
      input.detail ? JSON.stringify(input.detail) : null,
    ],
  )
}

export async function insertWsTicket(
  db: Queryable,
  input: { tokenHash: string; userId: string; expiresAt: Date },
): Promise<void> {
  await db.query(
    `INSERT INTO ws_tickets (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [input.tokenHash, input.userId, input.expiresAt],
  )
}

export async function consumeWsTicketByHash(db: Queryable, tokenHash: string): Promise<string | null> {
  const result = await db.query<{ user_id: string }>(
    `UPDATE ws_tickets SET used_at = NOW()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id`,
    [tokenHash],
  )
  return (result.rowCount ?? 0) > 0 ? result.rows[0]?.user_id ?? null : null
}
