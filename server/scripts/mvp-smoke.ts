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
import { pool } from '../src/db/pool.js'
import {
  log as baseLog, sleep, waitForHealth, seedCompany, findOwnerDm,
  getUnreadCursor, waitForCursorAdvance, postMessage, waitForAgentReply,
} from './mvp-lib.js'

const TAG = 'mvp-smoke'
const log = (msg: string) => baseLog(TAG, msg)
const REPLY_TIMEOUT_MS = Number(process.env.MVP_SMOKE_REPLY_TIMEOUT_MS || 60_000)

/**
 * Fault scenario (issue #9 section 6: "LingxiGraph 返回 invalid response").
 * Only exercised when the runtime under test is the deterministic fake
 * (server/scripts/fake-lingxigraph-runtime.mjs), which special-cases this
 * exact marker string to return a schema-invalid `/v1/turn` body. Asserts
 * the Node adapter's strict validation rejects it and the agent's unread
 * cursor does NOT advance.
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
      + `LingxiGraph response — strict validation / unread-cursor regression`,
    )
  }
  log(`PASS: invalid LingxiGraph response left the unread cursor untouched ("${cursorBefore}")`)
}

async function main(): Promise<void> {
  await waitForHealth()
  log('API health check passed')

  const { conversationId, agentId, token } = await (async () => {
    const { companyId, userId, token } = await seedCompany('mvp-smoke')
    log(`seeded company ${companyId} / owner ${userId}`)
    const dm = await findOwnerDm(companyId, userId)
    log(`using DM ${dm.conversationId} with agent ${dm.agentId}`)
    return { ...dm, token }
  })()

  const cursorBefore = await getUnreadCursor(agentId, conversationId)

  const humanMessageId = await postMessage(token, conversationId, 'Hello, agent! (mvp docker-compose smoke)')
  log(`human message posted: ${humanMessageId}`)

  const reply = await waitForAgentReply(token, conversationId, agentId, REPLY_TIMEOUT_MS)
  log(`agent reply received: ${reply.id} — "${reply.body}"`)

  // markConversationRead() runs AFTER message.send commits, so the cursor
  // write can trail the reply becoming visible by a beat — poll instead of
  // a single point-in-time read.
  const cursorAfter = await waitForCursorAdvance(agentId, conversationId, cursorBefore)
  if (cursorAfter === cursorBefore) {
    throw new Error(`agent unread cursor did not advance (still "${cursorBefore}") despite a completed turn`)
  }
  log(`agent unread cursor advanced: "${cursorBefore}" -> "${cursorAfter}"`)
  log('PASS: Human -> Agent -> LingxiGraph -> message.send -> observable reply, full loop verified')

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
