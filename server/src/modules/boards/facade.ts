import { enqueueAgentWork } from '../../agent-os/enqueue.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { inc } from '../../metrics.js'
import { CH_BOARDS, publish } from '../../redis.js'
import { BoardApplication } from './application.js'

export const boardApplication = new BoardApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  publish: async (event) => {
    await publish(CH_BOARDS, { type: 'board.changed', ...event })
  },
  enqueueAgent: async (work) => { await enqueueAgentWork(work) },
  reportPublishFailure: (event, error) => {
    inc('boards.events.publish_failed', { kind: event.kind })
    console.warn(
      '[boards] realtime projection publish failed:',
      error instanceof Error ? error.message : String(error),
    )
  },
})
