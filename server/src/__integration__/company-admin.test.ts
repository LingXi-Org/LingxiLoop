import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import express from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { errorHandler } from '../http/errors.js'
import { companyAdminRouter, managementRouter } from '../modules/platform-operations/company-router.js'
import { adminRouter } from '../modules/platform-operations/router.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { WukongClient, _setWukongClientForTests } from '../im/wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let server: Server, base = ''
const originalFetch = globalThis.fetch
const A = 'admin-school-a', B = 'admin-school-b', actor = 'test-owner'
const projectA = `general-${A}`, projectB = `general-${B}`
before(async () => {
  await ensureSchemaOnce()
  _setWukongClientForTests(new class extends WukongClient {
    override async syncMessages() { return [] }
    override async upsertChannel() {}
    override async revokeUser() {}
  }({ apiUrl: 'http://unused', wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: 'test' }))
  globalThis.fetch = async (input, init) => String(input).includes('/api/internal/revoke-sessions') ? Response.json({ ok: true }) : originalFetch(input, init)
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const identity = req as typeof req & AuthedRequest
    if (req.headers['x-test-actor']) {
      identity.authUserId = String(req.headers['x-test-actor'])
      identity.gatewayAuthenticated = true
      identity.gatewayPlatformAdmin = req.headers['x-test-platform'] === 'true'
    }
    next()
  })
  app.use('/company', companyAdminRouter); app.use('/management', managementRouter); app.use('/platform', adminRouter)
  app.use(errorHandler)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object'); base = `http://127.0.0.1:${address.port}`
})
after(async () => { globalThis.fetch = originalFetch; await teardownAll(server) })
beforeEach(async () => {
  await resetAllTables()
  await seedCompanyWithAgent({ companyId: A, agentId: 'agent-a' })
  await seedCompanyWithAgent({ companyId: B, agentId: 'agent-b' })
  await seedUserMembership('teacher-a', A, { isAdmin: false })
  await pool.query(`UPDATE users SET email_verified_at=NOW(); UPDATE companies SET status='ACTIVE'; UPDATE projects SET status='ACTIVE'`)
  for (const [id, companyId, projectId, members, kind] of [
    ['room-a', A, projectA, [actor, 'agent-a'], 'group'], ['room-b', B, projectB, [`test-owner-${B}`, 'agent-b'], 'group'],
    ['private-room', A, projectA, ['teacher-a', 'agent-a'], 'direct'],
  ] as const) {
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,$4,$1,$5::jsonb)`, [id, companyId, projectId, kind, JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [id, companyId, JSON.stringify({ channelType: 2, members, kind, projectId })])
  }
  for (const [id, companyId, projectId, visibility, owner] of [
    ['source-a', A, projectA, 'PROJECT', actor], ['source-b', B, projectB, 'PROJECT', `test-owner-${B}`], ['source-private', A, projectA, 'PRIVATE', 'teacher-a'],
  ]) {
    await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,mime_type,size_bytes,status,stage,visibility_scope,owner_user_id,created_by_user_id,created_via)
      VALUES($1,$2,$3,'file',$1,'text/plain',5,'queued','queued',$4,$5,$5,'USER')`, [id, companyId, projectId, visibility, owner])
    await pool.query(`INSERT INTO knowledge_source_jobs(id,source_id,status,available_at) VALUES($1,$2,'queued',NOW())`, [`job-${id}`, id])
  }
  for (const [id, companyId, conversation] of [['call-a', A, 'room-a'], ['call-b', B, 'room-b'], ['call-private', A, 'private-room'], ['call-unbound', A, null]]) {
    await pool.query(`INSERT INTO llm_calls(id,company_id,conversation_id,purpose,source,model,input_tokens,output_tokens,cost_usd,status) VALUES($1,$2,$3,'test','product','fixture',10,2,0.25,'succeeded')`, [id, companyId, conversation])
  }
})

