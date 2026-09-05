import { pool } from '../db/pool.js'
import { ImChannelsApplication } from './channels-application.js'
import { wukongClient } from './wukong.js'

export const imChannelsApplication = new ImChannelsApplication({
  db: pool,
  listConversations: (userId) => wukongClient().listConversations(userId),
})
