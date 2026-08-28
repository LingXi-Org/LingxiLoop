import { postMembershipSystemMessage } from '../../agents/membership.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { wukongClient } from '../../im/wukong.js'
import { isTeacherRoom } from '../learning/public.js'
import { CH_CONVO_UPDATED, CH_TYPING, publish } from '../../redis.js'
import { ConversationsApplication } from './application.js'

export const conversationsApplication = new ConversationsApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  syncChannel: (profile) => wukongClient().upsertChannel(profile),
  publishUpdated: (event) => publish(CH_CONVO_UPDATED, event),
  publishTyping: (event) => publish(CH_TYPING, event),
  isTeacherRoom: (companyId, conversationId) => isTeacherRoom(conversationId, companyId),
  postMembershipMessage: async (args) => { await postMembershipSystemMessage(args) },
})
