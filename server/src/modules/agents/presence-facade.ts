import { pool } from '../../db/pool.js'
import { CH_STATUS, publish } from '../../redis.js'
import { ParticipantPresenceApplication } from './presence-application.js'

export const participantPresenceApplication = new ParticipantPresenceApplication(pool, {
  publish: async (event) => { await publish(CH_STATUS, event) },
})
