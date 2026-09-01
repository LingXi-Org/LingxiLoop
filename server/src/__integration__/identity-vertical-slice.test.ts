import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { hashInvitationToken } from '../http/invitation-token.js'
import { provisionPersonalWorkspace } from '../modules/companies/public.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const INVITER_ID = 'u-registration-inviter'
const TOKEN = 'registration-invite-token'
let companyId = ''
let server: Server
let baseUrl = ''

before(async () => {
  await ensureSchemaOnce()
  const app = await buildApiTestApp(INVITER_ID)
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
    return (await provisionPersonalWorkspace(db, INVITER_ID)).companyId
  })
  await pool.query(`INSERT INTO company_invitations(token_hash,company_id,invited_by,email,role,max_uses,expires_at) VALUES($1,$2,$3,'new@example.com','MEMBER',1,NOW()+INTERVAL '1 day')`, [hashInvitationToken(TOKEN), companyId, INVITER_ID])
})

after(async () => teardownAll(server))

test('[integration] invitation validation and provision are transactional and idempotent', async () => {
  const validation = await fetch(`${baseUrl}/api/internal/registration/invitation`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.com', inviteToken: TOKEN, inviteKind: 'company' }),
  })
  assert.equal(validation.status, 200)

  const body = JSON.stringify({ authUserId: 'auth-1', email: 'new@example.com', name: 'New User', inviteToken: TOKEN, inviteKind: 'company' })
  const first = await fetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  const second = await fetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const one = await first.json() as { appUserId: string }
  const two = await second.json() as { appUserId: string }
  assert.deepEqual(two, one)
  const state = await pool.query<{ personal: number; invited: number; use_count: number }>(`SELECT
    (SELECT COUNT(*)::int FROM companies WHERE type='PERSONAL' AND personal_owner_user_id=$1) AS personal,
    (SELECT COUNT(*)::int FROM company_memberships WHERE company_id=$2 AND user_id=$1 AND status='ACTIVE') AS invited,
    (SELECT use_count FROM company_invitations WHERE token_hash=$3) AS use_count`, [one.appUserId, companyId, hashInvitationToken(TOKEN)])
  assert.deepEqual(state.rows[0], { personal: 1, invited: 1, use_count: 1 })
})
