import { enqueueAgentWork } from '../../agent-os/enqueue.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { CH_BOARDS, publish } from '../../redis.js'
import { BoardApplication } from './application.js'

export const boardApplication = new BoardApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  publish: async (event) => {
    await publish(CH_BOARDS, { type: 'board.changed', ...event })
  },
  enqueueAgent: async (work) => { await enqueueAgentWork(work) },
})
