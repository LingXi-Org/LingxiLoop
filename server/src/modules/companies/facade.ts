import { revokeCompanyAccess } from './revocation.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { generateInvitationToken, hashInvitationToken } from '../../http/invitation-token.js'
import { syncProductChannel } from '../../agent-runtime/conversations.js'
import { auditInTransaction } from '../identity/public.js'
import { CompanyApplication } from './application.js'
import { sendInvitationEmail } from './invitation-email.js'
import { CompanyLifecycleApplication } from './lifecycle-application.js'

export const companyApplication = new CompanyApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction,
  syncChannel: syncProductChannel,
  disconnectUser: async (userId, companyId) => {
    const { disconnectUserFromCompany } = await import('../../ws.js')
    disconnectUserFromCompany(userId, companyId)
    const { rows } = await pool.query<{ access_revoked_at: Date }>(`SELECT access_revoked_at FROM users WHERE id=$1`, [userId])
    if (rows[0]?.access_revoked_at) await revokeCompanyAccess(companyId, userId, rows[0].access_revoked_at)
  },
  generateInvitationToken,
  hashInvitationToken,
  invitationBaseUrl: env.INVITE_BASE_URL,
  sendInvitationEmail,
})

export const companyLifecycleApplication = new CompanyLifecycleApplication({
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction,
})
