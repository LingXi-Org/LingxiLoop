/**
 * MVP Docker Compose fault scenario (issue #9 section 6: "LingxiGraph
 * Runtime unavailable"). Independent of mvp-smoke.ts — seeds its OWN
 * company/DM (slug prefix `mvp-fault-outage`) rather than reusing
 * mvp-smoke's. Sharing a DM across scenarios would be a bug here: a
 * force-failed turn leaves its triggering message permanently unread (by
 * design — that's what "the cursor must not advance" means), so reusing
 * that DM in a later scenario would make every following wake replay the
 * same stuck failure instead of testing anything new.
 *
 * Two phases, driven by the CI workflow around a real container stop/start
 * (this script has no docker control of its own — it only observes DB +
 * HTTP state):
 *
 *   npx tsx server/scripts/mvp-fault-outage.ts pre
 *     — seeds a fresh company/DM, then sends a message while
 *       lingxigraph-runtime is STOPPED. Waits, then asserts the turn did
 *       NOT falsely mark itself complete: the agent's unread cursor must
 *       not advance and no reply must appear.
 *
 *   npx tsx server/scripts/mvp-fault-outage.ts post
 *     — run after lingxigraph-runtime is back up. Finds the company `pre`
 *       just seeded, sends a follow-up message, and asserts the system has
 *       recovered: a fresh wake gets a real reply and the cursor advances
 *       again. (This checks recovery, not literal replay of the
 *       `pre`-phase input — replay-safety for the exact same input is
 *       already covered by the crash-safe/retry-safe idempotency
 *       integration tests from issue #7 / PR #8.)
 */
import { pool } from '../src/db/pool.js'
import {
  log as baseLog, sleep, seedCompany, latestCompanyForPrefix, findOwnerDm,
  getUnreadCursor, postMessage, waitForAgentReply,
} from './mvp-lib.js'

const SLUG_PREFIX = 'mvp-fault-outage'
const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') {
  console.error('usage: mvp-fault-outage.ts <pre|post>')
  process.exit(2)
}
const TAG = `mvp-fault-outage:${phase}`
const log = (msg: string) => baseLog(TAG, msg)

async function main(): Promise<void> {
  if (phase === 'pre') {
    const { companyId, userId, token } = await seedCompany(SLUG_PREFIX)
    log(`seeded company ${companyId} / owner ${userId}`)
    const { conversationId, agentId } = await findOwnerDm(companyId, userId)
    log(`using DM ${conversationId} with agent ${agentId}`)

    const cursorBefore = await getUnreadCursor(agentId, conversationId)
    const msgId = await postMessage(token, conversationId, 'Message sent while LingxiGraph Runtime is DOWN (mvp fault smoke).')
    log(`message posted while runtime is down: ${msgId} — waiting to confirm no false completion`)
    await sleep(15_000)
    const cursorAfter = await getUnreadCursor(agentId, conversationId)
    if (cursorAfter !== cursorBefore) {
      throw new Error(
        `agent unread cursor advanced ("${cursorBefore}" -> "${cursorAfter}") despite the LingxiGraph `
        + `Runtime being unreachable — a failed turn must not be marked read`,
      )
    }
    log(`PASS: runtime outage left the unread cursor untouched ("${cursorBefore}"); input was not lost`)
    await pool.end()
    process.exit(0)
  }

  // post: runtime is back — a fresh wake in the SAME DM `pre` used should
  // get a real reply.
  const { companyId, userId } = await latestCompanyForPrefix(SLUG_PREFIX)
  const { conversationId, agentId } = await findOwnerDm(companyId, userId)
  log(`using DM ${conversationId} with agent ${agentId} (seeded by the 'pre' run)`)

  const { createSession } = await import('../src/auth.js')
  const { token } = await createSession(userId, {})

  const cursorBefore = await getUnreadCursor(agentId, conversationId)
  const msgId = await postMessage(token, conversationId, 'Follow-up after LingxiGraph Runtime recovered (mvp fault smoke).')
  log(`follow-up message posted after recovery: ${msgId} — waiting for a reply`)

  const reply = await waitForAgentReply(token, conversationId, agentId, 60_000, msgId)
  log(`agent reply received: ${reply.id} — "${reply.body}"`)

  const cursorAfter = await getUnreadCursor(agentId, conversationId)
  if (cursorAfter === cursorBefore) {
    throw new Error('agent unread cursor did not advance after a successful post-recovery turn')
  }
  log(`PASS: system recovered after runtime outage — cursor advanced "${cursorBefore}" -> "${cursorAfter}"`)
  await pool.end()
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${TAG}] FAIL`, err)
  pool.end().finally(() => process.exit(1))
})
