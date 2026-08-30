import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { auditInTransaction } from '../identity/public.js'
import { EducationApplication } from './application.js'

export const educationApplication = new EducationApplication({
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction: (db, input) => auditInTransaction(db, input),
})
