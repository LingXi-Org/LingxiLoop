import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, readFile, writeFile, mkdtemp, symlink, unlink, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildGenUiModelContext } from '../../../src/features/chat/visualize/zcode/shared/gen-ui/contract.js'
import { pool } from '../db/pool.js'
import { createNativeMessage } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { assertInteractionAdmission } from '../im/interaction-admission.js'
import { saveVisualizeDocument, readAuthorizedVisualizeDocument, createVisualizePage, saveVisualizePageState,
  getVisualizeState, getVisualizeStateSnapshot, listVisualizeModelState, mintVisualizeGesture, submitVisualizeFollowUp, closeVisualizePage,
  readVisualizeResource, readVisualizePageState, assertVisualizePage, visualizeOutputDirectory } from '../im/visualize.js'
import { wukongClient } from '../im/wukong.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure models were recorded first in visualize-failure-models.md.
let companyId: string, projectId: string, agentId: string, server: Server, base: string
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
const channelId = 'visualize-room', userId = 'test-owner'
const checks: string[] = []
const actor = () => ({ companyId, channelId, userId })
const headers = () => ({ 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId })
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  recording = await installRecordingWukong()
  ;({ companyId, projectId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId)
  await seedUserMembership('visualize-peer', companyId)
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'visualize-peer','TEACHER')`, [projectId, companyId])
  const members = [userId, 'visualize-peer', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`, [channelId, companyId, JSON.stringify({ members, channelType: 2 }), agentId])
  server = createServer(await buildApiTestApp(userId))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}/api/im/channels/${channelId}/visualize`
})
after(async () => {
  await mkdir('artifacts/visualize', { recursive: true })
  await writeFile('artifacts/visualize/server-integration.json', JSON.stringify({ checks, passed: checks.length === 6,
    command: 'npm run test:integration -- --file visualize.test.ts', databaseIsolation: 'dedicated issue193 backend test database' }, null, 2))
  await recording?.close(); await teardownAll(server)
})
let seq = 0
async function draft(name: string, html = '<div>Visualize fixture</div>') {
  const runId = `visualize-run-${++seq}`
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,$5,2)`, [runId, companyId, channelId, agentId, userId])
  const doc = await saveVisualizeDocument({ ...actor(), runId, agentId, name, html })
  return { ...doc, runId }
}
async function deliver(doc: Awaited<ReturnType<typeof draft>>, text = `::visualize${JSON.stringify({path: doc.path, mode: 'wide'})}`) {
  const clientNonce = `visualize-source-${++seq}`
  const payload = createNativeMessage({ id: clientNonce, role: 'assistant', content: [{ type: 'text', text }], custom: { runId: doc.runId, controlPrincipalId: userId } })
  const result = await imMessagesApplication.acceptAgentMessage({ ...actor(), userId: agentId, clientNonce, payload })
  assert.equal(result.kind, 'accepted'); if (result.kind !== 'accepted') throw new Error('fixture rejected')
  return String(result.echo.messageId)
}
async function page(name: string) {
  const doc = await draft(name), sourceMessageId = await deliver(doc)
  const page = await createVisualizePage({ ...actor(), request: { path: doc.path, sourceMessageId, instanceKey: name } })
  return { ...doc, ...page, sourceMessageId, token: page.initId, ...actor() }
}
async function seedRoom(scope: {companyId:string;projectId:string;agentId:string;userId:string;channelId:string}) {
  const members = [scope.userId, scope.agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [scope.channelId,scope.companyId,scope.projectId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`, [scope.channelId,scope.companyId,JSON.stringify({members,channelType:2}),scope.agentId])
}
const http = (path: string, method = 'GET', data?: unknown, token?: string, extraHeaders?: Record<string, string>) => fetch(`${base}${path}`, {
  method, headers: { ...headers(), ...(token ? { 'x-visualize-page-token': token } : {}), ...extraHeaders }, ...(data ? { body: JSON.stringify(data) } : {}),
})

test('authorized output is real, bounded and delivered references are required', async () => {
  const doc = await draft('real-fragment')
  assert.equal(await readFile(doc.path, 'utf8'), doc.html)
  assert.deepEqual(await readAuthorizedVisualizeDocument({ ...actor(), path: doc.path }), { path: doc.path, html: doc.html })
  assert.equal((await http('/pages', 'POST', { path: doc.path, sourceMessageId: 'forged', instanceKey: 'forged' })).status, 403)
  const fenced = await deliver(doc, '```text\n::visualize' + JSON.stringify({path: doc.path}) + '\n```')
  assert.equal((await http('/pages', 'POST', { path: doc.path, sourceMessageId: fenced, instanceKey: 'fenced' })).status, 403)
  const pendingNonce = 'pending-visualize-source'
  const pending = createNativeMessage({id: pendingNonce, role: 'assistant', content: [{type: 'text', text: '::visualize' + JSON.stringify({path: doc.path})}], status: {type: 'running'}, custom: {runId: doc.runId}})
  recording.messages.push({channelId, channelType: 2, fromUid: agentId, payload: pending, messageId: pendingNonce, clientMsgNo: pendingNonce, messageSeq: 100, timestamp: Date.now()/1000})
  assert.equal((await http('/pages', 'POST', {path: doc.path, sourceMessageId: pendingNonce, instanceKey: 'pending'})).status, 403)
  assert.equal((await http('/document?path=' + encodeURIComponent('/etc/passwd'))).status, 403)
  assert.equal((await http('/document?path=' + encodeURIComponent(doc.path), 'GET', undefined, undefined, {'x-project-id': 'another-project'})).status, 403)
  assert.equal((await http('/document?path=' + encodeURIComponent(doc.path), 'GET', undefined, undefined, {'x-company-id': 'another-company'})).status, 404)
  await assert.rejects(saveVisualizeDocument({ ...actor(), agentId, runId: doc.runId, name: '../escape', html: 'x' }), { status: 400 })
  await assert.rejects(saveVisualizeDocument({ ...actor(), agentId, runId: doc.runId, name: 'full-html', html: '<!doctype html><html></html>' }), { status: 400 })
  await assert.rejects(saveVisualizeDocument({ ...actor(), userId: 'visualize-peer', agentId, runId: doc.runId, name: 'forged-actor', html: '<div>x</div>' }), { status: 403 })
  const other = await seedCompanyWithAgent({companyId:'visualize-other-tenant',agentId:'visualize-other-agent'})
  await seedUserMembership('visualize-other-user',other.companyId)
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'visualize-other-user','TEACHER')`,[other.projectId,other.companyId])
  const otherScope = {...other,userId:'visualize-other-user',channelId:'visualize-other-tenant-room'}
  await seedRoom(otherScope)
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES('other-tenant-run',$1,$2,$2,$3,$4,2)`,[other.companyId,otherScope.channelId,other.agentId,otherScope.userId])
  const otherDoc=await saveVisualizeDocument({...otherScope,runId:'other-tenant-run',name:'tenant-private',html:'<div>Other tenant</div>'})
  assert.equal((await readAuthorizedVisualizeDocument({...otherScope,path:otherDoc.path})).html,'<div>Other tenant</div>')
  assert.equal((await http('/document?path='+encodeURIComponent(otherDoc.path))).status,403)
  const linkScope={...actor(),projectId,agentId,channelId:'visualize-symlink-room'}
  await seedRoom(linkScope)
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES('symlink-run',$1,$2,$2,$3,$4,2)`,[companyId,linkScope.channelId,agentId,userId])
  const outside=await mkdtemp(join(tmpdir(),'visualize-outside-'))
  const link=visualizeOutputDirectory(linkScope)
  await symlink(outside,link)
  try {
    await assert.rejects(saveVisualizeDocument({...linkScope,runId:'symlink-run',name:'escape',html:'<div>Escape</div>'}),{status:403})
    assert.deepEqual(await readdir(outside),[])
  } finally {await unlink(link);await rm(outside,{recursive:true,force:true})}
  checks.push('authorized-real-output-and-durable-reference')
})

