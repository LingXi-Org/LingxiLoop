import { pool } from '../../db/pool.js'
import { withClientTransaction, withTransaction } from '../../db/transaction.js'
import { missingAgentChannelMessageIds } from '../../im/public.js'
import { CH_CANVAS, publish } from '../../redis.js'
import { createCanvasApplication } from './application.js'
import { acquireCanvasSharedFence, releaseCanvasSharedFence } from './repository.js'
import { createCanvasExecution } from './execution.js'
import { createCanvasRuntime } from './runtime.js'
import type { SharedStateUpdate } from '@lyyzka/lingxios'

const collaboration = createCanvasRuntime(async () => (await import('../../agent-runtime/runtime.js')).lingxiOSControl())
export const readCanvasCollaboration = (companyId: string,userId: string,canvasId: string,afterSeq = 0) => collaboration.readCollaboration(pool,companyId,userId,canvasId,afterSeq)
export const updateCanvasSharedState = (companyId: string,userId: string,canvasId: string,update: SharedStateUpdate) => collaboration.updateSharedState(pool,companyId,userId,canvasId,update)

const canvasApplication = createCanvasApplication({
  db: pool,
  execution: createCanvasExecution(async () => (await import('../../agent-runtime/runtime.js')).lingxiOSControl()),
  transaction: (work) => withTransaction(pool, work),
  withCanvasFence: async (canvasId, work) => {
    const client = await pool.connect()
    try {
      await acquireCanvasSharedFence(client, canvasId)
      return await withClientTransaction(client, work)
    } finally {
      await releaseCanvasSharedFence(client, canvasId).catch(() => undefined)
      client.release()
    }
  },
  missingChannelMessageIds: (input) => missingAgentChannelMessageIds({
    companyId: input.companyId,
    agentId: input.actorId,
    channelId: input.channelId,
    messageIds: input.messageIds,
  }),
  publishEvent: (event) => publish(CH_CANVAS, event),
})

export const {
  addCanvasComment,
  addCanvasWorkspaceAgents,
  appendCanvasFrameContent,
  assertCanvasWorkReportReady,
  assignCanvasWorkspaceWork,
  completeCanvasWork,
  createCanvasFrame,
  deleteCanvasFrame,
  ensureConversationCanvas,
  getCanvasSnapshot,
  getConversationCanvas,
  handoffCanvasWork,
  listCanvasAvailableAgents,
  listCanvasWorkspaces,
  setCanvasStatus,
  startCanvasWorkspace,
  steerCanvasAssignment,
  stopCanvasAssignment,
  stopCanvasWorkspace,
  submitCanvasReport,
  updateCanvasFrame,
} = canvasApplication
