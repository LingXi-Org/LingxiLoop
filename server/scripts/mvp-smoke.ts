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
 * or, wired up as an `npm run mvp:smoke` helper that shells out to the
 * above (see package.json + README).
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
import { pool } from '../src/db/pool.js'
import { createSession } from '../src/auth.js'
import { onboardStarterAgents } from '../src/onboardCompany.js'

const BASE_URL = process.env.MVP_SMOKE_BASE_URL || 'http://localhost:5181'
const REPLY_TIMEOUT_MS = Number(process.env.MVP_SMOKE_REPLY_TIMEOUT_MS || 60_000)

function log(msg: string): void {
  console.log(`[mvp-smoke] ${msg}`)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`)
      if (res.ok) { log('API health check passed'); return }
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for /api/health')
    await sleep(1000)
  }
}

/** Mints a throwaway company + human owner + starter agent team, mirroring
 *  the fields oauth.ts sets on first login (see server/src/oauth.ts around
 *  the `INSERT INTO companies` call) — signup itself requires a real OAuth
 *  provider, which an automated smoke can't exercise. */
async function seedCompany(): Promise<{ companyId: string; userId: string; token: string }> {
  const suffix = randomUUID().slice(0, 8)
  const userId = `u-smoke-${suffix}`
  const companyId = `co-smoke-${suffix}`
  const email = `mvp-smoke-${suffix}@example.invalid`

  await pool.query(
    `INSERT INTO users (id, email, display_name, password_hash, email_verified_at, is_admin)
       VALUES ($1, $2, $3, NULL, NOW(), FALSE)`,
    [userId, email, 'MVP Smoke User'],
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [companyId, 'MVP Smoke Co', `mvp-smoke-${suffix}`, userId],
  )
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [companyId, userId],
  )
  await pool.query(
    `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id)
       VALUES ($1, 'human', 'MVP Smoke User', NULL, 'M', '#FF8870', NULL, 'avail', $2)`,
    [userId, companyId],
  )

  log(`seeded company ${companyId} / owner ${userId}`)
  await onboardStarterAgents(companyId)
  log('starter agents + DMs seeded')

  const { token } = await createSession(userId, {})
  return { companyId, userId, token }
}

async function findOwnerDm(companyId: string, userId: string): Promise<{ conversationId: string; agentId: string }> {
  const { rows } = await pool.query<{ id: string; members: string[] }>(
    `SELECT id, members FROM conversations
       WHERE company_id = $1 AND kind = 'direct' AND members @> to_jsonb(ARRAY[$2::text])
       LIMIT 1`,
    [companyId, userId],
  )
  const convo = rows[0]
  if (!convo) throw new Error('no starter DM found for smoke owner')
  const agentId = convo.members.find((m) => m !== userId)
  if (!agentId) throw new Error('starter DM has no agent member')
  return { conversationId: convo.id, agentId }
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

async function waitForAgentReply(
  token: string, conversationId: string, agentId: string, afterMessageId: string,
): Promise<{ id: string; body: string }> {
  const deadline = Date.now() + REPLY_TIMEOUT_MS
  for (;;) {
    const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages?limit=20`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const messages = await res.json() as Array<{ id: string; authorId: string; body: string }>
      const reply = messages.find((m) => m.authorId === agentId)
      if (reply) return reply
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${REPLY_TIMEOUT_MS}ms waiting for ${agentId} to reply in ${conversationId} `
        + `(human message ${afterMessageId} was sent; agent never wrote a reply — check lingxigraph-runtime `
        + `and lingxiloop logs)`,
      )
    }
    await sleep(1000)
  }
}

/**
 * Fault scenario (issue #9 section 6: "LingxiGraph 返回 invalid response").
 * Only exercised when the runtime under test is the deterministic fake
 * (server/scripts/fake-lingxigraph-runtime.mjs), which special-cases this
 * exact marker string to return a schema-invalid `/v1/turn` body. Asserts
 * the Node adapter's strict validation rejects it and the agent's unread
 * cursor does NOT advance — the same idempotency guarantee section 6 asks
 * for, just triggered by a bad response instead of a dead runtime.
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

  const { companyId, userId, token } = await seedCompany()
  const { conversationId, agentId } = await findOwnerDm(companyId, userId)
  log(`using DM ${conversationId} with agent ${agentId}`)

  const cursorBefore = await getUnreadCursor(agentId, conversationId)

  const humanMessageId = await postMessage(token, conversationId, 'Hello, agent! (mvp docker-compose smoke)')
  log(`human message posted: ${humanMessageId}`)

  const reply = await waitForAgentReply(token, conversationId, agentId, humanMessageId)
  log(`agent reply received: ${reply.id} — "${reply.body}"`)

  const cursorAfter = await getUnreadCursor(agentId, conversationId)
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
  console.error('[mvp-smoke] FAIL', err)
  pool.end().finally(() => process.exit(1))
})
