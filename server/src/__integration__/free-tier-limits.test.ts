/**
 * Integration tests for free-tier structural limits.
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import {
  buildApiTestApp, ensureSchemaOnce, resetAllTables, teardownAll,
} from './_helpers.js'
import { pool } from '../db/pool.js'

const FREE_USER_ID = 'u-free-limit'
let server: Server
let baseUrl = ''

before(async () => {
  await ensureSchemaOnce()
  const app = await buildApiTestApp(FREE_USER_ID)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  await teardownAll(server)
})

async function seedUser(userId: string, tier: 'free' | 'pro' | 'max' = 'free'): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, display_name, tier)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET tier = EXCLUDED.tier`,
    [userId, `${userId}@test.local`, userId, tier],
  )
}

async function seedCompanyWithOwner(companyId: string, ownerId: string, tier: 'free' | 'pro' | 'max' = 'free'): Promise<void> {
  await seedUser(ownerId, tier)
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id)
     VALUES ($1, $2, $3, $4)`,
    [companyId, `Company ${companyId}`, companyId, ownerId],
  )
  await seedHumanMember(companyId, ownerId, 'owner', tier)
}

async function seedHumanMember(
  companyId: string,
  userId: string,
  role = 'member',
  tier: 'free' | 'pro' | 'max' = 'free',
): Promise<void> {
  await seedUser(userId, tier)
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role)
     VALUES ($1, $2, $3)`,
    [companyId, userId, role],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'human', $3, NULL, $4, '#abcdef', 'avail')`,
    [userId, companyId, userId, userId.slice(0, 1).toUpperCase()],
  )
}

async function seedActiveAgents(companyId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status, system_prompt)
       VALUES ($1, $2, 'agent', $3, 'agent', $4, '#abcdef', 'avail', 'test agent prompt')`,
      [`agent-${i}`, companyId, `Agent ${i}`, 'A'],
    )
  }
}

async function seedInvitation(companyId: string, invitedBy: string): Promise<string> {
  const token = `invite-${companyId}`
  const tokenHash = createHash('sha256').update(token).digest('base64url')
  await pool.query(
    `INSERT INTO company_invitations
       (token_hash, company_id, invited_by, email, role, note, max_uses, expires_at)
     VALUES ($1, $2, $3, NULL, 'member', NULL, 1, NOW() + INTERVAL '1 day')`,
    [tokenHash, companyId, invitedBy],
  )
  return token
}

test('[integration] free users cannot create a fourth company', async () => {
  for (let i = 0; i < 3; i++) {
    await seedCompanyWithOwner(`co-existing-${i}`, FREE_USER_ID)
  }

  const res = await fetch(`${baseUrl}/api/companies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Fourth Company' }),
  })
  const body = await res.json() as { error?: string }

  assert.equal(res.status, 403)
  assert.match(body.error ?? '', /at most 3 companies/)
})

test('[integration] free users cannot accept an invite into a fourth company', async () => {
  for (let i = 0; i < 3; i++) {
    await seedCompanyWithOwner(`co-member-${i}`, FREE_USER_ID)
  }
  await seedCompanyWithOwner('co-target', 'u-target-owner', 'pro')
  const token = await seedInvitation('co-target', 'u-target-owner')

  const res = await fetch(`${baseUrl}/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  })
  const body = await res.json() as { error?: string }

  assert.equal(res.status, 403)
  assert.match(body.error ?? '', /at most 3 companies/)
})

test('[integration] free workspaces cannot create an eleventh active agent', async () => {
  await seedCompanyWithOwner('co-agent-limit', FREE_USER_ID)
  await seedActiveAgents('co-agent-limit', 10)

  const res = await fetch(`${baseUrl}/api/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': 'co-agent-limit' },
    body: JSON.stringify({
      id: 'eleventh-agent',
      name: 'Eleventh Agent',
      role: 'Agent',
      systemPrompt: 'A test agent prompt long enough.',
    }),
  })
  const body = await res.json() as { error?: string }

  assert.equal(res.status, 403)
  assert.match(body.error ?? '', /at most 10 active agents/)
})

test('[integration] free workspaces cannot accept a sixth human member', async () => {
  await seedUser(FREE_USER_ID)
  await seedCompanyWithOwner('co-human-limit', 'u-human-owner')
  await seedHumanMember('co-human-limit', 'u-human-two')
  await seedHumanMember('co-human-limit', 'u-human-three')
  await seedHumanMember('co-human-limit', 'u-human-four')
  await seedHumanMember('co-human-limit', 'u-human-five')
  const token = await seedInvitation('co-human-limit', 'u-human-owner')

  const res = await fetch(`${baseUrl}/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  })
  const body = await res.json() as { error?: string }

  assert.equal(res.status, 403)
  assert.match(body.error ?? '', /at most 5 human members/)
})
