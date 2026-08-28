import { invalidatePersonaCache } from '../../agents/personas.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { computeAgentAddress } from '../../email.js'
import { assertNotManagedPulse, assertPulseVisible } from '../learning/access.js'
import { BUSY_STATUS_LEASE_MS } from '../../status.js'
import { AgentApplication } from './application.js'

export const agentApplication = new AgentApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  computeAddress: computeAgentAddress,
  invalidatePersona: invalidatePersonaCache,
  assertNotManaged: assertNotManagedPulse,
  assertVisible: assertPulseVisible,
}, BUSY_STATUS_LEASE_MS)
