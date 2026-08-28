import { pool } from '../../db/pool.js'
import { withClientTransaction, withTransaction } from '../../db/transaction.js'
import { createCanvasApplication } from './application.js'
import { CH_CANVAS, publish } from '../../redis.js'

const canvasApplication = createCanvasApplication({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  connectionTransaction: withClientTransaction,
  acquireConnection: () => pool.connect(),
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
