import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { auditInTransaction } from '../identity/public.js'
import { ProjectTransferApplication } from './application.js'

export const projectTransferApplication = new ProjectTransferApplication({
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction,
})