test('state is personal and bounded, fixed resources require a live page, and closed tokens fail', async () => {
  const p = await page('personal-state')
  const otherChannel='visualize-other-channel'
  await seedRoom({...actor(),projectId,agentId,channelId:otherChannel})
  const crossChannel=await fetch(base.replace(channelId,otherChannel)+`/pages/${p.pageId}/state`,{headers:{...headers(),'x-visualize-page-token':p.token}})
  assert.equal(crossChannel.status,410)
  const state = { modelContent: { angle: 30 }, privateContent: { secret: 'private-only' } }
  assert.equal((await http(`/pages/${p.pageId}/state`, 'PUT', {state}, p.token)).status, 200)
  assert.deepEqual(await getVisualizeState({ ...actor(), path: p.path }), state)
  const first = await readVisualizePageState(p)
  const second = await saveVisualizePageState({...p, state})
  assert.ok(second.revision > first.revision)
  assert.deepEqual(await readVisualizePageState(p), second)
  assert.equal(await getVisualizeState({ ...actor(), userId: 'visualize-peer', path: p.path }), null)
  const model = await listVisualizeModelState(actor())
  assert.equal(JSON.stringify(model).includes('private-only'), false)
  assert.equal((await http(`/pages/${p.pageId}/state`, 'PUT', {state: {modelContent: 'x'.repeat(16384)}}, p.token)).status, 400)
  assert.equal((await http(`/pages/${p.pageId}/state`)).status, 403)
  assert.equal((await http(`/pages/${p.pageId}/state`, 'GET', undefined, 'forged')).status, 410)
  const css = await http(`/pages/${p.pageId}/resources?name=visualize.css`, 'GET', undefined, p.token)
  assert.equal(css.status, 200); assert.equal(css.headers.get('cache-control'), 'no-store'); assert.ok((await css.text()).length > 100)
  assert.ok((await readVisualizeResource({ ...p, name: 'vendor/d3-7.9.0.min.js' })).bytes.length > 100)
  assert.ok((await readVisualizeResource({ ...p, name: 'tweak.js' })).bytes.length > 100)
  const runtime = await readVisualizeResource({...p,name:'gen-ui.js'})
  const manifest = JSON.parse(await readFile('server/assets/visualize-runtime/manifest.json','utf8'))
  assert.equal(createHash('sha256').update(runtime.bytes).digest('hex'),manifest.files['gen-ui.js'].sha256)
  assert.equal((await http(`/pages/${p.pageId}/resources?name=../../env`, 'GET', undefined, p.token)).status, 403)
  await pool.query(`INSERT INTO im_visualize_documents(company_id,channel_id,path,run_id,agent_id,created_by,html,source_hash)
    SELECT company_id,channel_id,regexp_replace(path,'[^/]+$','eviction-'||i||'.html'),run_id,agent_id,created_by,html,source_hash
    FROM im_visualize_documents CROSS JOIN generate_series(1,102) i WHERE company_id=$1 AND channel_id=$2 AND path=$3`, [companyId, channelId, p.path])
  await pool.query(`INSERT INTO im_visualize_states(company_id,channel_id,path,user_id,state,updated_at)
    SELECT company_id,channel_id,path,$3,jsonb_build_object('modelContent',repeat('x',8000),'privateContent','not-for-model'),NOW()-INTERVAL '1 day'
    FROM im_visualize_documents WHERE company_id=$1 AND channel_id=$2 AND path LIKE '%/eviction-%.html'`, [companyId, channelId, userId])
  await saveVisualizePageState({...p, state})
  assert.equal((await pool.query('SELECT count(*)::int n FROM im_visualize_states WHERE company_id=$1 AND channel_id=$2 AND user_id=$3', [companyId,channelId,userId])).rows[0].n, 100)
  assert.ok(Buffer.byteLength(buildGenUiModelContext((await listVisualizeModelState(actor())).map(entry=>({...entry,state:{...entry.state,privateContent:null}})))) <= 64 * 1024 + 128)
  const removed = (await pool.query(`SELECT doc.path FROM im_visualize_documents doc LEFT JOIN im_visualize_states state
    ON state.company_id=doc.company_id AND state.channel_id=doc.channel_id AND state.path=doc.path AND state.user_id=$3
    WHERE doc.company_id=$1 AND doc.channel_id=$2 AND doc.path LIKE '%/eviction-%.html' AND state.path IS NULL LIMIT 1`, [companyId,channelId,userId])).rows[0]
  const eviction = await getVisualizeStateSnapshot({...actor(),path: removed.path})
  assert.equal(eviction.state, null); assert.ok(eviction.revision > second.revision)

  await closeVisualizePage(p)
  await assert.rejects(readVisualizePageState(p), { status: 410 })
  await assert.rejects(readVisualizeResource({ ...p, name: 'visualize.css' }), { status: 410 })
  checks.push('personal-state-resource-allowlist-and-revocation')
})

