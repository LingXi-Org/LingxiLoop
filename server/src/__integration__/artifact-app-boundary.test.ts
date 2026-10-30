import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { pool } from '../db/pool.js'
import { artifactBlobRouter, artifactEditorRouter } from '../modules/artifacts/index.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Full HTTP router + PostgreSQL/Redis for the product API and the vendored editor's
// grant-authorized routes. Only the session identity is a test fixture.
let server: Server, origin: string, companyId: string, projectId: string
const userId = 'artifact-member'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  ;({ companyId, projectId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId, { isAdmin: false })
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('artifact-room',$1,$2,'group','Design boundary',$3::jsonb)`, [companyId, projectId, JSON.stringify([userId])])
  // As in web.ts, the editor routes read their own bodies, so they precede the API's JSON parser.
  const app = (await import('express')).default()
  app.use('/artifact-editor', artifactEditorRouter)
  app.use('/_blob', artifactBlobRouter)
  app.use(await buildApiTestApp(userId))
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
})
after(async () => { await teardownAll(server) })
const api = (path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => fetch(`${origin}/api${path}`, {
  method, headers: { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId, ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
})
const save = (editor: string, files: Record<string, unknown>) => fetch(`${origin}${editor}__deck/publish`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files }) })
const entry = (text: string, ifMatch?: string | null) => ({ base64: Buffer.from(text).toString('base64'), contentType: 'text/html', ...(ifMatch !== undefined ? { ifMatch } : {}) })

test('a conversation Design opens in the editor with all-or-nothing saves and grant authorization', async () => {
  const created = await api('/conversations/artifact-room/design', 'POST')
  assert.equal(created.status, 201)
  const design = await created.json() as { id: string; files: Record<string, { sha256: string }> }
  assert.ok(design.files['project/canvas.json'])
  assert.equal((await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }).id, design.id)

  const grant = await (await api(`/artifacts/${design.id}/editor-grant`, 'POST')).json() as { url: string; write: boolean }
  assert.equal(grant.write, true)
  assert.match(grant.url, /^\/artifact-editor\/design\/[^/]+\/$/)
  const page = await fetch(origin + grant.url)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-security-policy') ?? '', /^sandbox allow-scripts/)
  assert.equal((await (await fetch(`${origin}${grant.url}__deck/session`)).json() as { canEdit: boolean }).canEdit, true)

  const first = await save(grant.url, { 'project/Main.dc.html': entry('<x-dc>one</x-dc>', null) })
  assert.equal(first.status, 200)
  const sha = (await first.json() as { shas: Record<string, string> }).shas['project/Main.dc.html']
  const writes = await Promise.all(['two', 'three'].map(text => save(grant.url, { 'project/Main.dc.html': entry(`<x-dc>${text}</x-dc>`, sha) })))
  assert.deepEqual(writes.map(response => response.status).sort(), [200, 409])
  const readOnly = await save(grant.url, { 'project/assets/x.html': entry('x') })
  assert.equal(readOnly.status, 400)
  const listing = await (await fetch(`${origin}${grant.url}_files.json`)).json() as { files: Record<string, unknown> }
  assert.deepEqual(Object.keys(listing.files).sort(), ['project/Main.dc.html', 'project/canvas.json'])
  const file = await fetch(`${origin}${grant.url}project/Main.dc.html`)
  assert.match(file.headers.get('content-security-policy') ?? '', /^sandbox;/)

  const [, , kind, token] = grant.url.split('/')
  assert.equal(kind, 'design')
  assert.equal((await fetch(`${origin}/artifact-editor/slides/${token}/_files.json`)).status, 404)
  assert.equal((await fetch(`${origin}/artifact-editor/design/${token.slice(0, -2)}xx/_files.json`)).status, 404)
  assert.ok([403, 404].includes((await api(`/artifacts/${design.id}`, 'GET', undefined, { 'x-company-id': 'another-company' })).status))

  // A grant is no stronger than the person's current access.
  await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, userId])
  assert.equal((await save(grant.url, { 'project/Main.dc.html': entry('<x-dc>revoked</x-dc>') })).status, 404)
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  const stored = await pool.query<{ body: Buffer }>(`SELECT body FROM artifact_files WHERE artifact_id=$1 AND path='project/Main.dc.html'`, [design.id])
  assert.doesNotMatch(stored.rows[0].body.toString('utf8'), /revoked/)
})

test('project Slides decks are listed, created with their index, renamed and deleted', async () => {
  const created = await api(`/projects/${projectId}/slides`, 'POST', { title: 'Review deck' })
  assert.equal(created.status, 201)
  const deck = await created.json() as { id: string; kind: string; files: Record<string, unknown> }
  assert.equal(deck.kind, 'slides')
  assert.ok(deck.files['project/deck.json'])
  const listed = await (await api(`/projects/${projectId}/slides`)).json() as { id: string; title: string }[]
  assert.deepEqual(listed.map(item => item.id), [deck.id])
  assert.equal((await (await api(`/artifacts/${deck.id}`, 'PATCH', { title: 'Final deck' })).json() as { title: string }).title, 'Final deck')
  assert.equal((await api(`/artifacts/${deck.id}`, 'DELETE')).status, 200)
  assert.equal((await api(`/artifacts/${deck.id}`)).status, 404)
})
