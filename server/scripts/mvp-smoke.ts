/**
 * MVP Docker Compose smoke test (issue #9, section 4 + part of section 6).
 *
 * Exercises the real, running stack end to end:
 *
 *   Human sends message
 *     -> message persisted
 *     -> Redis publish wakes the scheduler
 *     -> managed (server-side) executor runs the agent turn
 *     -> LingxiGraph Runtime is called over real HTTP (/v1/turn)
 *     -> message.send action executes
 *     -> reply persisted, agent's unread cursor advances
 *
 * Runs INSIDE the `lingxiloop` container (same process image as the API
 * server, so it shares `tsx` + `pg` + the compiled app modules) via:
 *
 *   docker compose -f docker-compose.mvp.yml exec lingxiloop \
 *     npx tsx server/scripts/mvp-smoke.ts
 *
 * or `npm run mvp:smoke`, which shells out to the above (see README).
 *
 * It talks to the API over real HTTP (http://localhost:$PORT by default —
 * override with MVP_SMOKE_BASE_URL) exactly like a browser client would,
 * and only reaches into Postgres directly to (a) seed a throwaway
 * company/user — signup here requires OAuth, which has no place in an
 * automated smoke — and (b) assert the agent's unread cursor advanced,
 * which isn't exposed over HTTP.
 *
 * Exit code 0 on success, 1 on any assertion / timeout failure.
 */
import { randomUUID } from 'node:crypto'
import { runCli } from '../src/agents/cli.js'
import { pool } from '../src/db/pool.js'
import { CH_MESSAGE_NEW, publish } from '../src/redis.js'
import {
  log as baseLog,
  findOwnerDm,
  getUnreadCursor,
  postMessage,
  seedCompany,
  sleep,
  triggerAndWaitForMessageBroadcast,
  waitForAgentReply,
  waitForCursorAdvance,
  waitForHealth,
} from './mvp-lib.js'

const TAG = 'mvp-smoke'
const log = (msg: string) => baseLog(TAG, msg)
const REPLY_TIMEOUT_MS = Number(process.env.MVP_SMOKE_REPLY_TIMEOUT_MS || 60_000)

/** Diagnostic-only: dumps the agent's recent agent_runs/agent_events rows
 *  to CI logs when an assertion fails, so a failure is debuggable from the
 *  workflow log alone instead of needing a live repro. */
