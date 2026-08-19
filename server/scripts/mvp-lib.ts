/**
 * Shared helpers for the MVP Docker Compose smoke scripts
 * (mvp-smoke.ts, mvp-fault-outage.ts). Runs INSIDE the `lingxiloop`
 * container via `tsx`, so it can share `pool` / `createSession` /
 * `onboardStarterAgents` with the API server it's calling over real HTTP.
 */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { cloudComputerId, ensureCloudComputer } from '../src/agents/computer/registry.js'
import { createSession } from '../src/auth.js'
import { pool } from '../src/db/pool.js'
import { onboardStarterAgents } from '../src/onboardCompany.js'

export const BASE_URL = process.env.MVP_SMOKE_BASE_URL || 'http://localhost:5181'

export function log(tag: string, msg: string): void {
  console.log(`[${tag}] ${msg}`)
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for /api/health')
    await sleep(1000)
  }
}

/**
 * Mints a throwaway company + human owner + starter agent team, mirroring
 * the fields oauth.ts sets on first login (see server/src/oauth.ts around
 * the `INSERT INTO companies` call) — signup itself requires a real OAuth
 * provider, which an automated smoke can't exercise.
 *
 * `slugPrefix` scopes each caller to its OWN company/DM — callers must NOT
 * share a company across scenarios. A fault scenario that force-triggers an
 * invalid/failed turn leaves that message permanently unread (by design —
 * that's the assertion), so reusing the same DM in a later scenario would
 * make every subsequent wake replay the same stuck failure instead of
 * testing anything new.
 */
export async function seedCompany(slugPrefix: string): Promise<{ companyId: string; userId: string; token: string }> {
  const suffix = randomUUID().slice(0, 8)
  const userId = `u-${slugPrefix}-${suffix}`
  const companyId = `co-${slugPrefix}-${suffix}`
  const email = `${slugPrefix}-${suffix}@example.invalid`

  // tier='pro': companyTier() (server/src/tier.ts) resolves a company's
  // tier from its owner's users.tier, defaulting to 'free'. The scheduler
  // treats free-tier agents as BYOA-only and defers their wake until a
  // computer is paired (server/src/agents/scheduler.ts: "free-tier
  // (BYOA-only); no managed pod — wake deferred"), which would make this
  // smoke hang forever waiting for a reply that never comes. Mirror what a
  // real paid signup gets (see oauth.ts's post-commit onboarding) so the
  // seeded agents actually run through the server-side managed executor.
  await pool.query(
    `INSERT INTO users (id, email, display_name, password_hash, email_verified_at, is_admin, tier)
       VALUES ($1, $2, $3, NULL, NOW(), FALSE, 'pro')`,
    [userId, email, 'MVP Smoke User'],
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [companyId, 'MVP Smoke Co', `${slugPrefix}-${suffix}`, userId],
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

  await ensureCloudComputer(companyId)
  await onboardStarterAgents(companyId, { computerId: cloudComputerId(companyId), engine: 'managed' })

  const { token } = await createSession(userId, {})
  return { companyId, userId, token }
}

/** Finds the most recently seeded company for a given `seedCompany` prefix —
 *  used by a second phase of a multi-step scenario (e.g. mvp-fault-outage.ts's
 *  `post` run) to pick up the company/DM its own `pre` run just seeded. */
export async function latestCompanyForPrefix(slugPrefix: string): Promise<{ companyId: string; userId: string }> {
  const { rows } = await pool.query<{ id: string; owner_user_id: string }>(
    `SELECT id, owner_user_id FROM companies WHERE slug LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`${slugPrefix}-%`],
  )
  const company = rows[0]
  if (!company) throw new Error(`no company found for slug prefix "${slugPrefix}-"`)
  return { companyId: company.id, userId: company.owner_user_id }
}

export async function findOwnerDm(companyId: string, userId: string): Promise<{ conversationId: string; agentId: string }> {
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

export async function getUnreadCursor(agentId: string, conversationId: string): Promise<string> {
  const { rows } = await pool.query<{ last_read_message_id: string }>(
    `SELECT last_read_message_id FROM conversation_reads WHERE user_id = $1 AND conversation_id = $2`,
    [agentId, conversationId],
  )
  return rows[0]?.last_read_message_id ?? ''
}

/**
 * markConversationRead() (server/src/agents/runtime/inproc-client.ts) runs
 * AFTER the turn's message.send action has already committed — so the
 * instant a caller observes the agent's reply over HTTP (e.g. via
 * waitForAgentReply), the cursor write can still be a beat behind. Poll
 * instead of reading once to avoid flaking on that race.
 */
export async function waitForCursorAdvance(
  agentId: string, conversationId: string, notEqualTo: string, timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const cursor = await getUnreadCursor(agentId, conversationId)
    if (cursor !== notEqualTo) return cursor
    if (Date.now() > deadline) return cursor
    await sleep(250)
  }
}

export async function postMessage(token: string, conversationId: string, body: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`POST message failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { id: string }
  return json.id
}

export interface MessageBroadcast {
  type: 'message.new'
  conversationId: string
  message: MessageRow & { conversationId: string }
}

/** Open a real authenticated client WebSocket before performing `trigger`,
 * then resolve only when that client observes the expected message.new. */
export async function triggerAndWaitForMessageBroadcast(
  token: string,
  expected: { conversationId: string; authorId: string },
  trigger: () => Promise<void>,
  timeoutMs = 60_000,
): Promise<MessageBroadcast> {
  const ticketRes = await fetch(`${BASE_URL}/api/auth/ws-ticket`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  })
  if (!ticketRes.ok) throw new Error(`WS ticket failed: ${ticketRes.status} ${await ticketRes.text()}`)
  const { ticket } = await ticketRes.json() as { ticket: string }
  const wsUrl = new URL(BASE_URL)
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  wsUrl.pathname = '/ws'
  wsUrl.search = `?t=${encodeURIComponent(ticket)}`

  const ws = new WebSocket(wsUrl)
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out opening MVP smoke WebSocket')), 10_000)
      ws.once('open', () => { clearTimeout(timer); resolve() })
      ws.once('error', (error) => { clearTimeout(timer); reject(error) })
    })
    const observed = new Promise<MessageBroadcast>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        `timed out waiting for WS message.new from ${expected.authorId} in ${expected.conversationId}`,
      )), timeoutMs)
      ws.on('message', (raw) => {
        try {
          const event = JSON.parse(raw.toString()) as MessageBroadcast
          if (event.type !== 'message.new') return
          if (event.conversationId !== expected.conversationId || event.message?.authorId !== expected.authorId) return
          clearTimeout(timer)
          resolve(event)
        } catch { /* hello / unrelated payload */ }
      })
    })
    await trigger()
    return await observed
  } finally {
    ws.close()
  }
}

export interface MessageRow { id: string; authorId: string; body: string }

export async function listMessages(token: string, conversationId: string): Promise<MessageRow[]> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages?limit=20`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json() as Promise<MessageRow[]>
}

export async function waitForAgentReply(
  token: string, conversationId: string, agentId: string, timeoutMs: number, excludeMessageId?: string,
): Promise<MessageRow> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const messages = await listMessages(token, conversationId)
    const reply = messages.find((m) => {
      if (m.authorId !== agentId || m.id === excludeMessageId) return false
      // A failed turn emits an agent-authored lifecycle notice into the DM.
      // It is observable state, not a successful model reply.
      return !m.body.includes('"noticeKind":"agent_turn_failed"')
    })
    if (reply) return reply
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${agentId} to reply in ${conversationId}`)
    }
    await sleep(1000)
  }
}
