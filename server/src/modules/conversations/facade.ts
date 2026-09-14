import { postMembershipSystemMessage } from '../../agents/membership.js'
import { clearHold } from '../../agents/seen-boundary.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { syncProductChannel } from '../../agent-runtime/conversations.js'
import { searchMemberMessages } from '../../im/public.js'
import { isTeacherRoom } from '../learning/public.js'
import { CH_CONVO_UPDATED, CH_TYPING, publish } from '../../redis.js'
import { ConversationsApplication, type ConversationInfrastructure } from './application.js'

export const conversationInfrastructure: ConversationInfrastructure = {
  transaction: (work) => withTransaction(pool, work),
  syncChannel: syncProductChannel,
  publishUpdated: (event) => publish(CH_CONVO_UPDATED, event),
  publishTyping: (event) => publish(CH_TYPING, event),
  isTeacherRoom: (companyId, conversationId) => isTeacherRoom(conversationId, companyId),
  postMembershipMessage: postMembershipSystemMessage,
  clearReplyHold: async (agentId, conversationId) => { await clearHold(agentId, `reply:${conversationId}`) },
  searchMessages: (input) => searchMemberMessages({ ...input, query: input.query }),
}
export const conversationsApplication = new ConversationsApplication(pool, conversationInfrastructure)
