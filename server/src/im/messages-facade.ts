import { pool } from '../db/pool.js'
import { toggleWukongReaction, wukongReactions } from '../modules/messages/public.js'
import { ImMessagesApplication } from './messages-application.js'
import { wukongClient } from './wukong.js'

export const imMessagesApplication = new ImMessagesApplication({
  db: pool,
  withConnection: async (work) => {
    const client = await pool.connect()
    try {
      return await work(client)
    } finally {
      client.release()
    }
  },
  syncMessages: (...args) => wukongClient().syncMessages(...args),
  reactions: wukongReactions,
  toggleReaction: toggleWukongReaction,
  sendMessage: (...args) => wukongClient().sendMessage(...args),
})
