import { createHash, randomBytes } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import {
  consumeWsTicketByHash,
  deleteSessionByHash,
  findSession,
  insertAuditEvent,
  insertSession,
  insertWsTicket,
  touchSession,
} from './session-repository.js'

const SESSION_TTL_MS = 30 * 24 * 60 * 60_000
const SESSION_IDLE_TTL_MS = 14 * 24 * 60 * 60_000
const WS_TICKET_TTL_MS = 60_000

export interface AuditInput {
  kind: string
  userId?: string | null
  companyId?: string | null
  ip?: string | null
  userAgent?: string | null
  detail?: Record<string, unknown>
}

interface SessionApplicationDependencies {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  now(): number
  sessionToken(): string
  wsTicket(): string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export class SessionApplication {
  constructor(
    private readonly db: Queryable,
    private readonly dependencies: SessionApplicationDependencies,
  ) {}

  async createSession(
    userId: string,
    options: { ip?: string; ua?: string },
    loginAudit?: AuditInput,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.dependencies.sessionToken()
    const expiresAt = new Date(this.dependencies.now() + SESSION_TTL_MS)
    await this.dependencies.transaction(async (db) => {
      await insertSession(db, {
        tokenHash: hashToken(token),
        userId,
        expiresAt,
        ip: options.ip ?? null,
        userAgent: options.ua ?? null,
      })
      if (loginAudit) {
        await insertAuditEvent(db, {
          kind: loginAudit.kind,
          userId: loginAudit.userId ?? userId,
          companyId: loginAudit.companyId ?? null,
          ip: loginAudit.ip ?? options.ip ?? null,
          userAgent: loginAudit.userAgent ?? options.ua ?? null,
          detail: loginAudit.detail ?? null,
        })
      }
    })
    return { token, expiresAt }
  }

  async resolveSession(token: string): Promise<{ userId: string } | null> {
    const tokenHash = hashToken(token)
    const row = await findSession(this.db, tokenHash)
    if (!row) return null
    const now = this.dependencies.now()
    const expired = new Date(row.expiresAt).getTime() < now
    const idle = new Date(row.lastUsedAt).getTime() < now - SESSION_IDLE_TTL_MS
    if (expired || idle) {
      await deleteSessionByHash(this.db, tokenHash)
      return null
    }
    if (row.suspendedAt || row.deletedAt) return null
    await touchSession(this.db, tokenHash)
    return { userId: row.userId }
  }

  async deleteSession(token: string): Promise<void> {
    await deleteSessionByHash(this.db, hashToken(token))
  }

  async audit(input: AuditInput): Promise<void> {
    await insertAuditEvent(this.db, {
      kind: input.kind,
      userId: input.userId ?? null,
      companyId: input.companyId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      detail: input.detail ?? null,
    })
  }

  async createWsTicket(userId: string): Promise<{ ticket: string; expiresAt: Date }> {
    const ticket = this.dependencies.wsTicket()
    const expiresAt = new Date(this.dependencies.now() + WS_TICKET_TTL_MS)
    await insertWsTicket(this.db, { tokenHash: hashToken(ticket), userId, expiresAt })
    return { ticket, expiresAt }
  }

  async consumeWsTicket(ticket: string): Promise<{ userId: string } | null> {
    const userId = await consumeWsTicketByHash(this.db, hashToken(ticket))
    return userId ? { userId } : null
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function generateWsTicket(): string {
  return randomBytes(24).toString('base64url')
}
