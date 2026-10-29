import assert from 'node:assert/strict'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import express from 'express'
import { api } from '../api/router.js'
import { env } from '../env.js'
import type { GatewayAssertion } from '../auth.js'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { hashInvitationToken } from '../http/invitation-token.js'
import { seedEducationWorkspace } from './_helpers.js'
import { ensureEducationPlan } from '../modules/entitlements/public.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const INVITER_ID = 'u-registration-inviter'
const TOKEN = 'registration-invite-token'
let companyId = ''
let server: Server
let baseUrl = ''

function signedHeaders(url: string, init: RequestInit, overrides: Partial<GatewayAssertion> = {}) {
  const path = new URL(url).pathname
  const body = JSON.parse(String(init.body)) as { authUserId?: string }
  const assertion: GatewayAssertion = {
    appUserId: null, authUserId: body.authUserId ?? null, method: 'POST', path,
    timestamp: Date.now(), nonce: randomUUID(),
    service: { audience: 'registration',
      capability: path.endsWith('/provision') ? 'registration-provision' : 'registration-invitation',
      emailVerified: true, bodyHash: createHash('sha256').update(String(init.body)).digest('base64url') },
    ...overrides,
  }
  const payload = Buffer.from(JSON.stringify(assertion)).toString('base64url')
  return { 'content-type': 'application/json', 'x-registration-request-id': 'synthetic-registration-request', 'x-lingxiloop-gateway': `${payload}.${createHmac('sha256', env.GATEWAY_HMAC_SECRET).update(payload).digest('base64url')}` }
}

function registrationFetch(url: string, init: RequestInit) {
  return fetch(url, { ...init, headers: signedHeaders(url, init) })
}

before(async () => {
  await ensureSchemaOnce()
  const app = express()
  app.use(express.json())
  app.use('/api', api)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const address = server.address()
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
  companyId = await withTransaction(pool, async (db) => {
    await db.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,'owner@example.com','Owner',NOW())`, [INVITER_ID])
    return (await seedEducationWorkspace(db, INVITER_ID)).companyId
  })
  await pool.query(`INSERT INTO company_invitations(token_hash,company_id,invited_by,email,role,max_uses,expires_at) VALUES($1,$2,$3,'new@example.com','TEACHER',1,NOW()+INTERVAL '1 day')`, [hashInvitationToken(TOKEN), companyId, INVITER_ID])
})

after(async () => teardownAll(server))

test('[integration] registration rejects ordinary assertions, mismatched subjects, expired signatures and replay', async () => {
  const url = `${baseUrl}/api/internal/registration/provision`
  const init = { method: 'POST', body: JSON.stringify({ authUserId: 'verified-user', email: 'new@example.com', name: 'Verified', inviteToken: TOKEN, inviteKind: 'company' }) }
  for (const overrides of [
    { service: undefined, appUserId: INVITER_ID }, { authUserId: 'different-user' },
    { timestamp: Date.now() - 31_000 }, { method: 'GET' },
    { path: '/api/internal/registration/invitation' },
  ]) {
    const response = await fetch(url, { ...init, headers: signedHeaders(url, init, overrides) })
    assert.ok([401, 403].includes(response.status), String(response.status))
  }
  const headers = signedHeaders(url, init)
  assert.equal((await fetch(url, { ...init, headers })).status, 200)
  assert.equal((await fetch(url, { ...init, headers })).status, 401)
})

test('[integration] invitation validation and provision are transactional and idempotent', async () => {
  const validation = await registrationFetch(`${baseUrl}/api/internal/registration/invitation`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.com', inviteToken: TOKEN, inviteKind: 'company' }),
  })
  assert.equal(validation.status, 200)

  const body = JSON.stringify({ authUserId: 'auth-1', email: 'new@example.com', name: 'New User', inviteToken: TOKEN, inviteKind: 'company' })
  const first = await registrationFetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  const second = await registrationFetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('x-registration-request-id'), 'synthetic-registration-request')
  assert.equal(second.status, 200)
  const one = await first.json() as { appUserId: string }
  const two = await second.json() as { appUserId: string }
  assert.deepEqual(two, one)
  const state = await pool.query<{ invited: number; use_count: number }>(`SELECT
    (SELECT COUNT(*)::int FROM company_memberships WHERE company_id=$2 AND user_id=$1 AND status='ACTIVE') AS invited,
    (SELECT use_count FROM company_invitations WHERE token_hash=$3) AS use_count`, [one.appUserId, companyId, hashInvitationToken(TOKEN)])
  assert.deepEqual(state.rows[0], { invited: 1, use_count: 1 })
})

test('[integration] registration without an invitation cannot create business state', async () => {
  const response = await registrationFetch(`${baseUrl}/api/internal/registration/provision`, {
    method: 'POST', body: JSON.stringify({ authUserId: 'uninvited', email: 'uninvited@example.com', name: 'Uninvited' }),
  })
  assert.equal(response.status,403)
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE email='uninvited@example.com'`)).rowCount,0)
})

