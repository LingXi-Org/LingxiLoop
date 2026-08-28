import { pool } from '../../db/pool.js'
import { CH_DOCS, publish } from '../../redis.js'
import { DocumentsApplication } from './application.js'

export const documentsApplication = new DocumentsApplication(pool, {
  publish: async (event) => publish(CH_DOCS, event),
})
