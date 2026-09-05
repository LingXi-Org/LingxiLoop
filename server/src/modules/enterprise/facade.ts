import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { auditInTransaction } from '../identity/public.js'
import { EnterpriseApplication } from './application.js'

export const enterpriseApplication = new EnterpriseApplication({
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction,
})
