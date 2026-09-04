import { createHash, randomBytes } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { pool } from '../../db/pool.js'
import { consumeWsTicketByHash, insertAuditEvent, insertWsTicket } from './session-repository.js'

export interface AuditInput {
  kind: string
  userId?: string | null
  companyId?: string | null
  ip?: string | null
  userAgent?: string | null
  detail?: Record<string, unknown> | null
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export const auditInTransaction = (db: Queryable, input: AuditInput) => insertAuditEvent(db, {
  kind: input.kind,
  userId: input.userId ?? null,
  companyId: input.companyId ?? null,
  ip: input.ip ?? null,
  userAgent: input.userAgent ?? null,
  detail: input.detail ?? null,
})
export const audit = (input: AuditInput) => auditInTransaction(pool, input)

export async function createWsTicket(userId: string): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 30_000)
  await insertWsTicket(pool, { tokenHash: hash(ticket), userId, expiresAt })
  return { ticket, expiresAt }
}

export const consumeWsTicket = (ticket: string) => consumeWsTicketByHash(pool, hash(ticket))