async function dumpAgentRunDiagnostics(agentId: string): Promise<void> {
  try {
    const { rows: runs } = await pool.query(
      `SELECT id, status, stage, error, input_message_ids, inbox_count, started_at, finished_at
         FROM agent_runs WHERE agent_id = $1 ORDER BY started_at DESC LIMIT 3`,
      [agentId],
    )
    log(`diagnostics: recent agent_runs for ${agentId}: ${JSON.stringify(runs)}`)
    for (const run of runs as Array<{ id: string }>) {
      const { rows: events } = await pool.query(
        `SELECT kind, level, title, data, created_at FROM agent_events WHERE run_id = $1 ORDER BY created_at ASC`,
        [run.id],
      )
      log(`diagnostics: agent_events for run ${run.id}: ${JSON.stringify(events)}`)
    }
  } catch (err) {
    log(`diagnostics: failed to dump agent_runs/agent_events: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Fault scenario (issue #9 section 6: "LingxiGraph 返回 invalid response").
 * In CI the deterministic provider special-cases this marker with invalid
 * structured output. The real Python Runtime rejects it (after bounded
 * structured retries), and the Node turn must leave the unread cursor
 * untouched. Adapter-level malformed `/v1/turn` validation remains pinned
 * by agents-lingxigraph-adapter.test.ts.
 *
 * Runs in the SAME DM the happy path just used, after the happy path's own
 * message has already been read — that's fine, this message is the last
 * thing sent in this DM by this script, so it being permanently stuck
 * unread (by design — that's the assertion) doesn't affect anything else.
 */
async function runInvalidResponseFaultCheck(
  token: string, conversationId: string, agentId: string,
): Promise<void> {
  const cursorBefore = await getUnreadCursor(agentId, conversationId)
  const msgId = await postMessage(
    token, conversationId,
    'This message forces an invalid runtime response: __SMOKE_FORCE_INVALID_RESPONSE__',
  )
  log(`fault-scenario message posted: ${msgId} — waiting for the (failed) wake to settle`)
  // No successful reply is expected here, so there's nothing to poll for —
  // just give the scheduler + failed turn time to run and settle.
  await sleep(15_000)

  const cursorAfter = await getUnreadCursor(agentId, conversationId)
  if (cursorAfter !== cursorBefore) {
    throw new Error(
      `agent unread cursor advanced ("${cursorBefore}" -> "${cursorAfter}") despite an invalid `
      + `LingxiGraph/provider failure — unread-cursor regression`,
    )
  }
  log(`PASS: invalid LingxiGraph response left the unread cursor untouched ("${cursorBefore}")`)
}

async function runAgentToAgentCheck(companyId: string): Promise<void> {
  const { rows: agents } = await pool.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id = $1 AND kind = 'agent' ORDER BY id LIMIT 2`,
    [companyId],
  )
  if (agents.length < 2) throw new Error('starter team did not contain two agents for Agent -> Agent E2E')
  const [agentA, agentB] = agents.map((row) => row.id)
  const conversationId = `mvp-agent-dm-${randomUUID()}`
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
     VALUES ($1, 'direct', 'MVP Agent E2E', $2::jsonb, 'agent', $3)`,
    [conversationId, JSON.stringify([agentA, agentB]), companyId],
  )

  const sent = await runCli(['--as', agentA, 'reply', conversationId, 'Agent A asks Agent B for one deterministic reply.'])
  if (!sent.ok) throw new Error(`Agent A message.send failed: ${sent.text}`)
  const { rows: sourceRows } = await pool.query<{
    id: string; body: string; sequence: number; created_at: Date
  }>(
    `SELECT id, body, sequence, created_at FROM messages
       WHERE conversation_id = $1 AND author_id = $2 ORDER BY sequence DESC LIMIT 1`,
    [conversationId, agentA],
  )
  const source = sourceRows[0]
  if (!source) throw new Error('Agent A source message was not persisted')

  const deadline = Date.now() + REPLY_TIMEOUT_MS
  let replyCount = 0
  for (;;) {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND author_id = $2`,
      [conversationId, agentB],
    )
    replyCount = Number(rows[0]?.count ?? 0)
    if (replyCount > 0) break
    if (Date.now() > deadline) throw new Error('timed out waiting for Agent B managed-executor reply')
    await sleep(500)
  }

  // Replay the exact durable wake event. The cursor/fingerprint plus #7 sink
  // idempotency must prevent a second side effect.
  await publish(CH_MESSAGE_NEW, {
    type: 'message.new', companyId, conversationId,
    message: {
      id: source.id, conversationId, authorId: agentA, kind: 'text', body: source.body,
      sequence: source.sequence, at: source.created_at.toISOString(),
    },
  })
  await sleep(3_000)
  const { rows: finalCounts } = await pool.query<{ author_id: string; count: string }>(
    `SELECT author_id, COUNT(*)::text AS count FROM messages
       WHERE conversation_id = $1 GROUP BY author_id`,
    [conversationId],
  )
  const counts = new Map(finalCounts.map((row) => [row.author_id, Number(row.count)]))
  if (counts.get(agentB) !== 1) throw new Error(`duplicate Agent B replies after wake replay: ${counts.get(agentB) ?? 0}`)
  if (counts.get(agentA) !== 1) throw new Error(`Agent reply cascade detected: Agent A posted ${counts.get(agentA) ?? 0} messages`)
  log(`PASS: Agent -> Agent managed E2E completed once (${agentA} -> ${agentB}); replay/cascade produced no duplicate`)
}

async function main(): Promise<void> {
  await waitForHealth()
  log('API health check passed')

  const { companyId, conversationId, agentId, token } = await (async () => {
    const { companyId, userId, token } = await seedCompany('mvp-smoke')
    log(`seeded company ${companyId} / owner ${userId}`)
    const dm = await findOwnerDm(companyId, userId)
    log(`using DM ${dm.conversationId} with agent ${dm.agentId}`)
    return { companyId, ...dm, token }
  })()

  const cursorBefore = await getUnreadCursor(agentId, conversationId)

  let humanMessageId = ''
  const wsReply = await triggerAndWaitForMessageBroadcast(
    token,
    { conversationId, authorId: agentId },
    async () => {
      humanMessageId = await postMessage(token, conversationId, 'Hello, agent! (mvp docker-compose smoke)')
      log(`human message posted: ${humanMessageId}`)
    },
    REPLY_TIMEOUT_MS,
  )
  log(`WebSocket observed agent reply broadcast: ${wsReply.message.id}`)

  const reply = await waitForAgentReply(token, conversationId, agentId, REPLY_TIMEOUT_MS)
  log(`agent reply received: ${reply.id} — "${reply.body}"`)

  // markConversationRead() runs AFTER message.send commits, so the cursor
  // write can trail the reply becoming visible by a beat — poll instead of
  // a single point-in-time read.
  const cursorAfter = await waitForCursorAdvance(agentId, conversationId, cursorBefore)
  if (cursorAfter === cursorBefore) {
    await dumpAgentRunDiagnostics(agentId)
    throw new Error(`agent unread cursor did not advance (still "${cursorBefore}") despite a completed turn`)
  }
  log(`agent unread cursor advanced: "${cursorBefore}" -> "${cursorAfter}"`)
  log('PASS: Human -> Agent -> LingxiGraph -> message.send -> observable reply, full loop verified')

  await runAgentToAgentCheck(companyId)

  if (process.env.MVP_SMOKE_SKIP_FAULT_CHECK !== '1') {
    await runInvalidResponseFaultCheck(token, conversationId, agentId)
  }

  await pool.end()
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${TAG}] FAIL`, err)
  pool.end().finally(() => process.exit(1))
})