test('replacement documents and revoked membership invalidate every old page capability', async () => {
  const p = await page('replacement')
  await draft('replacement', '<div>Replacement</div>')
  await assert.rejects(saveVisualizePageState({ ...p, state: { modelContent: 1 } }), { status: 410 })
  await closeVisualizePage(p); await closeVisualizePage(p)
  assert.equal((await http('/pages', 'POST', { path: p.path, sourceMessageId: p.sourceMessageId, instanceKey: 'old-message' })).status, 403)
  const moved=await page('moved-project')
  const nextProject='visualize-new-project'
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by) VALUES($1,$2,'INSTITUTIONAL_COURSE','Other project',$3)`,[nextProject,companyId,userId])
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')`,[nextProject,companyId,userId])
  await pool.query('UPDATE conversations SET project_id=$1 WHERE company_id=$2 AND id=$3',[nextProject,companyId,channelId])
  try {await assert.rejects(readVisualizePageState(moved),{status:410})}
  finally {await pool.query('UPDATE conversations SET project_id=$1 WHERE company_id=$2 AND id=$3',[projectId,companyId,channelId])}
  const current = await page('membership')
  await pool.query(`UPDATE conversations SET members=members-$3 WHERE company_id=$1 AND id=$2`, [companyId, channelId, userId])
  await assert.rejects(readVisualizePageState(current), { status: 403 })
  await pool.query(`UPDATE conversations SET members=members||to_jsonb(ARRAY[$3::text]) WHERE company_id=$1 AND id=$2`, [companyId, channelId, userId])
  checks.push('stale-revision-and-revoked-membership')
})

