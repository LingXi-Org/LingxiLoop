import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { pool } from '../db/pool.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model was recorded before implementation in docs/evidence/canvas-feedback-scope/failure-model.md.
// Real HTTP router/permissions/PostgreSQL; authentication identity is a test fixture.
let server: Server, base: string, companyId: string, projectId: string
const userId = 'canvas-feedback-scope-member'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  ;({ companyId, projectId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId, { isAdmin: false })
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')", [projectId, companyId, userId])
  for (const id of ['feedback-room-a', 'feedback-room-b']) await pool.query(
    "INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Feedback boundary',$4::jsonb)",
    [id, companyId, projectId, JSON.stringify([userId])])
  server = createServer(await buildApiTestApp(userId))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}/api`
})
after(async () => { await teardownAll(server) })
const http = (path: string, body: unknown) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId }, body: JSON.stringify(body),
})
test('feedback rejects another canvas frame before persisting the comment', async () => {
  const canvases: string[] = []
  for (const room of ['feedback-room-a', 'feedback-room-b']) {
    const response = await http(`/conversations/${room}/canvas`, {})
    assert.equal(response.status, 201)
    canvases.push((await response.json() as { id: string }).id)
  }
  const created = await http('/canvas/frames', { canvasId: canvases[0], type: 'markdown', title: 'Scoped source', content: 'Synthetic reference A' })
  assert.equal(created.status, 201)
  const frameId = (await created.json() as { id: string }).id
  const accepted = await http('/canvas/comments', { canvasId: canvases[0], frameId, body: 'same canvas reference' })
  assert.equal(accepted.status, 201)
  const rejected = await http('/canvas/comments', { canvasId: canvases[1], frameId, body: 'must not cross canvas' })
  assert.equal(rejected.status, 404)
  const rows = await pool.query('SELECT canvas_id,frame_id,body FROM canvas_comments ORDER BY created_at')
  assert.deepEqual(rows.rows, [{ canvas_id: canvases[0], frame_id: frameId, body: 'same canvas reference' }])
  assert.equal((await pool.query('SELECT 1 FROM agent_run_bindings')).rowCount, 0)
})
