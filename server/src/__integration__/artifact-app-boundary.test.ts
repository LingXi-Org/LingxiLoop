import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { pool } from '../db/pool.js'
import { CH_ARTIFACTS, sub } from '../redis.js'
import { publishArtifactEvent } from '../modules/artifacts/events.js'
import { artifactBlobRouter, artifactEditorRouter } from '../modules/artifacts/index.js'
import { inlineScriptHashes } from '../modules/artifacts/kinds.js'
import { createSlides, publishArtifactFiles } from '../modules/artifacts/facade.js'
import { permissionService } from '../modules/access/public.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Full HTTP router + PostgreSQL/Redis for the product API and the vendored editor's
// grant-authorized routes. Only the session identity is a test fixture.
let server: Server, origin: string, companyId: string, projectId: string, agentId: string
const userId = 'artifact-member'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  await sub.subscribe(CH_ARTIFACTS)
  ;({ companyId, projectId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId, { isAdmin: false })
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('artifact-room',$1,$2,'group','Design boundary',$3::jsonb)`, [companyId, projectId, JSON.stringify([userId, agentId])])
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

test('old Slides gain independent durable native chats without rewriting source or bytes; source revocation still denies access', async () => {
  const old = await createSlides({ companyId, projectId, conversationId: 'artifact-room', title: 'Legacy', actorId: userId, origin: 'conversation' })
  const original = (await pool.query('SELECT path,sha256,body FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [old.id])).rows
  const opens = await Promise.all([1, 2].map(() => api(`/artifacts/${old.id}/slides-workspace`, 'POST')))
  assert.deepEqual(opens.map(result => result.status), [200, 200])
  const first = await opens[0].json() as { conversationId: string; sourceConversationId: string; agentId: string }
  const second = await opens[1].json() as typeof first
  assert.equal(first.conversationId, second.conversationId)
  assert.notEqual(first.conversationId, 'artifact-room')
  assert.equal(first.sourceConversationId, 'artifact-room')
  assert.deepEqual((await pool.query('SELECT path,sha256,body FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [old.id])).rows, original)
  const fresh = await (await api(`/projects/${projectId}/slides`, 'POST', { title: 'Independent' })).json() as { id: string }
  const other = await (await api(`/artifacts/${fresh.id}/slides-workspace`, 'POST')).json() as typeof first
  assert.notEqual(other.conversationId, first.conversationId)
  const binding = (await pool.query('SELECT profile,leader_agent_id FROM im_channel_bindings WHERE channel_id=$1', [first.conversationId])).rows[0]
  assert.equal(binding.leader_agent_id, first.agentId)
  assert.ok(binding.profile.members.includes(userId))
  assert.ok(binding.profile.members.includes(first.agentId))
  const scope = { actorUserId: userId, companyId, action: 'conversation:read' as const, resource: { type: 'conversation' as const, id: first.conversationId } }
  assert.equal((await permissionService.can(scope)).allowed, true)
  await pool.query("UPDATE conversations SET members=members-$1 WHERE id='artifact-room'", [userId])
  assert.equal((await permissionService.can(scope)).allowed, false)
  assert.ok([403, 404].includes((await api(`/artifacts/${old.id}/slides-workspace`, 'POST')).status))
  await pool.query("UPDATE conversations SET members=members||$1::jsonb WHERE id='artifact-room'", [JSON.stringify([userId])])
  assert.equal((await (await api(`/artifacts/${old.id}/slides-workspace`, 'POST')).json() as typeof first).conversationId, first.conversationId)
  await api(`/artifacts/${old.id}`, 'DELETE')
  await api(`/artifacts/${fresh.id}`, 'DELETE')
})

test('Slides selection context, dirty protection, alternating CAS writes and nondestructive restore', async () => {
  const deck = await (await api(`/projects/${projectId}/slides`, 'POST', { title: 'Versioned' })).json() as { id: string }
  const grant = await (await api(`/artifacts/${deck.id}/editor-grant`, 'POST')).json() as { url: string }
  const path = 'project/slides/one.html', original = '<section id="one"><h1>Original</h1><aside>Keep notes</aside></section>'
  assert.equal((await save(grant.url, { [path]: entry(original, null) })).status, 200)
  const before = await (await api(`/artifacts/${deck.id}/revisions`)).json() as { current: string; revisions: { seq: string }[] }
  const sha = (await pool.query('SELECT sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [deck.id, path])).rows[0].sha256
  const context = { slideId: 'one', selectedElementIds: ['title'], selectedText: 'Original', mode: 'edit', dirty: true, version: before.current }
  assert.equal((await api(`/artifacts/${deck.id}/editor-context`, 'PUT', context)).status, 200)
  assert.equal((await api(`/artifacts/${deck.id}/editor-context`, 'PUT', { ...context, arbitraryCommand: 'run' })).status, 400)
  const agentSave = (ifMatch?: string) => publishArtifactFiles({ companyId, artifactId: deck.id, actorId: agentId, actorKind: 'agent', files: { [path]: entry(original.replace('Original', 'Agent'), ifMatch) } })
  assert.equal((await agentSave()).body.code, 'if_match_required')
  assert.equal((await agentSave(sha)).body.code, 'editor_busy')
  const human = await save(grant.url, { [path]: entry(original.replace('Original', 'Human'), sha) })
  assert.equal(human.status, 200)
  const humanSha = (await human.json() as { shas: Record<string, string> }).shas[path]
  await api(`/artifacts/${deck.id}/editor-context`, 'PUT', { ...context, dirty: false })
  assert.equal((await agentSave(sha)).status, 409)
  assert.equal((await agentSave(humanSha)).status, 200)
  assert.equal((await api(`/artifacts/${deck.id}/revisions/${before.revisions[0].seq}/restore`, 'POST', { version: before.current })).status, 409)
  const live = await (await api(`/artifacts/${deck.id}/revisions`)).json() as typeof before
  assert.equal((await api(`/artifacts/${deck.id}/revisions/${before.revisions[0].seq}/restore`, 'POST', { version: live.current })).status, 200)
  assert.equal(await (await fetch(`${origin}${grant.url}${path}`)).text(), original)
  const after = await (await api(`/artifacts/${deck.id}/revisions`)).json() as typeof before
  assert.ok(after.revisions.length > live.revisions.length)
  for (const version of live.revisions) assert.ok(after.revisions.some(item => item.seq === version.seq))
  assert.ok([403, 404].includes((await api(`/artifacts/${deck.id}/revisions`, 'GET', undefined, { 'x-company-id': 'another-company' })).status))
  await api(`/artifacts/${deck.id}`, 'DELETE')
})

test('a conversation Design opens in the editor with all-or-nothing saves and grant authorization', async () => {
  const created = await api('/conversations/artifact-room/design', 'POST')
  assert.equal(created.status, 201)
  const design = await created.json() as { id: string; files: Record<string, { sha256: string }> }
  assert.ok(design.files['project/canvas.json'])
  assert.equal((await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }).id, design.id)

  const grant = await (await api(`/artifacts/${design.id}/editor-grant`, 'POST')).json() as { url: string; write: boolean }
  assert.match(grant.url, /^http:\/\/[a-f0-9]{32}-artifact\.localhost:5180\//)
  grant.url = new URL(grant.url).pathname
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
  const savedBody = await file.text()
  const reopened = await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }
  assert.equal(reopened.id, design.id, 'reopening the panel reuses the conversation board')
  const reopenedGrant = await (await api(`/artifacts/${reopened.id}/editor-grant`, 'POST')).json() as { url: string }
  assert.equal(await (await fetch(`${origin}${new URL(reopenedGrant.url).pathname}project/Main.dc.html`)).text(), savedBody)

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
  const grant = await (await api(`/artifacts/${deck.id}/editor-grant`, 'POST')).json() as { url: string }
  const page = await fetch(origin + new URL(grant.url, origin).pathname)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /lang="zh-CN"/)
  const csp = page.headers.get('content-security-policy') ?? ''
  assert.match(csp, /^sandbox allow-scripts allow-downloads allow-popups allow-modals;/)
  for (const hash of inlineScriptHashes(html)) assert.ok(csp.includes(`'${hash}'`))
  const assetPath = /src="(\/artifact-editor\/slides-assets\/editor-[A-Z0-9]+\.js)"/.exec(html)?.[1]
  assert.ok(assetPath)
  const asset = await fetch(origin + assetPath)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('cache-control') ?? '', /max-age=31536000, immutable/)
  assert.equal(asset.headers.get('access-control-allow-origin'), '*')
  for (const path of ['/artifact-editor/slides-assets/project/deck.json', '/artifact-editor/slides-assets/node/compiler.cjs', '/artifact-editor/slides/invalid/project/deck.json']) {
    assert.equal((await fetch(origin + path)).status, 404)
  }
  assert.equal((await (await api(`/artifacts/${deck.id}`, 'PATCH', { title: 'Final deck' })).json() as { title: string }).title, 'Final deck')
  assert.equal((await api(`/artifacts/${deck.id}`, 'DELETE')).status, 200)
  assert.equal((await api(`/artifacts/${deck.id}`)).status, 404)
})

test('open editor streams stop delivering files and comments after membership is revoked', async () => {
  const deck = await (await api(`/projects/${projectId}/slides`, 'POST', { title: 'Revocation' })).json() as { id: string }
  const grant = await (await api(`/artifacts/${deck.id}/editor-grant`, 'POST')).json() as { url: string }
  const streams = await Promise.all(['__deck/events', '__comments/events'].map(async route => {
    const response = await fetch(`${origin}${grant.url}${route}`, { signal: AbortSignal.timeout(5_000) })
    assert.equal(response.status, 200)
    const reader = response.body!.getReader()
    let initial = ''
    while (!initial.includes(route === '__deck/events' ? 'id:' : 'event: comments')) {
      const chunk = await reader.read(); assert.equal(chunk.done, false)
      initial += Buffer.from(chunk.value!).toString()
    }
    return reader
  }))
  try {
    await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, userId])
    for (const kind of ['files.changed', 'comments.changed'] as const) {
      await publishArtifactEvent({ companyId, artifactId: deck.id, kind, paths: ['project/slides/private.html'], ver: 'private' })
    }
    for (const reader of streams) assert.deepEqual(await reader.read(), { value: undefined, done: true })
  } finally {
    await Promise.allSettled(streams.map(reader => reader.cancel()))
    await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  }
})


test('assigning and steering work returns the artifact and persists the requested assignment', async () => {
  const design = await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }
  const assigned = await api(`/artifacts/${design.id}/assignments`, 'POST', { agentId, assignment: 'Build the board' })
  assert.equal(assigned.status, 200)
  assert.equal((await assigned.json() as { id: string }).id, design.id)
  const steered = await api(`/artifacts/${design.id}/assignments/${agentId}/steer`, 'POST', { text: 'Revise the board' })
  assert.equal(steered.status, 200)
  assert.deepEqual(await steered.json(), { ok: true })
  const rows = await pool.query('SELECT assignment,status FROM artifact_agent_assignments WHERE artifact_id=$1 AND agent_id=$2', [design.id, agentId])
  assert.deepEqual(rows.rows, [{ assignment: 'Revise the board', status: 'waiting' }])
  const reopened = await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }
  assert.equal(reopened.id, design.id)
  assert.deepEqual((await pool.query('SELECT assignment,status FROM artifact_agent_assignments WHERE artifact_id=$1 AND agent_id=$2', [design.id, agentId])).rows, rows.rows,
    'reopening does not replace or cancel the existing creative assignment')
})
