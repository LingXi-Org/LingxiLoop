import { pool } from '../../db/pool.js'
import { withClientTransaction, withTransaction } from '../../db/transaction.js'
import { createCanvasApplication } from './application.js'

const canvasApplication = createCanvasApplication({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  clientTransaction: withClientTransaction,
  connect: () => pool.connect(),
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
