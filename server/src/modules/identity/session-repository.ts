import type { Queryable } from '../../db/queryable.js'

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
