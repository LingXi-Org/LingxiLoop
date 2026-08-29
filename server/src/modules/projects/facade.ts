import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { auditInTransaction } from '../identity/public.js'
import { projectLifecycleProjection } from '../learning/public.js'
import { ProjectLifecycleApplication } from './application.js'

export const projectLifecycleApplication = new ProjectLifecycleApplication({
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction,
  projectLifecycleProjection,
})
