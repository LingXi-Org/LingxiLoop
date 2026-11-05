import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { artifactEditorOrigin } from '../../../shared/artifact-editor-origin.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { CH_ARTIFACTS, sub } from '../redis.js'
import { publishArtifactEvent } from '../modules/artifacts/events.js'
import { artifactBlobRouter, artifactEditorRouter } from '../modules/artifacts/index.js'
import { GRANT_TTL_MS, issueGrant } from '../modules/artifacts/grants.js'
import { artifactKind } from '../modules/artifacts/kinds.js'
import { createNode, type ArtifactDocument } from '../../../shared/artifact-document.js'
import { prepareBatch, type ArtifactOperation } from '../../../shared/artifact-operations.js'
import { readNativeDocument, submitNativeOperations } from '../modules/artifacts/native-document.js'
import { withTransaction } from '../db/transaction.js'
import { publishArtifactFiles, replyComment } from '../modules/artifacts/facade.js'
import { encodeCommentAnchor } from '../../../shared/artifact-comment-anchor.js'
import { permissionService } from '../modules/access/public.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Full HTTP router + PostgreSQL/Redis for the product API and retained compatibility
// grant-authorized routes. Session identity and WuKong transport are fixtures;
// authorization, persistence and the installed published SDK are real.
let server: Server, origin: string, companyId: string, projectId: string, agentId: string
const userId = 'artifact-member'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  installFakeWukong()
  await sub.subscribe(CH_ARTIFACTS)
  ;({ companyId, projectId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId, { isAdmin: false })
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('artifact-room',$1,$2,'group','Design boundary',$3::jsonb)`, [companyId, projectId, JSON.stringify([userId, agentId])])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('artifact-room',$1,$2::jsonb)`,
    [companyId, JSON.stringify({ channelType: 2, members: [userId, agentId] })])
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

async function document(id: string): Promise<ArtifactDocument> {
  const response = await api(`/artifacts/${id}/document?allPages=true`)
  assert.equal(response.status, 200, await response.clone().text())
  return (await response.json() as { document: ArtifactDocument }).document
}
const operate = (id: string, base: ArtifactDocument, operations: ArtifactOperation[]) =>
  api(`/artifacts/${id}/operations`, 'POST', prepareBatch(base, operations, randomUUID()))
async function seedTitle(id: string, text = 'Original') {
  const title = createNode('text', 'title'); title.text = text
  const response = await operate(id, await document(id), [
    { type: 'node.insert', pageId: 'page-1', node: title },
    { type: 'page.patch', pageId: 'page-1', patch: { notes: 'Keep notes' } },
  ])
  assert.equal(response.status, 200, await response.clone().text())
  return document(id)
}