async function request(path: string, init: RequestInit = {}, user = actor) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(user ? { 'x-test-actor': user } : {}), ...init.headers } })
  const body = await response.json().catch(() => null) as {
    mode: string; companyId: string; capabilities: Record<string, boolean>; url: string;
    data: Array<Record<string, unknown> & { id: string }>; total: number; nextCursor: string | null;
    metrics: Array<{ resource: string; value: number }>;
  }
  return { status: response.status, body }
}
test('management identity comes from active PostgreSQL administration and does not grant platform access', async () => {
  const session = await request('/management/session')
  assert.equal(session.status, 200); assert.equal(session.body.mode, 'company'); assert.equal(session.body.companyId, A)
  assert.equal((await request('/management/session', {}, 'teacher-a')).status, 403)
  assert.equal((await request('/management/session', {}, '')).status, 401)
  assert.equal((await request('/platform/dashboard')).status, 401)
  const platform = await request('/management/session', { headers: { 'x-test-platform': 'true' } })
  assert.equal(platform.body.mode, 'platform')
})

test('lists, cursors, search, nested sources and summaries exclude foreign and private records', async () => {
  for (const [resource, ids] of [['projects', [projectA]], ['knowledge-sources', ['source-a']], ['knowledge-jobs', ['job-source-a']], ['conversations', ['room-a']], ['llm-calls', ['call-a']]] as const) {
    const page = await request(`/company/resources/${resource}`)
    assert.equal(page.status, 200, JSON.stringify(page.body))
    assert.deepEqual(page.body.data.map((row: { id: string }) => row.id), ids)
    assert.equal(page.body.total, ids.length)
    assert.equal((await request(`/company/resources/${resource}?companyId=${B}`)).status, 404)
  }
  assert.equal((await request('/company/resources/users?limit=1')).body.nextCursor !== null, true)
  const next = await request('/company/resources/users?limit=1&cursor=MQ')
  assert.equal(next.body.data.length, 1); assert.equal(next.body.total, 2)
  const members = await request('/company/resources/users')
  assert.ok(members.body.data.every((row: Record<string, unknown>) => !('password_hash' in row) && !('suspended_at' in row)))
  assert.deepEqual((await request('/company/resources/knowledge-jobs?sourceId=source-private')).body.data, [])
  assert.deepEqual((await request('/company/resources/projects?projectId=' + projectB)).body.data, [])
  assert.deepEqual((await request('/company/search?q=admin-school-b')).body.data, [])
  const summary = await request(`/company/resources/projects/${projectA}/summary`)
  assert.equal(summary.status, 200, JSON.stringify(summary.body))
  assert.equal(summary.body.metrics.find((metric: { resource: string }) => metric.resource === 'knowledge-sources')?.value, 1)
  assert.deepEqual((await request('/company/usage')).body, { calls: 1, inputTokens: 10, outputTokens: 2, costUsd: 0.25 })
})

test('guessed details, content chunks, messages and commands share the same boundary', async () => {
  for (const path of [
    `/resources/companies/${B}`, `/resources/projects/${projectB}/summary`, '/resources/knowledge-sources/source-b',
    '/resources/knowledge-sources/source-private/content/title', '/resources/knowledge-jobs/job-source-private',
    '/resources/llm-calls/call-private', '/resources/users/test-owner-admin-school-b', '/conversations/room-b/messages',
    '/conversations/private-room/messages', '/resources/audit-events', '/resources/webhook-receipts',
  ]) assert.equal((await request(`/company${path}`)).status, 404, path)
  assert.equal((await request('/company/resources/knowledge-sources/source-a/content/title?limit=4')).body.data, 'sour')
  assert.equal((await request('/company/conversations/room-a/messages')).status, 200)
  assert.equal((await request(`/company/business/companies/${B}`, { method: 'PATCH', body: JSON.stringify({ name: 'forged' }) })).status, 404)
  assert.equal((await request(`/company/business/projects/${projectB}/archive`, { method: 'POST' })).status, 404)
  assert.equal((await request('/company/users/teacher-a/suspend', { method: 'POST' })).status, 404)
})

