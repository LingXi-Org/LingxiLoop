import { audit, createWsTicket, deleteSession } from '../../auth.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import {
  authorizeUrl,
  consumeState,
  createState,
  errorUrl,
  handleCallback,
  providerEnabled,
  returnUrlAllowed,
} from '../../oauth.js'
import { IdentityApplication } from './application.js'

export const identityApplication = new IdentityApplication(pool, {
  providerEnabled,
  returnUrlAllowed,
  createState,
  consumeState,
  authorizeUrl,
  handleCallback,
  errorUrl,
  audit,
  deleteSession,
  createWsTicket,
  transaction: (work) => withTransaction(pool, work),
  invitationEmailEnabled: Boolean(env.EMAIL_DOMAIN),
})