test('[integration] project invitation is redeemed during provisioning', async () => {
  const projectToken = 'registration-project-invite'
  await ensureEducationPlan(pool)
  await pool.query(`INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by) VALUES('project-registration',$1,'TEACHING','plan-education','Registration Course','ACTIVE',$2)`, [companyId, INVITER_ID])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('course-registration',$1,'project-registration',$2)`, [companyId, INVITER_ID])
  await pool.query(`INSERT INTO project_invitations(token_hash,project_id,company_id,invited_by,email,max_uses,expires_at) VALUES($1,'project-registration',$2,$3,'student@example.com',1,NOW()+INTERVAL '1 day')`, [hashInvitationToken(projectToken), companyId, INVITER_ID])

  const response = await registrationFetch(`${baseUrl}/api/internal/registration/provision`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authUserId: 'auth-student', email: 'student@example.com', name: 'Student', inviteToken: projectToken, inviteKind: 'project' }),
  })
  assert.equal(response.status, 200)
  const { appUserId } = await response.json() as { appUserId: string }
  const state = await pool.query<{ membership: number; use_count: number }>(`SELECT
    (SELECT COUNT(*)::int FROM project_memberships WHERE project_id='project-registration' AND user_id=$1 AND role='STUDENT' AND status='ACTIVE') AS membership,
    (SELECT use_count FROM project_invitations WHERE token_hash=$2) AS use_count`, [appUserId, hashInvitationToken(projectToken)])
  assert.deepEqual(state.rows[0], { membership: 1, use_count: 1 })
})

test('[integration] named company invitation recovers its receipt after expiry but rejects another identity', async () => {
  const provision = (email: string) => registrationFetch(`${baseUrl}/api/internal/registration/provision`, {
    method: 'POST', body: JSON.stringify({ authUserId: `auth-${email}`, email, name: 'Synthetic Teacher', inviteToken: TOKEN, inviteKind: 'company' }),
  })
  const first = await provision('new@example.com')
  assert.equal(first.status, 200)
  const original = await first.json()
  assert.equal((await provision('different@example.com')).status, 403)
  await pool.query(`UPDATE company_invitations SET revoked_at=NOW(),expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1`, [hashInvitationToken(TOKEN)])
  const recovered = await provision('new@example.com')
  assert.equal(recovered.status, 200)
  assert.deepEqual(await recovered.json(), original)
  assert.equal((await pool.query(`SELECT use_count FROM company_invitations WHERE token_hash=$1`, [hashInvitationToken(TOKEN)])).rows[0].use_count, 1)
  const denied = await provision('unaccepted@example.com')
  assert.equal(denied.status, 403)
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE email='unaccepted@example.com'`)).rowCount, 0)
})

test('[integration] concurrent business retries commit one user, membership and invitation receipt', async () => {
  const body = JSON.stringify({ authUserId: 'auth-race', email: 'new@example.com', name: 'Synthetic', inviteToken: TOKEN, inviteKind: 'company' })
  const results = await Promise.all(Array.from({ length: 3 }, () => registrationFetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', body })))
  assert.deepEqual(results.map(response => response.status), [200, 200, 200])
  const receipts = await Promise.all(results.map(response => response.json()))
  assert.deepEqual(receipts[0], receipts[1]); assert.deepEqual(receipts[0], receipts[2])
  const state = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM users WHERE email='new@example.com') AS users,
    (SELECT COUNT(*)::int FROM company_memberships m JOIN users u ON u.id=m.user_id WHERE u.email='new@example.com') AS memberships,
    (SELECT use_count FROM company_invitations WHERE token_hash=$1) AS uses`, [hashInvitationToken(TOKEN)])
  assert.deepEqual(state.rows[0], { users: 1, memberships: 1, uses: 1 })
})