test('revocation, removal, suspension and company state are enforced on the next request', async () => {
  await pool.query(`UPDATE company_memberships SET is_admin=FALSE WHERE company_id=$1 AND user_id=$2`, [A, actor])
  assert.equal((await request('/company/resources/projects')).status, 403)
  await pool.query(`UPDATE company_memberships SET is_admin=TRUE,status='SUSPENDED',ended_at=NOW() WHERE company_id=$1 AND user_id=$2`, [A, actor])
  assert.equal((await request('/management/session')).status, 403)
  await pool.query(`UPDATE company_memberships SET status='ACTIVE',ended_at=NULL WHERE company_id=$1 AND user_id=$2`, [A, actor])
  await pool.query(`UPDATE users SET suspended_at=NOW() WHERE id=$1`, [actor])
  assert.equal((await request('/company/resources/projects')).status, 403)
  await pool.query(`UPDATE users SET suspended_at=NULL WHERE id=$1`, [actor])
  await pool.query(`UPDATE companies SET status='READ_ONLY' WHERE id=$1`, [A])
  const session = await request('/management/session')
  assert.equal(session.status, 200); assert.equal(session.body.capabilities.invite, false)
  assert.equal((await request(`/company/business/companies/${A}/invitations`, { method: 'POST', body: JSON.stringify({ email: 'new@test.local' }) })).status, 403)
  assert.equal((await request('/company/resources/projects')).status, 200)
})

test('member management preserves last-admin protection, invitations and immediate revocation', async () => {
  const path = `/company/business/companies/${A}/members`
  assert.equal((await request(`${path}/${actor}`, { method: 'PATCH', body: JSON.stringify({ isAdmin: false }) })).status, 409)
  assert.equal((await request(`${path}/${actor}`, { method: 'DELETE' })).status, 409)
  assert.equal((await request(`${path}/teacher-a`, { method: 'PATCH', body: JSON.stringify({ isAdmin: true }) })).status, 200)
  assert.equal((await request('/management/session', {}, 'teacher-a')).status, 200)
  assert.equal((await request(`${path}/teacher-a`, { method: 'PATCH', body: JSON.stringify({ isAdmin: false }) })).status, 200)
  assert.equal((await request('/management/session', {}, 'teacher-a')).status, 403)
  const invite = await request(`/company/business/companies/${A}/invitations`, { method: 'POST', body: JSON.stringify({ email: 'invited@test.local', sendEmail: false }) })
  assert.equal(invite.status, 201, JSON.stringify(invite.body)); assert.ok(invite.body.url)
  assert.equal((await request(`${path}/teacher-a`, { method: 'DELETE' })).status, 200)
  assert.equal((await request('/management/session', {}, 'teacher-a')).status, 403)
})

test('runtime list, diagnostics and retries require real tenant and session bindings', async () => {
  const runtime = await lingxiOSControl()
  for (const [id, tenantId, agentId, principalId, room] of [
    ['run-a', A, 'agent-a', actor, 'room-a'], ['run-private', A, 'agent-a', 'teacher-a', 'private-room'], ['run-b', B, 'agent-b', `test-owner-${B}`, 'room-b'],
  ]) {
    const identity = { tenantId, agentId, principalId, sessionId: `session-${id}`, runId: id }
    await runtime.enqueueJob({ ...identity, id, text: 'test', kind: 'turn', lane: 'background', executionClass: 'operation', mode: 'chat', codeExecution: 'disabled', meta: { conversationId: room } })
    await bindProductRun(pool, identity, room)
  }
  const runs = await request('/company/resources/agent-runs')
  assert.equal(runs.status, 200, JSON.stringify(runs.body)); assert.deepEqual(runs.body.data.map((run: { id: string }) => run.id), ['run-a'])
  assert.equal((await request('/company/resources/agent-runs/run-a')).status, 200)
  for (const id of ['run-private', 'run-b']) {
    assert.equal((await request(`/company/resources/agent-runs/${id}`)).status, 404)
    assert.equal((await request(`/company/agent-runs/${id}/delivery/events/retry`, { method: 'POST', body: JSON.stringify({ reason: 'test' }) })).status, 404)
  }
  await pool.query(`UPDATE agent_run_bindings SET session_id='forged' WHERE run_id='run-a'`)
  assert.equal((await request('/company/resources/agent-runs/run-a')).status, 404)
})