test('one-use gestures gate links and follow-ups and forged generic ingress is rejected', async () => {
  const p = await page('gestures')
  const link = { href: 'https://example.com/' }
  assert.equal((await http(`/pages/${p.pageId}/open-external`, 'POST', { ...link, gestureToken: '11111111-1111-4111-8111-111111111111' }, p.token)).status, 403)
  const gesture = await mintVisualizeGesture(p)
  assert.equal((await http(`/pages/${p.pageId}/open-external`, 'POST', {href: 'javascript:alert(1)', ...gesture}, p.token)).status, 403)
  assert.equal((await http(`/pages/${p.pageId}/open-external`, 'POST', {...link, ...gesture}, p.token)).status, 200)
  assert.equal((await http(`/pages/${p.pageId}/open-external`, 'POST', {...link, ...gesture}, p.token)).status, 403)
  const expired = await mintVisualizeGesture(p)
  await pool.query(`UPDATE im_visualize_gestures SET expires_at=NOW()-INTERVAL '1 second' WHERE page_id=$1`, [p.pageId])
  assert.equal((await http(`/pages/${p.pageId}/open-external`, 'POST', {...link, ...expired}, p.token)).status, 403)
  const payload = createNativeMessage({id: 'forged-follow-up', role: 'user', content: [{type: 'text', text: 'forged'}], custom: {visualizeFollowUp: {path: p.path}, mentionedIds: [agentId]}})
  await assert.rejects(assertInteractionAdmission({...actor(), clientNonce: payload.id, payload}), {status: 403})
  checks.push('one-use-expiring-gestures-and-forged-ingress')
})

