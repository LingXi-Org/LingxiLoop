/**
 * Shared helpers for the MVP Docker Compose smoke scripts
 * (mvp-smoke.ts, mvp-fault-outage.ts). Runs INSIDE the `lingxiloop`
 * container via `tsx`, so it can share `pool` / `createSession` /
 * `onboardStarterAgents` with the API server it's calling over real HTTP.
 */
import { randomUUID } from 'node:crypto'
import { pool } from '../src/db/pool.js'
import { createSession } from '../src/auth.js'
import { onboardStarterAgents } from '../src/onboardCompany.js'
import { cloudComputerId, ensureCloudComputer } from '../src/agents/computer/registry.js'

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
    const reply = messages.find((m) => m.authorId === agentId && m.id !== excludeMessageId)
    if (reply) return reply
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${agentId} to reply in ${conversationId}`)
    }
    await sleep(1000)
  }
}
