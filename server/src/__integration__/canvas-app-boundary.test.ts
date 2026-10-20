import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model: docs/canvas-ui-plugin-failures.md, recorded before implementation.
// Full HTTP router + PostgreSQL/Redis. Only the session identity is a test fixture.
let server: Server, base: string, companyId: string, projectId: string
const evidence: Record<string, unknown> = {}
const userId = 'canvas-app-member'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  ;({ companyId, projectId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId, { isAdmin: false })
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('canvas-app-room',$1,$2,'group','MCP App boundary',$3::jsonb)`, [companyId, projectId, JSON.stringify([userId])])
  server = createServer(await buildApiTestApp(userId))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}/api`
})
after(async () => {
  await mkdir('artifacts/canvas-app', { recursive: true })
  await writeFile('artifacts/canvas-app/http-boundary.json', JSON.stringify(evidence, null, 2))
  await teardownAll(server)
})
const http = (path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => fetch(base + path, {
  method, headers: { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId, ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
})

test('bound Canvas HTTP APIs enforce revision CAS, readback and workspace revocation', async () => {
  const created = await http('/conversations/canvas-app-room/canvas', 'POST', {})
  assert.equal(created.status, 201)
  const canvas = await created.json() as { id: string }
  const createdFrame = await http('/canvas/frames', 'POST', { canvasId: canvas.id, type: 'markdown', title: 'legacy card', content: 'original' })
  assert.equal(createdFrame.status, 201)
  const frame = await createdFrame.json() as { id: string; revision: number }
  const path = `/canvas/frames/${frame.id}`
  const writes = await Promise.all(['first', 'second'].map(content => http(path, 'PATCH', { content, baseRevision: frame.revision })))
  assert.deepEqual(writes.map(response => response.status).sort(), [200, 409])
  const winner = await writes.find(response => response.status === 200)!.json() as { content: string; revision: number }
  assert.equal(winner.revision, frame.revision + 1)
  const stale = await http(path, 'PATCH', { content: 'stale overwrite', baseRevision: frame.revision })
  assert.equal(stale.status, 409)
  assert.equal((await stale.json() as { latestFrame: { content: string } }).latestFrame.content, winner.content)
  const snapshot = await http(`/canvases/${canvas.id}`)
  assert.equal(snapshot.status, 200)
  assert.equal((await snapshot.json() as { frames: { content: string }[] }).frames[0].content, winner.content)
  // The server authorizes the resource's real project, not a caller-supplied
  // project hint. Revoke actual membership to test that authorization boundary.
  await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, userId])
  const wrongProject = await http(path, 'PATCH', { content: 'foreign', baseRevision: winner.revision })
  const wrongCompany = await http(`/canvases/${canvas.id}`, 'GET', undefined, { 'x-company-id': 'another-company' })
  assert.ok([403, 404].includes(wrongProject.status))
  assert.ok([403, 404].includes(wrongCompany.status))
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  // Authentication middleware is synthetic here; test actual domain membership
  // revocation, not the real gateway's global session-revocation check.
  await pool.query("UPDATE company_memberships SET ended_at=NOW(),status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [companyId, userId])
  const revoked = await http(path, 'PATCH', { content: 'revoked write', baseRevision: winner.revision })
  assert.ok([401, 403, 404].includes(revoked.status), `ended company membership write returned ${revoked.status}`)
  assert.equal((await pool.query('SELECT content FROM canvas_frames WHERE id=$1', [frame.id])).rows[0].content, winner.content)
  assert.equal((await pool.query('SELECT 1 FROM agent_run_bindings')).rowCount, 0)
  Object.assign(evidence, { passed: true, concurrentWrites: writes.map(response => response.status), staleWrite: stale.status,
    winnerRevision: winner.revision, wrongProject: wrongProject.status, wrongCompany: wrongCompany.status, revoked: revoked.status,
    agentRuns: 0, scope: 'real HTTP router/PG CAS/authorization; synthetic session identity, no provider' })
})
