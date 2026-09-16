import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { listAdminResources, resourceSummary } from '../modules/platform-operations/resources.js'
import { requirePlatformAdmin } from '../modules/platform-operations/authorization.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await pool.query(`INSERT INTO users(id,email,display_name) VALUES ('workspace-user','workspace@test.local','Workspace User'),('workspace-other','workspace-other@test.local','Other User')`)
  await pool.query(`INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES ('workspace-a','School A','workspace-a','EDUCATION','ACTIVE','plan-education'),('workspace-b','School B','workspace-b','EDUCATION','ACTIVE','plan-education')`)
  await pool.query(`INSERT INTO company_memberships(company_id,user_id,role,status) VALUES ('workspace-a','workspace-user','TEACHER','ACTIVE'),('workspace-b','workspace-other','TEACHER','ACTIVE')`)
})
after(async () => { await teardownAll() })

test('workspace summaries and scoped lists agree without leaking another organization', async () => {
  const result = await listAdminResources(pool, 'company-memberships', { companyId: 'workspace-a', limit: '20' })
  assert.equal(result.total, 1)
  assert.deepEqual(result.data.map(row => [row.user_id, row.company_id_label, row.user_id_label]), [['workspace-user', 'School A', 'Workspace User']])
  const byUser = await listAdminResources(pool, 'company-memberships', { userId: 'workspace-user' })
  assert.equal(byUser.total, result.total)
  assert.equal((await resourceSummary(pool, 'companies', 'workspace-a')).metrics[0].value, result.total)
  assert.equal((await resourceSummary(pool, 'users', 'workspace-user')).metrics[0].value, result.total)
  await pool.query(`UPDATE users SET suspended_at=NOW() WHERE id='workspace-user'`)
  const suspended = await listAdminResources(pool, 'users', { status: 'suspended' })
  assert.deepEqual(suspended.data.map(row => row.id), ['workspace-user'])
  assert.equal('password_hash' in suspended.data[0], false)
})

test('workspace reads require a valid administrator gateway identity', async () => {
  await assert.rejects(() => requirePlatformAdmin(pool, { authUserId: 'workspace-user' } as never), /valid admin gateway assertion/)
  await assert.rejects(() => requirePlatformAdmin(pool, { gatewayAuthenticated: true, gatewayPlatformAdmin: false, authUserId: 'workspace-user' } as never), /valid admin gateway assertion/)
  await pool.query(`UPDATE users SET suspended_at=NOW() WHERE id='workspace-user'`)
  await assert.rejects(() => requirePlatformAdmin(pool, { gatewayAuthenticated: true, gatewayPlatformAdmin: true, authUserId: 'workspace-user' } as never), /administrator access/)
})
