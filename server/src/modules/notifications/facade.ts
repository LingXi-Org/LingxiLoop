import { pool } from '../../db/pool.js'
import { NotificationApplication } from './application.js'

export const notificationApplication = new NotificationApplication(pool)
