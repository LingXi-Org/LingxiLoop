import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import express from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { errorHandler } from '../http/errors.js'
import { adminRouter } from '../modules/platform-operations/router.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Failure cases: company-membership checks block platform operators; forged roles
// bypass the gateway; invalid transitions mutate state; missing reasons evade the
// audit; project lifecycle changes omit their learning projections.
let server: Server, base = ''
const companyId = 'platform-lifecycle-school', projectId = `general-${companyId}`
before(async () => {
  await ensureSchemaOnce()
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const identity = req as typeof req & AuthedRequest
    identity.authUserId = 'platform-operator'
    identity.gatewayAuthenticated = req.headers['x-test-gateway'] === 'true'
    identity.gatewayPlatformAdmin = req.headers['x-test-platform'] === 'true'
    next()
  })
  app.use('/platform', adminRouter)
  app.use(errorHandler)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}/platform`
})
after(async () => { await teardownAll(server) })
beforeEach(async () => {
  await resetAllTables()
  await seedCompanyWithAgent({ companyId, agentId: 'platform-lifecycle-agent' })
  await pool.query(`INSERT INTO users(id,email,display_name) VALUES ('platform-operator','platform-operator@test.local','Platform Operator')`)
  await pool.query(`UPDATE companies SET status='TRIAL' WHERE id=$1`, [companyId])
  await pool.query(`UPDATE projects SET status='DRAFT' WHERE id=$1`, [projectId])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES ('platform-lifecycle-course',$1,$2,'test-owner')`, [companyId, projectId])
})

async function command(resource: string, action: string, body: object = { reason: '平台生命周期回归测试' }, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}/${resource}/${action}`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-test-gateway': 'true', 'x-test-platform': 'true', ...headers,
  }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => null) }
}

test('platform operators manage company lifecycle without tenant membership and preserve audit reasons', async () => {
  assert.equal((await pool.query(`SELECT 1 FROM company_memberships WHERE user_id='platform-operator'`)).rowCount, 0)
  assert.deepEqual(await command(`companies/${companyId}`, 'activate'), { status: 200, body: { ok: true, status: 'ACTIVE', applied: true } })
  assert.deepEqual(await command(`companies/${companyId}`, 'activate'), { status: 200, body: { ok: true, status: 'ACTIVE', applied: false } })
  assert.equal((await command(`companies/${companyId}`, 'archive')).status, 409)
  assert.equal((await pool.query(`SELECT status FROM companies WHERE id=$1`, [companyId])).rows[0].status, 'ACTIVE')
  await pool.query(`UPDATE companies SET status='GRACE_PERIOD' WHERE id=$1`, [companyId])
  assert.deepEqual(await command(`companies/${companyId}`, 'enter-read-only'), { status: 200, body: { ok: true, status: 'READ_ONLY', applied: true } })
  await pool.query(`UPDATE companies SET status='RETENTION' WHERE id=$1`, [companyId])
  assert.deepEqual(await command(`companies/${companyId}`, 'archive'), { status: 200, body: { ok: true, status: 'ARCHIVED', applied: true } })
  const audit = await pool.query(`SELECT user_id,detail->>'reason' AS reason FROM audit_events WHERE kind='platform_admin.lifecycle' ORDER BY created_at DESC LIMIT 1`)
  assert.deepEqual(audit.rows, [{ user_id: 'platform-operator', reason: '平台生命周期回归测试' }])
})

test('platform project commands retain lifecycle rules and learning projections', async () => {
  for (const [action, status] of [['activate', 'ACTIVE'], ['end', 'COURSE_ENDED'], ['enter-read-only', 'READ_ONLY']] as const) {
    assert.deepEqual(await command(`projects/${projectId}`, action), { status: 200, body: { ok: true, status, applied: true } })
    assert.equal((await pool.query(`SELECT status FROM projects WHERE id=$1`, [projectId])).rows[0].status, status)
  }
  assert.equal((await command(`projects/${projectId}`, 'activate')).status, 409)
  await pool.query(`UPDATE projects SET status='RETENTION' WHERE id=$1`, [projectId])
  assert.deepEqual(await command(`projects/${projectId}`, 'archive'), { status: 200, body: { ok: true, status: 'ARCHIVED', applied: true } })
  const projection = (await pool.query(`SELECT payload FROM learning_effects WHERE course_id='platform-lifecycle-course' AND kind='course_archive.sync'`)).rows
  assert.deepEqual(projection, [{ payload: { projectId, archive: true, projectStatus: 'ARCHIVED' } }])
})

test('platform lifecycle requires gateway admin authority, a bounded reason and an existing record', async () => {
  const deniedHeaders: Record<string, string>[] = [{ 'x-test-platform': 'false' }, { 'x-test-gateway': 'false' }]
  for (const headers of deniedHeaders) {
    assert.equal((await command(`companies/${companyId}`, 'activate', { reason: 'denied' }, headers)).status, 401)
  }
  for (const body of [{}, { reason: '' }, { reason: 'a'.repeat(281) }]) {
    assert.equal((await command(`companies/${companyId}`, 'activate', body)).status, 400)
  }
  assert.equal((await command('companies/missing', 'activate')).status, 404)
  assert.equal((await command('projects/missing', 'activate')).status, 404)
  assert.equal((await pool.query(`SELECT status FROM companies WHERE id=$1`, [companyId])).rows[0].status, 'TRIAL')
})

test('platform routine pause is authorized, durable and audited before future dispatch', async () => {
  await pool.query(`INSERT INTO agent_routines(id,company_id,agent_id,channel_id,kind,title,instructions,schedule,status,next_run_at,created_by)
    VALUES('platform-routine',$1,'platform-lifecycle-agent','fixture-channel','regression','Regression routine','Fixture','{}','active','2099-01-01','test-owner')`, [companyId])
  assert.equal((await command('agent-routines/platform-routine', 'pause', { reason: 'denied' }, { 'x-test-platform': 'false' })).status, 401)
  assert.equal((await command('agent-routines/platform-routine', 'pause', {})).status, 400)
  assert.deepEqual(await command('agent-routines/platform-routine', 'pause'), { status: 200, body: { ok: true, id: 'platform-routine', status: 'paused' } })
  assert.deepEqual((await pool.query(`SELECT status,next_run_at,version,pause_reason FROM agent_routines WHERE id='platform-routine'`)).rows,
    [{ status: 'paused', next_run_at: null, version: 2, pause_reason: 'platform_admin' }])
  assert.deepEqual((await pool.query(`SELECT user_id,detail->>'reason' AS reason FROM audit_events WHERE kind='platform_admin.routine_pause'`)).rows,
    [{ user_id: 'platform-operator', reason: '平台生命周期回归测试' }])
  assert.equal((await command('agent-routines/missing', 'pause')).status, 404)
})