test('native comments use durable node anchors, authorized mutations and the existing Agent reply service', async () => {
  const deck=await(await api(`/projects/${projectId}/slides`,'POST',{title:'Native comments'})).json() as {id:string}
  await seedTitle(deck.id)
  const path=`/artifacts/${deck.id}/comments`,anchor=encodeCommentAnchor({pageId:'page-1',nodeId:'title',x:.2,y:.7})
  const created=await api(path,'POST',{anchor,label:'标题',text:'请检查这个标题',author:{id:'forged'},companyId:'forged'})
  assert.equal(created.status,201,await created.clone().text())
  const {thread}=await created.json() as {thread:{id:string;messages:Array<{id:string;author:{id:string}}>}}
  assert.equal(thread.messages[0].author.id,userId)
  const saved=(await pool.query('SELECT doc FROM artifact_comments WHERE artifact_id=$1',[deck.id])).rows[0].doc
  assert.deepEqual(saved.threads[0].location,{file:'project/pages/page-1.json',pageId:'page-1',nodeId:'title',x:.2,y:.7})
  assert.equal((await api(`${path}/${thread.id}/messages/${thread.messages[0].id}`,'PATCH',{text:'修改后的评论'})).status,200)
  assert.equal((await api(`${path}/${thread.id}/messages`,'POST',{text:'补充说明'})).status,200)
  await replyComment({companyId,artifactId:deck.id,author:{kind:'agent',id:agentId,name:'Fixture Agent'},commentId:thread.id,text:'已检查标题'})
  const reopened=await(await api(path)).json() as {threads:Array<{messages:Array<{text:string;author:{kind:string}}>}>}
  assert.equal(reopened.threads[0].messages.at(-1)!.text,'已检查标题')
  assert.equal(reopened.threads[0].messages.at(-1)!.author.kind,'agent')
  for(const status of ['resolved','open']) assert.equal((await api(`${path}/${thread.id}`,'PATCH',{status})).status,200)
  assert.equal((await api(path,'POST',{anchor:encodeCommentAnchor({pageId:'page-1',nodeId:'missing',x:0,y:0}),label:'缺失',text:'不能绑定'})).status,409)
  for(const [suffix,method,body] of [['','GET',undefined],['','POST',{anchor,label:'标题',text:'不能写'}],[`/${thread.id}`,'DELETE',undefined]] as const) assert.ok([403,404].includes((await api(path+suffix,method,body,{'x-company-id':'other-tenant'})).status))
  assert.equal((await api(`${path}/${thread.id}`,'DELETE')).status,200)
  assert.deepEqual((await(await api(path)).json() as {threads:unknown[]}).threads,[])
  await api(`/artifacts/${deck.id}`,'DELETE')
})

