import { pool } from '../db/pool.js'
import { ImAccessApplication } from './access-application.js'

export const imAccessApplication = new ImAccessApplication(pool)
