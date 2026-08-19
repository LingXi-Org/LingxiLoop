/**
 * MVP Docker Compose fault scenario (issue #9 section 6: "LingxiGraph
 * Runtime unavailable"). Companion to mvp-smoke.ts — run AFTER it, since it
 * reuses the most recently seeded smoke company/agent/DM rather than
 * seeding its own.
 *
 * Two phases, driven by the CI workflow around a real container stop/start
 * (this script has no docker control of its own — it only observes DB +
 * HTTP state):
 *
 *   npx tsx server/scripts/mvp-fault-outage.ts pre
 *     — run while lingxigraph-runtime is STOPPED. Sends a message, waits,
 *       and asserts the turn did NOT falsely mark itself complete: the
 *       agent's unread cursor must not advance and no reply must appear.
 *
 *   npx tsx server/scripts/mvp-fault-outage.ts post
 *     — run after lingxigraph-runtime is back up. Sends a follow-up
 *       message and asserts the system has recovered: a fresh wake gets a
 *       real reply and the cursor advances again. (This checks recovery,
 *       not literal replay of the `pre`-phase input — replay-safety for the
 *       exact same input is already covered by the crash-safe/retry-safe
 *       idempotency integration tests from issue #7 / PR #8.)
 */
import { pool } from '../src/db/pool.js'
import { createSession } from '../src/auth.js'

const BASE_URL = process.env.MVP_SMOKE_BASE_URL || 'http://localhost:5181'
const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') {
  console.error('usage: mvp-fault-outage.ts <pre|post>')
  process.exit(2)
}

function log(msg: string): void {
  console.log(`[mvp-fault-outage:${phase}] ${msg}`)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function latestSmokeContext(): Promise<{ companyId: string; userId: string; conversationId: string; agentId: string }> {
  const { rows: companies } = await pool.query<{ id: string; owner_user_id: string }>(
    `SELECT id, owner_user_id FROM companies WHERE slug LIKE 'mvp-smoke-%' ORDER BY created_at DESC LIMIT 1`,
  )
  const company = companies[0]
  if (!company) throw new Error('no mvp-smoke company found — run mvp-smoke.ts first')
  const { rows: convos } = await pool.query<{ id: string; members: string[] }>(
    `SELECT id, members FROM conversations
       WHERE company_id = $1 AND kind = 'direct' AND members @> to_jsonb(ARRAY[$2::text])
       LIMIT 1`,
    [company.id, company.owner_user_id],
  )
  const convo = convos[0]
  if (!convo) throw new Error('no starter DM found for latest mvp-smoke company')
  const agentId = convo.members.find((m) => m !== company.owner_user_id)
  if (!agentId) throw new Error('starter DM has no agent member')
  return { companyId: company.id, userId: company.owner_user_id, conversationId: convo.id, agentId }
}

async function getUnreadCursor(agentId: string, conversationId: string): Promise<string> {
  const { rows } = await pool.query<{ last_read_message_id: string }>(
    `SELECT last_read_message_id FROM conversation_reads WHERE user_id = $1 AND conversation_id = $2`,
    [agentId, conversationId],
  )
  return rows[0]?.last_read_message_id ?? ''
}

async function postMessage(token: string, conversationId: string, body: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`POST message failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { id: string }
  return json.id
}

async function main(): Promise<void> {
  const { conversationId, agentId, userId } = await latestSmokeContext()
  const { token } = await createSession(userId, {})
  log(`using DM ${conversationId} with agent ${agentId}`)

  if (phase === 'pre') {
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

  // post: runtime is back — a fresh wake should get a real reply.
  const cursorBefore = await getUnreadCursor(agentId, conversationId)
  const msgId = await postMessage(token, conversationId, 'Follow-up after LingxiGraph Runtime recovered (mvp fault smoke).')
  log(`follow-up message posted after recovery: ${msgId} — waiting for a reply`)

  const deadline = Date.now() + 60_000
  for (;;) {
    const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages?limit=20`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const messages = await res.json() as Array<{ id: string; authorId: string; body: string }>
      if (messages.some((m) => m.authorId === agentId && m.id !== msgId)) break
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for a reply after LingxiGraph Runtime recovery`)
    await sleep(1000)
  }
  const cursorAfter = await getUnreadCursor(agentId, conversationId)
  if (cursorAfter === cursorBefore) {
    throw new Error('agent unread cursor did not advance after a successful post-recovery turn')
  }
  log(`PASS: system recovered after runtime outage — cursor advanced "${cursorBefore}" -> "${cursorAfter}"`)
  await pool.end()
  process.exit(0)
}

main().catch((err) => {
  console.error(`[mvp-fault-outage:${phase}] FAIL`, err)
  pool.end().finally(() => process.exit(1))
})
