/** Redis outage/recovery Compose E2E (issue #9 section 6).
 *
 * setup: seed while Redis is healthy.
 * pre:   with Redis stopped, POST a unique human message. The HTTP request
 *        cannot finish its publish, but the durable Postgres row must exist.
 * post:  after Redis restarts, a normal follow-up wake makes the agent drain
 *        its durable inbox. The run must include the outage-era row, emit one
 *        real reply, and advance its cursor.
 */
import { randomUUID } from 'node:crypto'
import { createSession } from '../src/auth.js'
import { pool } from '../src/db/pool.js'
import {
  BASE_URL,
  log as baseLog,
  findOwnerDm,
  getUnreadCursor,
  latestCompanyForPrefix,
  postMessage,
  seedCompany,
  sleep,
  waitForCursorAdvance,
} from './mvp-lib.js'

const SLUG_PREFIX = 'mvp-fault-redis'
const phase = process.argv[2]
if (phase !== 'setup' && phase !== 'pre' && phase !== 'post') {
  console.error('usage: mvp-fault-redis.ts <setup|pre|post>')
  process.exit(2)
}
const TAG = `mvp-fault-redis:${phase}`
const log = (message: string) => baseLog(TAG, message)
const MARKER_PREFIX = '__MVP_REDIS_OUTAGE__'

async function markerRow(conversationId: string): Promise<{ id: string; body: string } | undefined> {
  const { rows } = await pool.query<{ id: string; body: string }>(
    `SELECT id, body FROM messages WHERE conversation_id = $1 AND body LIKE $2 ORDER BY created_at DESC LIMIT 1`,
    [conversationId, `${MARKER_PREFIX}%`],
  )
  return rows[0]
}

async function main(): Promise<void> {
  if (phase === 'setup') {
    const { companyId, userId } = await seedCompany(SLUG_PREFIX)
    const { conversationId, agentId } = await findOwnerDm(companyId, userId)
    log(`seeded ${companyId}; Redis fault target is DM ${conversationId} / agent ${agentId}`)
    return
  }

  const { companyId, userId } = await latestCompanyForPrefix(SLUG_PREFIX)
  const { conversationId, agentId } = await findOwnerDm(companyId, userId)
  if (phase === 'pre') {
    const { token } = await createSession(userId, {})
    const body = `${MARKER_PREFIX}${randomUUID()}`
    const request = fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(5_000),
    }).catch((error) => {
      log(`POST could not complete while Redis was down (expected and observable): ${error instanceof Error ? error.message : String(error)}`)
    })

    const deadline = Date.now() + 10_000
    let persisted
    while (!persisted && Date.now() < deadline) {
      persisted = await markerRow(conversationId)
      if (!persisted) await sleep(100)
    }
    if (!persisted) throw new Error('user message was silently dropped before durable Postgres persistence')
    log(`PASS: Redis unavailable, but user message ${persisted.id} is durable in Postgres`)
    await request
    return
  }

  const marker = await markerRow(conversationId)
  if (!marker) throw new Error('Redis outage marker row disappeared before recovery')
  const cursorBefore = await getUnreadCursor(agentId, conversationId)
  const { token } = await createSession(userId, {})
  const wakeId = await postMessage(token, conversationId, `Redis recovery wake ${randomUUID()}`)
  log(`Redis is healthy; posted recovery wake ${wakeId} to drain the durable inbox`)
  const replyDeadline = Date.now() + 60_000
  let reply: { id: string } | undefined
  while (!reply && Date.now() < replyDeadline) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM messages WHERE conversation_id = $1 AND author_id = $2
         AND created_at >= (SELECT created_at FROM messages WHERE id = $3)
         AND body NOT LIKE '%"noticeKind":"agent_turn_failed"%'
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId, agentId, marker.id],
    )
    reply = rows[0]
    if (!reply) await sleep(500)
  }
  if (!reply) throw new Error('durable Redis-outage input did not produce a reply after recovery')
  const cursorAfter = await waitForCursorAdvance(agentId, conversationId, cursorBefore, 15_000)
  if (cursorAfter === cursorBefore) throw new Error('cursor did not advance after Redis recovery processed durable input')
  const { rows: completedRuns } = await pool.query<{ input_message_ids: string[] }>(
    `SELECT input_message_ids FROM agent_runs
       WHERE agent_id = $1 AND status = 'completed' AND input_message_ids @> $2::jsonb
       ORDER BY started_at DESC LIMIT 1`,
    [agentId, JSON.stringify([marker.id])],
  )
  if (!completedRuns[0]) throw new Error(`no successful recovery run consumed durable outage message ${marker.id}`)
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages
       WHERE conversation_id = $1 AND author_id = $2 AND created_at >= (SELECT created_at FROM messages WHERE id = $3)
         AND body NOT LIKE '%"noticeKind":"agent_turn_failed"%'`,
    [conversationId, agentId, marker.id],
  )
  if (Number(rows[0]?.count ?? 0) !== 1) throw new Error(`Redis recovery produced ${rows[0]?.count ?? 0} replies; expected exactly one`)
  log(`PASS: Redis recovered; successful run consumed durable message ${marker.id}, produced reply ${reply.id} exactly once, and advanced the cursor`)
}

main().then(async () => {
  await pool.end()
  process.exit(0)
}).catch((error) => {
  console.error(`[${TAG}] FAIL`, error)
  pool.end().finally(() => process.exit(1))
})
