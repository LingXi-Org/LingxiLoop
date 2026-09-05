import { pool } from '../../db/pool.js'
import { withClientTransaction, withTransaction } from '../../db/transaction.js'
import { missingAgentChannelMessageIds } from '../../im/public.js'
import { CH_CANVAS, publish } from '../../redis.js'
import { createCanvasApplication } from './application.js'
import { acquireCanvasSharedFence, releaseCanvasSharedFence } from './repository.js'

const canvasApplication = createCanvasApplication({
  db: pool,
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
