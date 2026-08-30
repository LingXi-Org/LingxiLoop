import { invalidatePersonaCache } from '../../agents/personas.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { computeAgentAddress } from '../email/index.js'
import { assertNotManagedPulse, assertPulseVisible } from '../learning/public.js'
import { openDefaultLearningContextThread } from '../context-threads/public.js'
import { BUSY_STATUS_LEASE_MS } from './contracts.js'
import { AgentApplication } from './application.js'
import { AgentDirectoryApplication } from './directory-application.js'

export const agentApplication = new AgentApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  computeAddress: computeAgentAddress,
  invalidatePersona: invalidatePersonaCache,
  assertNotManaged: assertNotManagedPulse,
  assertVisible: assertPulseVisible,
  openLearningThreadForAgent: openDefaultLearningContextThread,
}, BUSY_STATUS_LEASE_MS)

const agentDirectoryApplication = new AgentDirectoryApplication(pool)

export function getAgentCliIdentity(id: string) {
  return agentDirectoryApplication.identity(id)
}

export function listAgentCliParticipants(actorId: string, kind: string | null) {
  return agentDirectoryApplication.participants(actorId, kind)
}

export function listAgentCliStatuses(actorId: string) {
  return agentDirectoryApplication.statuses(actorId)
}
