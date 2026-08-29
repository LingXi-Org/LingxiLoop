import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { MessagesApplication } from '../modules/messages/application.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const COMPANY_ID = 'co-message-owner'
const OTHER_COMPANY_ID = 'co-message-other'
const AGENT_ID = 'agent-message-author'
const USER_ID = 'u-message-owner'
const CONVERSATION_ID = 'conversation-message-slice'
const MESSAGE_ID = 'wk-message-reaction-slice'

const application = new MessagesApplication({
  db: pool,
  storage: { publicUrl: async () => { throw new Error('not used') } } as never,
  transaction: (work) => withTransaction(pool, work),
  replyEmail: async () => { throw new Error('not used') },
  bumpReactionClimate: async () => undefined,
  publishReaction: async () => undefined,
})

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

function toggle(companyId: string) {
  return application.toggleWukongReaction({
    companyId,
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    messageSeq: 1,
    messageAuthorId: AGENT_ID,
    emoji: '👍',
  })
}

test('[integration] WuKong reaction projections retain explicit tenant ownership', async () => {
  await toggle(COMPANY_ID)
  await toggle(OTHER_COMPANY_ID)

  const reaction = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM message_reactions WHERE message_id = $1 ORDER BY company_id`,
    [MESSAGE_ID],
  )
  assert.deepEqual(reaction.rows.map((row) => row.company_id), [COMPANY_ID, OTHER_COMPANY_ID])
})

test('[integration] concurrent reaction toggles serialize on the tenant-scoped WuKong identity', async () => {
  await Promise.all([toggle(COMPANY_ID), toggle(COMPANY_ID)])
  const stored = await pool.query(
    `SELECT 1 FROM message_reactions WHERE message_id = $1 AND company_id = $2`,
    [MESSAGE_ID, COMPANY_ID],
  )
  assert.equal(stored.rowCount, 0)
})