test('old Slides gain independent durable native chats without rewriting source or bytes; source revocation still denies access', async () => {
  const old = { id: randomUUID() }, definition = artifactKind('slides')
  await pool.query(`INSERT INTO artifacts(id,company_id,project_id,conversation_id,kind,title,created_by,authorization_user_id,origin)
    VALUES($1,$2,$3,'artifact-room','slides','Legacy',$4,$4,'user')`, [old.id, companyId, projectId, userId])
  const initialIndex = definition.initialIndex('Legacy', new Date().toISOString()) as { designSystems: { namespace: string }[]; order: string[]; style: { look: string }[] }
  initialIndex.designSystems = initialIndex.designSystems.filter(system => system.namespace === 'slides-builtin')
  const published = await publishArtifactFiles({ companyId, artifactId: old.id, actorId: userId, actorKind: 'user', files: {
    'project/deck.json': entry(JSON.stringify(initialIndex), null),
    'project/ds/slides-builtin/tokens.json': entry(JSON.stringify(definition.initialResources!['project/ds/slides-builtin/tokens.json']), null),
  } })
  assert.equal(published.status, 200)
  const original = (await pool.query('SELECT path,sha256,body FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [old.id])).rows
  assert.deepEqual(original.map(row => row.path), ['project/deck.json', 'project/ds/slides-builtin/tokens.json'])
  assert.deepEqual(initialIndex.order, [])
  assert.equal(initialIndex.style[0].look, 'slides-builtin/light')
  assert.equal(JSON.parse(original.find(row => row.path === 'project/ds/slides-builtin/tokens.json').body.toString()).name, 'Slides 内置风格')
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
  assert.ok(binding.profile.members.includes(agentId), 'the dedicated room retains existing source-room agents')
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

test('Slides selection context, concurrent field CAS, legacy write rejection and nondestructive restore', async () => {
  const deck = await (await api(`/projects/${projectId}/slides`, 'POST', { title: 'Versioned' })).json() as { id: string }
  const grant = await (await api(`/artifacts/${deck.id}/editor-grant`, 'POST')).json() as { url: string }
  const video = await fetch(`${origin}${grant.url}__deck/assets`, { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: Buffer.from('retired-video') })
  assert.equal(video.status, 415)
  assert.equal((await pool.query('SELECT id FROM artifact_blobs WHERE artifact_id=$1', [deck.id])).rowCount, 0)
  const base = await seedTitle(deck.id)
  const before = await (await api(`/artifacts/${deck.id}/revisions`)).json() as { current: string; revisions: { seq: string }[] }
  assert.ok(before.revisions.every(revision => Number(revision.seq) > 0), 'never restore a pre-creation empty file set')
  const context = { slideId: 'page-1', selectedElementIds: ['title'], selectedText: 'Original', mode: 'edit', dirty: true, version: before.current }
  assert.equal((await api(`/artifacts/${deck.id}/editor-context`, 'PUT', context)).status, 200)
  assert.equal((await api(`/artifacts/${deck.id}/editor-context`, 'PUT', { ...context, arbitraryCommand: 'run' })).status, 400)
  const agentSave = (observed: ArtifactDocument, patch: { x?: number; text?: string }) => withTransaction(pool, db => submitNativeOperations(db, {
    artifactId: deck.id, companyId, actorId: agentId, actorKind: 'agent',
    request: prepareBatch(observed, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch }], randomUUID()),
  }))
  await agentSave(base, { x: 60 })
  const human = await operate(deck.id, base, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { text: 'Human' } }])
  assert.equal(human.status, 200, 'an unrelated Agent field can merge while a person has a dirty text draft')
  await assert.rejects(agentSave(base, { text: 'Agent' }), (error: unknown) => (error as { status: number }).status === 409)
  await api(`/artifacts/${deck.id}/editor-context`, 'PUT', { ...context, dirty: false })
  await agentSave(await document(deck.id), { text: 'Agent' })
  const saved = await document(deck.id)
  assert.equal(saved.pages['page-1'].nodes.title.text, 'Agent')
  assert.equal(saved.pages['page-1'].nodes.title.x, 60)
  assert.equal(saved.pages['page-1'].notes, 'Keep notes')
  const files = { 'project/slides/one.html': entry('<h1>Retired writer</h1>', null) }
  const retired = await save(grant.url, files)
  assert.equal(retired.status, 409)
  assert.equal((await retired.json() as { code: string }).code, 'editor_upgrade_required')
  const agentLegacy = await publishArtifactFiles({ companyId, artifactId: deck.id, actorId: agentId, actorKind: 'agent', files })
  assert.equal(agentLegacy.status, 409); assert.equal(agentLegacy.body.code, 'editor_upgrade_required')
  assert.deepEqual(await document(deck.id), saved)
  assert.equal((await api(`/artifacts/${deck.id}/revisions/${before.revisions[0].seq}/restore`, 'POST', { version: before.current })).status, 409)
  const live = await (await api(`/artifacts/${deck.id}/revisions`)).json() as typeof before
  assert.equal((await api(`/artifacts/${deck.id}/revisions/${before.revisions[0].seq}/restore`, 'POST', { version: live.current })).status, 200)
  const restored = await document(deck.id)
  assert.equal(restored.pages['page-1'].nodes.title.text, 'Original')
  assert.equal(restored.pages['page-1'].notes, 'Keep notes')
  const after = await (await api(`/artifacts/${deck.id}/revisions`)).json() as typeof before
  assert.ok(after.revisions.length > live.revisions.length)
  for (const revision of live.revisions) assert.ok(after.revisions.some(item => item.seq === revision.seq))
  assert.ok([403, 404].includes((await api(`/artifacts/${deck.id}/revisions`, 'GET', undefined, { 'x-company-id': 'another-company' })).status))
  await api(`/artifacts/${deck.id}`, 'DELETE')
})

