import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import {
  generateSessionToken,
  generateWsTicket,
  SessionApplication,
  type AuditInput,
} from './session-application.js'

const sessionApplication = new SessionApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  now: Date.now,
  sessionToken: generateSessionToken,
  wsTicket: generateWsTicket,
})

export const createSession = (
  userId: string,
  options: { ip?: string; ua?: string },
) => sessionApplication.createSession(userId, options)

export const createLoginSession = (
  userId: string,
  options: { ip?: string; ua?: string },
  auditInput: AuditInput,
) => sessionApplication.createSession(userId, options, auditInput)

export const resolveSession = (token: string) => sessionApplication.resolveSession(token)
export const deleteSession = (token: string) => sessionApplication.deleteSession(token)
export const audit = (input: AuditInput) => sessionApplication.audit(input)
export const createWsTicket = (userId: string) => sessionApplication.createWsTicket(userId)
export const consumeWsTicket = (ticket: string) => sessionApplication.consumeWsTicket(ticket)
