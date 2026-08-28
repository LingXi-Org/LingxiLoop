import { suspendUser, unsuspendUser } from '../../admin.js'
import { pool } from '../../db/pool.js'
import { AdminApplication } from './application.js'

export const adminApplication = new AdminApplication(pool, { suspendUser, unsuspendUser })
