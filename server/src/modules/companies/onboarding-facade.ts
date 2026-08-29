import { invalidatePersonaCache } from '../../agents/personas.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { reconcileImChannels } from '../../im/reconcile.js'
import { CompanyOnboardingApplication } from './onboarding-application.js'

export const companyOnboardingApplication = new CompanyOnboardingApplication({
  transaction: (work) => withTransaction(pool, work),
  invalidatePersonas: invalidatePersonaCache,
  reconcileChannels: reconcileImChannels,
})
