import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { env } from '../env.js'
import { assertTeacherApprovalFresh, assertTeacherRoomAccessible } from '../modules/learning/public.js'
import { wukongClient } from '../im/wukong.js'
import { executeActionWithLedger } from './control-plane.js'
import { AgentApprovalApplication } from './approval-application.js'
import { AgentControlApplication } from './control-application.js'

export const agentControlApplication = new AgentControlApplication({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  assertChannelAccessible: assertTeacherRoomAccessible,
  sendMessage: (...args) => wukongClient().sendMessage(...args),
})

export const agentApprovalApplication = new AgentApprovalApplication({
  db: pool,
  approvalTtlMs: env.AGENT_OS_APPROVAL_TTL_MS,
  transaction: (work) => withTransaction(pool, work),
  assertTeacherApprovalFresh,
  executeAction: executeActionWithLedger,
  sendMessage: (...args) => wukongClient().sendMessage(...args),
})
