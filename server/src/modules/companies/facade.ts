import { auditInTransaction } from '../identity/public.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { generateInvitationToken, hashInvitationToken } from '../../http/invitation-token.js'
import { wukongClient } from '../../im/wukong.js'
import { finalizeStarterAgents, installStarterAgents } from '../../onboardCompany.js'
import { CompanyApplication } from './application.js'
import { sendInvitationEmail } from './invitation-email.js'
import { seedMemberDirectConversations } from '../conversations/public.js'

export const companyApplication = new CompanyApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction,
  installCompany: installStarterAgents,
  finalizeCompany: finalizeStarterAgents,
  seedMemberDms: seedMemberDirectConversations,
  syncChannel: async (channel) => { await wukongClient().upsertChannel(channel) },
  disconnectUser: async (userId, companyId) => {
    const { disconnectUserFromCompany } = await import('../../ws.js')
    disconnectUserFromCompany(userId, companyId)
  },
  generateInvitationToken,
  hashInvitationToken,
  invitationBaseUrl: env.INVITE_BASE_URL,
  sendInvitationEmail,
})
