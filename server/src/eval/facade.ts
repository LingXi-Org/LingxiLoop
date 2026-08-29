import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import {
  findAgentRun,
  findBaselineSuite,
  findDashboardRun,
  listAgentEvents,
  listApprovals,
  listDashboardRuns,
  listEvalCases,
  listEvalStages,
  listHostActions,
  loadCanvasTrace,
  persistEvalRun,
} from './repository.js'

export const evalPersistence = {
  findAgentRun: (runId: string) => findAgentRun(pool, runId),
  listAgentEvents: (runId: string) => listAgentEvents(pool, runId),
  listHostActions: (runId: string) => listHostActions(pool, runId),
  listApprovals: (runId: string) => listApprovals(pool, runId),
  loadCanvasTrace: (canvasId: string) => loadCanvasTrace(pool, canvasId),
  findBaselineSuite: (runId: string) => findBaselineSuite(pool, runId),
  persistEvalRun: (args: Parameters<typeof persistEvalRun>[1]) =>
    persistEvalRun((work) => withTransaction(pool, work), args),
  listDashboardRuns: (args: Parameters<typeof listDashboardRuns>[1]) => listDashboardRuns(pool, args),
  findDashboardRun: (id: string) => findDashboardRun(pool, id),
  listEvalCases: (runId: string) => listEvalCases(pool, runId),
  listEvalStages: (runId: string) => listEvalStages(pool, runId),
}
