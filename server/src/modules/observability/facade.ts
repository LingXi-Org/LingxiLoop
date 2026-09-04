import { pool } from '../../db/pool.js'
import { ObservabilityApplication } from './application.js'

export const observabilityApplication = new ObservabilityApplication(pool)
