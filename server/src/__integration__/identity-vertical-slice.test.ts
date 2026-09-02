import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { hashInvitationToken } from '../http/invitation-token.js'
import { provisionPersonalWorkspace } from '../modules/companies/public.js'
import { ensureTeacherPlans } from '../modules/entitlements/public.js'
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

test('[integration] ordinary provisioning is invitation-free and idempotent', async () => {
  const body = JSON.stringify({ authUserId: 'auth-personal', email: 'personal@example.com', name: 'Personal User' })
  const first = await fetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  const second = await fetch(`${baseUrl}/api/internal/registration/provision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const one = await first.json() as { appUserId: string }
  assert.deepEqual(await second.json(), one)
  const state = await pool.query<{ personal: number; courses: number }>(`SELECT
    (SELECT COUNT(*)::int FROM companies WHERE type='PERSONAL' AND personal_owner_user_id=$1) AS personal,
    (SELECT COUNT(*)::int FROM project_memberships WHERE user_id=$1 AND role='STUDENT') AS courses`, [one.appUserId])
  assert.deepEqual(state.rows[0], { personal: 1, courses: 0 })
})

test('[integration] project invitation is redeemed during provisioning', async () => {
  const projectToken = 'registration-project-invite'
  await ensureTeacherPlans(pool)
  await pool.query(`INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by) VALUES('project-registration',$1,'TEACHING','plan-teacher-free','Registration Course','ACTIVE',$2)`, [companyId, INVITER_ID])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('course-registration',$1,'project-registration',$2)`, [companyId, INVITER_ID])
  await pool.query(`INSERT INTO project_invitations(token_hash,project_id,company_id,invited_by,email,max_uses,expires_at) VALUES($1,'project-registration',$2,$3,'student@example.com',1,NOW()+INTERVAL '1 day')`, [hashInvitationToken(projectToken), companyId, INVITER_ID])

  const response = await fetch(`${baseUrl}/api/internal/registration/provision`, {
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