test('durable follow-up JSONB retries reconcile a lost ACK without duplicate messages', async () => {
  const p = await page('durable-follow-up'), gesture = await mintVisualizeGesture(p)
  const request = {prompt: 'Explain this chart @unrelated-user', ...gesture, idempotencyKey: 'lost-ack'}
  const send = wukongClient().sendMessage.bind(wukongClient())
  wukongClient().sendMessage = async (...args) => { await send(...args); throw new Error('fixture ACK lost') }
  try { await assert.rejects(submitVisualizeFollowUp({...p, request})) } finally { wukongClient().sendMessage = send }
  const before = recording.messages.length
  const result = await submitVisualizeFollowUp({...p, request})
  assert.equal(result.status, 'accepted'); assert.equal(result.duplicate, true)
  assert.equal(recording.messages.length, before)
  const replay = await submitVisualizeFollowUp({...p, request})
  assert.equal(replay.duplicate, true)
  await assert.rejects(submitVisualizeFollowUp({...p, request: {...request, prompt: 'changed'}}), {status: 409})
  const follow = recording.messages.at(-1)!
  assert.deepEqual(follow.payload.metadata.custom.mentionedIds, [agentId])
  checks.push('jsonb-idempotency-and-lost-ack-reconciliation')
})

test('document replacement waits for an admitted state transaction and capacity is bounded', async () => {
  const p = await page('concurrent-state')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await assertVisualizePage(client, {...p, userId: 'visualize-peer'}) .catch(error => assert.equal(error.status, 410))
    await assertVisualizePage(client, p)
    let completed = false
    const replacement = draft('concurrent-state', '<div>Changed concurrently</div>').then(value => { completed = true; return value })
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(completed, false)
    await client.query('COMMIT'); await replacement
    await assert.rejects(saveVisualizePageState({...p, state: {modelContent: 'late'}}), {status: 410})
  } finally { await client.query('ROLLBACK'); client.release() }
  const revoke = await page('concurrent-revocation')
  const authorization = await pool.connect()
  try {
    await authorization.query('BEGIN')
    await assertVisualizePage(authorization, revoke, true)
    let revoked = false
    const removal = pool.query(`UPDATE conversations SET members=members-$3 WHERE company_id=$1 AND id=$2`, [companyId,channelId,userId]).then(() => { revoked = true })
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(revoked, false)
    await authorization.query('COMMIT'); await removal
    await assert.rejects(saveVisualizePageState({...revoke,state:{modelContent:'after revocation'}}), {status:403})
    await pool.query(`UPDATE conversations SET members=members||to_jsonb(ARRAY[$3::text]) WHERE company_id=$1 AND id=$2`, [companyId,channelId,userId])
  } finally { await authorization.query('ROLLBACK'); authorization.release() }
  const cap = await page('page-capacity')
  await pool.query(`UPDATE im_visualize_pages SET revoked_at=NOW() WHERE company_id=$1 AND user_id=$2 AND id<>$3`,[companyId,userId,cap.pageId])
  await pool.query(`INSERT INTO im_visualize_pages(id,company_id,channel_id,path,user_id,token_hash,instance_key,document_version,source_message_id,project_id)
    SELECT 'capacity-'||i,company_id,channel_id,path,user_id,token_hash,'capacity-'||i,document_version,source_message_id,project_id FROM im_visualize_pages
    CROSS JOIN generate_series(1,63) i WHERE id=$1`, [cap.pageId])
  assert.equal((await pool.query(`SELECT count(*)::int n FROM im_visualize_pages WHERE company_id=$1 AND user_id=$2 AND revoked_at IS NULL`,[companyId,userId])).rows[0].n,64)
  await assert.rejects(createVisualizePage({...actor(), request: {path: cap.path, sourceMessageId: cap.sourceMessageId, instanceKey: 'over-capacity'}}), {status: 429})
  await closeVisualizePage(cap)
  await createVisualizePage({...actor(), request: {path: cap.path, sourceMessageId: cap.sourceMessageId, instanceKey: 'capacity-released'}})
  checks.push('concurrent-document-lock-and-capacity')
})