test('a conversation Design opens as native data with all-or-nothing saves and isolated grant authorization', async () => {
  const created = await api('/conversations/artifact-room/design', 'POST')
  assert.equal(created.status, 201)
  const design = await created.json() as { id: string; files: Record<string, { sha256: string }> }
  assert.ok(design.files['project/document.json'])
  assert.equal((await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }).id, design.id)
  const grant = await (await api(`/artifacts/${design.id}/editor-grant`, 'POST')).json() as { url: string; isolatedUrl: string; write: boolean }
  assert.match(grant.url, /^http:\/\/[a-f0-9]{32}-artifact\.localhost:5180\//)
  assert.equal(grant.isolatedUrl, grant.url)
  grant.url = new URL(grant.url).pathname
  assert.equal(grant.write, true)
  assert.equal((await fetch(origin + grant.url)).status, 410, 'retired editor entry cannot load its main bundle')
  assert.deepEqual(await (await fetch(`${origin}/artifact-editor/preload.json`)).json(), { design: [], slides: [] })
  for (const privatePath of ['project/document.json', 'index.html', 'artifact-type/dc-runtime.js']) {
    assert.equal((await fetch(`${origin}/artifact-editor/design-assets/${privatePath}`)).status, 404)
  }
  assert.equal((await (await fetch(`${origin}${grant.url}__deck/session`)).json() as { canEdit: boolean }).canEdit, true)
  const initial = await seedTitle(design.id)
  const embed = createNode('embed', 'isolated')
  embed.embed = { source: '<html><body><p>Isolated source</p></body></html>', format: 'html' }
  assert.equal((await operate(design.id, initial, [{ type: 'node.insert', pageId: 'page-1', node: embed }])).status, 200)
  const base = await document(design.id)
  const embedGrant = await api(`/artifacts/${design.id}/embeds/page-1/isolated/grant`, 'POST', {
    sha256: base.pages['page-1'].nodes.isolated.embed!.sourceHash, nonce: 'test-isolated-capture',
  })
  assert.equal(embedGrant.status, 200, await embedGrant.clone().text())
  const embeddedUrl = new URL((await embedGrant.json() as { url: string }).url, origin)
  const embedded = await fetch(origin + embeddedUrl.pathname + embeddedUrl.search)
  assert.equal(embedded.status, 200)
  assert.match(embedded.headers.get('content-security-policy') ?? '', /^sandbox allow-scripts/)
  assert.doesNotMatch(embedded.headers.get('content-security-policy') ?? '', /allow-same-origin/)
  assert.match(await embedded.text(), /Isolated source/)
  const writes = await Promise.all(['two', 'three'].map(text => operate(design.id, base, [
    { type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { text } },
  ])))
  assert.deepEqual(writes.map(response => response.status).sort(), [200, 409])
  const saved = await document(design.id)
  const atomic = await operate(design.id, base, [
    { type: 'document.patch', patch: { title: 'Must not partially save' } },
    { type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { text: 'Stale' } },
  ])
  assert.equal(atomic.status, 409)
  assert.deepEqual(await document(design.id), saved)
  assert.equal((await save(grant.url, { 'project/Main.dc.html': entry('<x-dc>retired</x-dc>', null) })).status, 409)
  const listing = await (await fetch(`${origin}${grant.url}_files.json`)).json() as { files: Record<string, unknown> }
  assert.ok(listing.files['project/document.json']); assert.ok(listing.files['project/pages/page-1.json'])
  assert.equal((await fetch(`${origin}${grant.url}project/document.json`)).status, 200)
  const reopened = await (await api('/conversations/artifact-room/design', 'POST')).json() as { id: string }
  assert.equal(reopened.id, design.id, 'reopening the panel reuses the conversation board')
  assert.deepEqual(await document(reopened.id), saved)
  const [, , kind, token] = grant.url.split('/')
  assert.equal(kind, 'design')
  assert.equal((await fetch(`${origin}/artifact-editor/slides/${token}/_files.json`)).status, 404)
  assert.equal((await fetch(`${origin}/artifact-editor/design/${token.slice(0, -2)}xx/_files.json`)).status, 404)
  assert.ok([403, 404].includes((await api(`/artifacts/${design.id}`, 'GET', undefined, { 'x-company-id': 'another-company' })).status))
  await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, userId])
  try {
    assert.equal((await save(grant.url, { 'project/Main.dc.html': entry('<x-dc>revoked</x-dc>') })).status, 404)
    assert.ok([403, 404].includes((await operate(design.id, saved, [{ type: 'document.patch', patch: { title: 'Revoked' } }])).status))
    assert.equal((await fetch(`${origin}${grant.url}project/document.json`)).status, 404)
    assert.deepEqual((await readNativeDocument(pool, design.id))!.document, saved)
  } finally {
    await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`, [projectId, companyId, userId])
  }
})

test('project Slides decks are listed, created as native documents, renamed with CAS and deleted', async () => {
  const created = await api(`/projects/${projectId}/slides`, 'POST', { title: 'Review deck' })
  assert.equal(created.status, 201)
  const deck = await created.json() as { id: string; kind: string; files: Record<string, unknown> }
  assert.equal(deck.kind, 'slides')
  assert.ok(deck.files['project/document.json']); assert.equal(deck.files['project/deck.json'], undefined)
  const snapshot = await document(deck.id)
  assert.equal(Object.keys(snapshot.themes).length, 6)
  const listed = await (await api(`/projects/${projectId}/slides`)).json() as { id: string; title: string }[]
  assert.deepEqual(listed.map(item => item.id), [deck.id])
  const grant = await (await api(`/artifacts/${deck.id}/editor-grant`, 'POST')).json() as { url: string; isolatedUrl: string }
  assert.match(grant.url, /^\/artifact-editor\/slides\/[^/]+\/$/)
  assert.equal(grant.isolatedUrl, `${await artifactEditorOrigin(grant.url.split('/')[3], env.ARTIFACT_EDITOR_BASE)}${grant.url}`)
  assert.equal((await fetch(origin + grant.url)).status, 410)
  assert.equal((await fetch(origin + grant.url + 'project/document.json')).status, 200)
  assert.equal((await fetch(origin + grant.url + 'project/pages/page-1.json')).status, 200)
  assert.deepEqual(await (await fetch(`${origin}/artifact-editor/preload.json`)).json(), { design: [], slides: [] })
  for (const path of ['/artifact-editor/slides-assets/project/deck.json', '/artifact-editor/slides-assets/node/compiler.cjs', '/artifact-editor/slides/invalid/project/document.json']) {
    assert.equal((await fetch(origin + path)).status, 404)
  }
  assert.equal((await api(`/artifacts/${deck.id}`, 'PATCH', { title: 'Missing observed version' })).status, 409)
  const renamed = await api(`/artifacts/${deck.id}`, 'PATCH', { title: 'Final deck', operationId: randomUUID(), expectedVersion: snapshot.versions['document/title'] ?? 0 })
  assert.equal(renamed.status, 200, await renamed.clone().text())
  assert.equal((await renamed.json() as { title: string }).title, 'Final deck')
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


test('retained native grants follow current read/write policy without upgrading issued capabilities', async () => {
  const status = (await pool.query<{ status: string }>('SELECT status FROM projects WHERE id=$1', [projectId])).rows[0].status
  for (const kind of ['design', 'slides'] as const) {
    const created = kind === 'design'
      ? await api('/conversations/artifact-room/design', 'POST')
      : await api(`/projects/${projectId}/slides`, 'POST', { title: 'Grant boundary' })
    assert.ok([200, 201].includes(created.status))
    const artifact = await created.json() as { id: string }
    type Grant = { url: string; write: boolean }
    const writer = await (await api(`/artifacts/${artifact.id}/editor-grant`, 'POST')).json() as Grant
    assert.equal(writer.write, true)
    const pathOf = (grant: Grant) => new URL(grant.url, origin).pathname
    const writerPath = pathOf(writer), indexPath = 'project/document.json'
    const stored = (await pool.query<{ body: Buffer; sha256: string }>('SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifact.id, indexPath])).rows[0]
    const files = { [kind === 'design' ? 'project/canvas.json' : 'project/deck.json']: entry('{}', null) }
    assert.equal((await fetch(origin + writerPath + indexPath)).status, 200)
    let reader: Grant | undefined
    try {
      await pool.query("UPDATE projects SET status='READ_ONLY' WHERE id=$1", [projectId])
      const session = await fetch(origin + writerPath + '__deck/session')
      assert.equal(session.status, 200)
      assert.equal((await session.json() as { canEdit: boolean }).canEdit, false, 'old writer must not report stale write authority')
      assert.equal((await fetch(origin + writerPath + indexPath)).status, 200, 'read permission survives write downgrade')
      assert.equal((await save(writerPath, files)).status, 404)
      reader = await (await api(`/artifacts/${artifact.id}/editor-grant`, 'POST')).json() as Grant
      assert.equal(reader.write, false)
      assert.equal((await fetch(origin + pathOf(reader) + indexPath)).status, 200)
      assert.equal((await save(pathOf(reader), files)).status, 404)
    } finally {
      await pool.query('UPDATE projects SET status=$2 WHERE id=$1', [projectId, status])
    }
    assert.ok(reader)
    assert.equal((await save(pathOf(reader), files)).status, 404, 'a read-only capability never gains write access when project permission returns')
    assert.equal((await fetch(origin + writerPath + '__deck/session').then(r => r.json()) as { canEdit: boolean }).canEdit, true)
    const fresh = await (await api(`/artifacts/${artifact.id}/editor-grant`, 'POST')).json() as Grant
    assert.equal(fresh.write, true)
    assert.equal((await save(pathOf(fresh), files)).status, 409, 'write authority cannot bypass the native document fence')
    assert.deepEqual((await pool.query('SELECT body FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifact.id, indexPath])).rows[0].body, stored.body)
  }
})

test('expired, cross-tenant, wrong-kind and revoked native grants cannot read or overwrite persisted files', async () => {
  for (const kind of ['design', 'slides'] as const) {
    const artifact = await (await (kind === 'design'
      ? api('/conversations/artifact-room/design', 'POST')
      : api(`/projects/${projectId}/slides`, 'POST', { title: 'Expired grant boundary' }))).json() as { id: string }
    const current = issueGrant({ artifactId: artifact.id, companyId, userId, kind, write: true })
    const expired = issueGrant({ artifactId: artifact.id, companyId, userId, kind, write: true }, Date.now() - GRANT_TTL_MS - 1000)
    const foreign = issueGrant({ artifactId: artifact.id, companyId: 'different-tenant', userId, kind, write: true })
    const indexPath = 'project/document.json'
    const before = (await pool.query<{ body: Buffer; sha256: string }>('SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifact.id, indexPath])).rows[0]
    const files = { [kind === 'design' ? 'project/canvas.json' : 'project/deck.json']: entry('{}', null) }
    for (const [routeKind, token] of [[kind, expired.grant], [kind, foreign.grant], [kind === 'design' ? 'slides' : 'design', current.grant]]) {
      const path = `/artifact-editor/${routeKind}/${token}/`
      for (const route of ['_files.json', indexPath, '__deck/session']) assert.equal((await fetch(origin + path + route)).status, 404)
      assert.equal((await save(path, files)).status, 404)
    }
    const path = `/artifact-editor/${kind}/${current.grant}/`
    try {
      await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, userId])
      for (const route of ['_files.json', indexPath, '__deck/session']) assert.equal((await fetch(origin + path + route)).status, 404)
      assert.equal((await save(path, files)).status, 404)
    } finally {
      await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')", [projectId, companyId, userId])
    }
    assert.deepEqual((await pool.query('SELECT body FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifact.id, indexPath])).rows[0].body, before.body)
  }
})
