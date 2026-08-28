import { bumpClimate } from '../../agents/climate.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { replyInEmailConversation } from '../../email.js'
import { CH_REACTIONS, publish } from '../../redis.js'
import { storage } from '../../storage.js'
import { MessagesApplication } from './application.js'

export const messagesApplication = new MessagesApplication({
  db: pool,
  storage,
  transaction: (work) => withTransaction(pool, work),
  replyEmail: replyInEmailConversation,
  bumpReactionClimate: async ({ companyId, agentId, aboutId, emoji }) => {
    await bumpClimate({
      companyId,
      agentId,
      aboutId,
      affinity: 0.05,
      trust: 0.02,
      note: `received ${emoji} from ${aboutId}`,
    })
  },
  publishReaction: (event) => publish(CH_REACTIONS, event),
})
