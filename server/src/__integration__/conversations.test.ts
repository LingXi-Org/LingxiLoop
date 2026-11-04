import { createNativeMessage } from '../../../src/lib/nativeMessage'
/**
 * Integration tests for conversation list/search shaping.
 *
 * Direct conversation rows are shared by both participants, so the stored
 * `conversations.title` can only ever be correct for one viewer. The API must
 * return a viewer-specific title based on the other member instead.
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { WukongClient, _setWukongClientForTests } from '../im/wukong.js'
import {
  buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll,
  installFakeWukong,
} from './_helpers.js'
import { pool } from '../db/pool.js'
import { conversationsApplication, conversationInfrastructure } from '../modules/conversations/facade.js'

const ME_USER_ID = 'u-me'
const OTHER_USER_ID = 'u-ada'
let server: Server
let baseUrl = ''

before(async () => {
  await ensureSchemaOnce()
  installFakeWukong()
  const app = await buildApiTestApp(ME_USER_ID)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})
beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  await teardownAll(server)
})

async function seedHumanDirectWithSelfStoredTitle(): Promise<{ companyId: string; projectId: string; conversationId: string }> {
  const companyId = 'c-direct-title'
  const conversationId = 'direct-ada-yetone'
  const projectId = 'general-c-direct-title'
  await pool.query(
    `INSERT INTO companies (id, name, slug, type, plan_id)
     VALUES ($1, 'Direct Title Co', 'direct-title-co', 'EDUCATION', 'plan-education')`,
    [companyId],
  )
  await seedUserMembership(ME_USER_ID, companyId, {
    email: 'yetone@test.local',
    displayName: 'Yetone',
  })
  await seedUserMembership(OTHER_USER_ID, companyId, {
    role: 'STUDENT', email: 'ada@test.local',
    displayName: 'Ada',
  })
  await pool.query(
    `INSERT INTO projects (id, company_id, kind, name, color, created_by, is_default)
     VALUES ($1, $2, 'INSTITUTIONAL_COURSE', 'Course', '#667085', $3, TRUE)`,
    [projectId, companyId, ME_USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES
       ($1,$2,$3,'TEACHER'),($1,$2,$4,'STUDENT')`,
    [companyId, projectId, ME_USER_ID, OTHER_USER_ID],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id, project_id)
     VALUES ($1, 'direct', 'Yetone', $2::jsonb, 'human', $3, $4)`,
    [conversationId, JSON.stringify([OTHER_USER_ID, ME_USER_ID]), companyId, projectId],
  )
  return { companyId, projectId, conversationId }
}

test('[integration] retired GET /conversations has no compatibility data plane', async () => {
  const { companyId, projectId, conversationId } = await seedHumanDirectWithSelfStoredTitle()

  const res = await fetch(`${baseUrl}/api/conversations`, {
    headers: { 'x-company-id': companyId, 'x-project-id': projectId },
  })
  const raw = await res.text()
  assert.equal(res.status, 404, `${conversationId}: ${raw}`)
})

test('[integration] channels and paginated history survive durable retired records through the real IM HTTP client', async t => {
  // Failure cases: retired previews cause 500, channel/unread state disappears,
  // or tenant authorization is bypassed while loading IM summaries.
  const { companyId, projectId, conversationId } = await seedHumanDirectWithSelfStoredTitle()
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
    VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2 })])
  const rows = Array.from({ length: 9 }, (_, index) => {
    const sequence = index + 1
    const payload = sequence % 3 === 1 ? { type: 1001, ...createNativeMessage({ id: `native-${sequence}`, role: 'user',
      content: [{ type: 'text', text: `fixture-${sequence}` }] }) } : { type: 1, content: 'retired fixture' }
    return { message_seq: sequence, channel_id: conversationId, from_uid: ME_USER_ID,
      message_idstr: String(sequence), client_msg_no: `fixture-${sequence}`, payload: Buffer.from(JSON.stringify(payload)).toString('base64') }
  })
  const im = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString())
    response.setHeader('content-type', 'application/json')
    if (request.url === '/conversation/list') {
      assert.equal(input.uid, ME_USER_ID)
      response.end(JSON.stringify({ done: true, conversations: [{ channel_id: conversationId, channel_type: 2,
        unread: 3, last_message: { payload: rows[8].payload } }] }))
    } else {
      assert.equal(request.url, '/channel/messagesync')
      assert.equal(input.login_uid, ME_USER_ID)
      assert.equal(input.channel_id, conversationId)
      response.end(JSON.stringify({ messages: rows.filter(row => !input.start_message_seq || row.message_seq <= input.start_message_seq).slice(-input.limit) }))
    }
  })
  await new Promise<void>(resolve => im.listen(0, '127.0.0.1', resolve))
  const address = im.address(); assert.ok(address && typeof address === 'object')
  _setWukongClientForTests(new WukongClient({ apiUrl: `http://127.0.0.1:${address.port}`, wsUrl: 'ws://unused', apiToken: 'fixture', webhookSecret: 'fixture' }))
  t.after(async () => { installFakeWukong(); await new Promise<void>(resolve => im.close(() => resolve())) })
  const headers = { 'x-company-id': companyId, 'x-project-id': projectId }
  const response = await fetch(`${baseUrl}/api/im/channels`, { headers })
  assert.equal(response.status, 200, await response.clone().text())
  const channels = await response.json() as Array<{ id: string; title: string; unreadCount: number; lastMessage: unknown }>
  assert.deepEqual(channels.map(({ id, title, unreadCount, lastMessage }) => ({ id, title, unreadCount, lastMessage })),
    [{ id: conversationId, title: 'Ada', unreadCount: 3, lastMessage: null }])
  const history = async (query: string) => {
    const response = await fetch(`${baseUrl}/api/im/channels/${conversationId}/messages?${query}`, { headers })
    assert.equal(response.status, 200, await response.clone().text())
    return await response.json() as Array<{ messageSeq: number; payload: { id: string } }>
  }
  const latest = await history('limit=2'), older = await history('limit=2&beforeSeq=4')
  assert.deepEqual([latest.map(message => [message.messageSeq, message.payload.id]), older.map(message => [message.messageSeq, message.payload.id])],
    [[[4, 'native-4'], [7, 'native-7']], [[1, 'native-1']]])
  const denied = await fetch(`${baseUrl}/api/im/channels`, { headers: { ...headers, 'x-company-id': 'outside-company' } })
  assert.equal(denied.status, 403)
  const deniedHistory = await fetch(`${baseUrl}/api/im/channels/${conversationId}/messages`, { headers: { ...headers, 'x-company-id': 'outside-company' } })
  assert.equal(deniedHistory.status, 403)
  await mkdir('artifacts/im-channels', { recursive: true })
  await writeFile('artifacts/im-channels/retired-preview.json', JSON.stringify({ passed: true,
    checks: ['real-http-client', 'channels-200', 'channel-and-unread-preserved', 'retired-preview-null', 'mixed-history-200',
      'native-pages-filled', 'older-history-without-overlap', 'tenant-isolation'] }, null, 2))
})

test('[integration] GET /search uses the same perspective-specific direct title', async () => {
  const { companyId, projectId, conversationId } = await seedHumanDirectWithSelfStoredTitle()

  const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent('Ada')}`, {
    headers: { 'x-company-id': companyId, 'x-project-id': projectId },
  })
  const raw = await res.text()
  assert.equal(res.status, 200, raw)
  const body = JSON.parse(raw) as { rooms: Array<{ id: string; title: string }> }
  const direct = body.rooms.find((r) => r.id === conversationId)

  assert.equal(direct?.title, 'Ada')
})

async function seedCreationWorkspace() {
  const scope = await seedHumanDirectWithSelfStoredTitle()
  await pool.query('DELETE FROM conversations WHERE id=$1', [scope.conversationId])
  await seedUserMembership('u-lin', scope.companyId, { role: 'STUDENT', displayName: 'Lin' })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES ($1,$2,'u-lin','STUDENT')`,
    [scope.companyId, scope.projectId])
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
    VALUES ('a-tutor',$1,'agent','Tutor','T','transparent','avail')`, [scope.companyId])
  return scope
}

async function createConversation(
  scope: { companyId: string; projectId: string },
  input: { participantIds: string[]; title?: string; requestId?: string },
  expectedStatus = 201,
): Promise<{ id: string; created: boolean }> {
  const response = await fetch(`${baseUrl}/api/projects/${scope.projectId}/conversations`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': scope.companyId, 'x-project-id': scope.projectId },
    body: JSON.stringify(input),
  })
  const body = await response.json() as { id: string; created: boolean }
  assert.equal(response.status, expectedStatus, JSON.stringify(body))
  return body
}

test('[integration] new direct conversation is bound, listed and accepts a message', async () => {
  const scope = await seedCreationWorkspace()
  const created = await createConversation(scope, { participantIds: [OTHER_USER_ID] })
  assert.deepEqual(created, { id: created.id, created: true })
  assert.deepEqual(await createConversation(scope, { participantIds: [OTHER_USER_ID] }, 200), { id: created.id, created: false })
  const headers = { 'content-type': 'application/json', 'x-company-id': scope.companyId, 'x-project-id': scope.projectId }
  const listed = await fetch(`${baseUrl}/api/im/channels`, { headers })
  assert.equal(listed.status, 200)
  const channels = await listed.json() as Array<{ id: string; title: string; members: string[] }>
  assert.deepEqual(channels.map(({ id, title, members }) => ({ id, title, members })), [
    { id: created.id, title: 'Ada', members: [ME_USER_ID, OTHER_USER_ID] },
  ])
  const send = await fetch(`${baseUrl}/api/im/channels/${created.id}/messages/accept`, {
    method: 'POST', headers,
    body: JSON.stringify({ clientNonce: 'created-conversation-message', payload: createNativeMessage({ id: 'created-conversation-message', role: 'user', createdAt: new Date(0).toISOString(), content: [{ type: 'text', text: '你好' }] }) }),
  })
  const body = await send.json() as { status: string }
  assert.equal(send.status, 202, JSON.stringify(body))
  assert.equal(body.status, 'accepted')
})

test('[integration] concurrent starts by either human reuse one ordinary private conversation', async () => {
  const scope = await seedCreationWorkspace()
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => conversationsApplication.create({
    ...scope, userId: index % 2 ? OTHER_USER_ID : ME_USER_ID,
  }, { participantIds: [index % 2 ? ME_USER_ID : OTHER_USER_ID] })))
  assert.equal(new Set(results.map((result) => result.id)).size, 1)
  assert.equal(results.filter((result) => result.created).length, 1)
  assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1', [scope.companyId])).rowCount, 1)
})

test('[integration] existing ordinary private chat is reused without replacing history or its profile', async () => {
  const scope = await seedHumanDirectWithSelfStoredTitle()
  assert.deepEqual(await createConversation(scope, { participantIds: [OTHER_USER_ID] }, 200), {
    id: scope.conversationId, created: false,
  })
  await pool.query(`UPDATE im_channel_bindings SET profile=profile || '{"welcome":"retained"}'::jsonb WHERE channel_id=$1`, [scope.conversationId])
  await createConversation(scope, { participantIds: [OTHER_USER_ID] }, 200)
  assert.deepEqual((await pool.query(`SELECT title,members FROM conversations WHERE id=$1`, [scope.conversationId])).rows,
    [{ title: 'Yetone', members: [OTHER_USER_ID, ME_USER_ID] }])
  assert.equal((await pool.query(`SELECT profile->>'welcome' AS welcome FROM im_channel_bindings WHERE channel_id=$1`, [scope.conversationId])).rows[0].welcome, 'retained')
})

test('[integration] agent private chats reuse the learning context and teaching contexts stay separate', async () => {
  const scope = await seedCreationWorkspace()
  const learning = await createConversation(scope, { participantIds: ['a-tutor'] })
  assert.deepEqual(await createConversation(scope, { participantIds: ['a-tutor'] }, 200), { id: learning.id, created: false })
  assert.deepEqual((await pool.query(`SELECT context_type,channel_id FROM context_threads WHERE company_id=$1`, [scope.companyId])).rows,
    [{ context_type: 'LEARNING', channel_id: learning.id }])
  const teacher = await fetch(`${baseUrl}/api/projects/${scope.projectId}/context-threads/teacher`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': scope.companyId },
    body: JSON.stringify({ contextType: 'TEACHER_TAKEOVER', studentId: OTHER_USER_ID }),
  })
  const thread = await teacher.json() as { channelId: string }
  assert.equal(teacher.status, 201, JSON.stringify(thread))
  const direct = await createConversation(scope, { participantIds: [OTHER_USER_ID] })
  assert.notEqual(direct.id, thread.channelId)
})

test('[integration] group creation includes the creator, supports default names, and always makes a new group', async () => {
  const scope = await seedCreationWorkspace()
  const input = { participantIds: [OTHER_USER_ID, 'u-lin'], title: '  学习小组  ' }
  const first = await createConversation(scope, input)
  const second = await createConversation(scope, input)
  assert.notEqual(first.id, second.id)
  const generated = await createConversation(scope, { participantIds: [OTHER_USER_ID, 'a-tutor'] })
  const rows = await pool.query(`SELECT c.id,c.kind,c.title,c.members,b.profile->'members' AS bound_members
    FROM conversations c JOIN im_channel_bindings b ON b.channel_id=c.id WHERE c.id=ANY($1::text[]) ORDER BY c.title`,
    [[first.id, generated.id]])
  assert.deepEqual(rows.rows, [
    { id: generated.id, kind: 'group', title: 'Yetone、Ada、Tutor', members: [ME_USER_ID, OTHER_USER_ID, 'a-tutor'], bound_members: [ME_USER_ID, OTHER_USER_ID, 'a-tutor'] },
    { id: first.id, kind: 'group', title: '学习小组', members: [ME_USER_ID, OTHER_USER_ID, 'u-lin'], bound_members: [ME_USER_ID, OTHER_USER_ID, 'u-lin'] },
  ])
})

test('[integration] creation rejects malformed selections, unavailable and managed participants without writing rows', async () => {
  const scope = await seedCreationWorkspace()
  for (const input of [
    { participantIds: [] }, { participantIds: [ME_USER_ID] }, { participantIds: ['missing'] },
    { participantIds: [OTHER_USER_ID, OTHER_USER_ID] },
    { participantIds: Array.from({ length: 50 }, (_, index) => `user-${index}`) },
    { participantIds: [OTHER_USER_ID], title: 'x'.repeat(81) },
  ]) await createConversation(scope, input, 400)
  await pool.query(`UPDATE participants SET departed_at=NOW() WHERE id='a-tutor' AND company_id=$1`, [scope.companyId])
  await createConversation(scope, { participantIds: ['a-tutor'] }, 400)
  await pool.query(`UPDATE participants SET departed_at=NULL WHERE id='a-tutor' AND company_id=$1`, [scope.companyId])
  await pool.query(`INSERT INTO learning_project_teacher_agents(project_id,company_id,agent_id) VALUES($1,$2,'a-tutor')`, [scope.projectId, scope.companyId])
  await createConversation(scope, { participantIds: ['a-tutor'] }, 400)
  await createConversation(scope, { participantIds: [OTHER_USER_ID, 'a-tutor'] }, 400)
  await pool.query(`DELETE FROM project_memberships WHERE company_id=$1 AND user_id=$2`, [scope.companyId, OTHER_USER_ID])
  await createConversation(scope, { participantIds: [OTHER_USER_ID] }, 400)
  assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1', [scope.companyId])).rowCount, 0)
})

test('[integration] workspace authorization rejects foreign and read-only projects', async () => {
  const scope = await seedCreationWorkspace()
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('other-project',$1,'INSTITUTIONAL_COURSE','Other',$2)`, [scope.companyId, ME_USER_ID])
  await pool.query(`UPDATE company_memberships SET is_admin=FALSE WHERE company_id=$1 AND user_id=$2`, [scope.companyId, ME_USER_ID])
  await createConversation({ ...scope, projectId: 'other-project' }, { participantIds: [OTHER_USER_ID] }, 404)
  await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES('other-company','Other','other-company','EDUCATION','plan-education')`)
  await createConversation({ ...scope, companyId: 'other-company' }, { participantIds: [OTHER_USER_ID] }, 404)
  await pool.query(`UPDATE projects SET status='READ_ONLY' WHERE id=$1`, [scope.projectId])
  await createConversation(scope, { participantIds: [OTHER_USER_ID] }, 403)
  assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1', [scope.companyId])).rowCount, 0)
})

test('[integration] committed creation survives an IM sync outage for later reconciliation', async () => {
  const scope = await seedCreationWorkspace()
  const sync = conversationInfrastructure.syncChannel
  conversationInfrastructure.syncChannel = async () => { throw new Error('injected IM outage') }
  let id: string
  try {
    const created = await createConversation(scope, { participantIds: [OTHER_USER_ID, 'u-lin'] })
    id = created.id
    assert.equal((await pool.query('SELECT channel_id FROM im_channel_bindings WHERE channel_id=$1', [id])).rowCount, 1)
  } finally { conversationInfrastructure.syncChannel = sync }
  const { profile } = (await pool.query('SELECT profile FROM im_channel_bindings WHERE channel_id=$1', [id])).rows[0]
  await sync(profile)
})

// Failure model: personal deletion removes shared data; other members lose the
// room; retry duplicates preferences; restore fails; revoked/nonmember requests
// mutate preferences; a hidden room bypasses project authorization.
test('[integration] personal conversation deletion is reversible and retains shared history and membership', async () => {
  const { companyId, projectId, conversationId } = await seedHumanDirectWithSelfStoredTitle()
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,'{"channelType":2}')`, [conversationId, companyId])
  const headers = { 'x-company-id': companyId, 'x-project-id': projectId }
  const url = `${baseUrl}/api/conversations/${conversationId}`
  const channels = (removed = false) => fetch(`${baseUrl}/api/im/channels${removed ? '?removed=true' : ''}`, { headers })
    .then(response => response.json() as Promise<Array<{ id: string }>>)
  for (let i = 0; i < 2; i++) assert.equal((await fetch(url, { method: 'DELETE', headers })).status, 200)
  const hidden = await pool.query('SELECT user_id FROM conversation_list_removals WHERE conversation_id=$1', [conversationId])
  assert.deepEqual(hidden.rows, [{ user_id: ME_USER_ID }])
  assert.equal((await channels()).length, 0)
  const removed = await channels(true)
  assert.deepEqual(removed.map((room: { id: string }) => room.id), [conversationId])
  const { workspaceChannels } = await import('../im/channels-repository.js')
  assert.equal((await workspaceChannels(pool, { companyId, projectId, userId: OTHER_USER_ID })).length, 1)
  assert.deepEqual((await pool.query('SELECT members FROM conversations WHERE id=$1', [conversationId])).rows[0].members, [OTHER_USER_ID, ME_USER_ID])
  assert.equal((await fetch(`${url}/restore`, { method: 'POST', headers })).status, 200)
  assert.equal((await channels()).length, 1)
  await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1', [conversationId, JSON.stringify([OTHER_USER_ID])])
  assert.equal((await fetch(url, { method: 'DELETE', headers })).status, 404)
  assert.equal((await fetch(`${url}/restore`, { method: 'POST', headers })).status, 404)
  assert.equal((await channels(true)).length, 0)
  assert.equal((await pool.query('SELECT 1 FROM conversation_list_removals WHERE conversation_id=$1', [conversationId])).rowCount, 0)
})

// Failure model: docs/evidence/issue-327/FAILURE-MODEL.md (written before implementation).
test('[integration] six ordinary agents accept an authorized admin caller without an explicit project membership', async () => {
  const scope = await seedCreationWorkspace()
  const agents = ['a-tutor', 'a-two', 'a-three', 'a-four', 'a-five', 'a-six']
  for (const id of agents.slice(1)) await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
    VALUES($1,$2,'agent',$1,'A','transparent','avail')`, [id, scope.companyId])
  await pool.query('DELETE FROM project_memberships WHERE company_id=$1 AND project_id=$2 AND user_id=$3',
    [scope.companyId, scope.projectId, ME_USER_ID])
  const synchronized: string[][] = []
  const sync = conversationInfrastructure.syncChannel
  conversationInfrastructure.syncChannel = async profile => { synchronized.push(profile.members); await sync(profile) }
  try {
    const created = await createConversation(scope, { participantIds: agents })
    const rows = await pool.query(`SELECT c.kind,c.members,b.profile->'members' AS bound_members
      FROM conversations c JOIN im_channel_bindings b ON b.channel_id=c.id AND b.company_id=c.company_id
      WHERE c.id=$1 AND c.company_id=$2 AND c.project_id=$3`, [created.id,scope.companyId,scope.projectId])
    assert.deepEqual(rows.rows, [{ kind: 'group', members: [ME_USER_ID,...agents], bound_members: [ME_USER_ID,...agents] }])
    assert.deepEqual(synchronized, [[ME_USER_ID,...agents]])
    // Optional isolated real WuKong probe; ordinary CI still verifies the full
    // product synchronization path with its established recording adapter.
    if (process.env.ISSUE327_WUKONG_API_URL) {
      const url = new URL(process.env.ISSUE327_WUKONG_API_URL)
      assert.equal(url.hostname,'127.0.0.1','Real IM probe must target a disposable loopback service')
      const im = new WukongClient({apiUrl:url.origin,wsUrl:'ws://unused',apiToken:'fixture',webhookSecret:'fixture'})
      await im.upsertChannel({channelId:created.id,channelType:2,kind:'group',title:'fixture',members:[ME_USER_ID,...agents],pinned:false})
      for (const member of [ME_USER_ID,...agents]) {
        const message=await im.sendMessage(created.id,2,member,createNativeMessage({id:`probe-${member}`,role:'user',content:[{type:'text',text:'isolated membership probe'}]}))
        assert.ok(message.messageSeq>0)
      }
      await assert.rejects(()=>im.sendMessage(created.id,2,'not-a-member',createNativeMessage({id:'probe-denied',role:'user',content:[{type:'text',text:'isolated denied probe'}]})))
    }
    for (let i=0;i<2;i++) {
      const response = await fetch(`${baseUrl}/api/im/channels`, { headers: { 'x-company-id': scope.companyId, 'x-project-id': scope.projectId } })
      assert.equal(response.status, 200)
      const channels = await response.json() as Array<{ id: string; members: string[] }>
      assert.deepEqual(channels.find(channel => channel.id === created.id)?.members, [ME_USER_ID,...agents])
    }
    const humanDirect=await createConversation(scope,{participantIds:[OTHER_USER_ID]})
    const agentDirect=await createConversation(scope,{participantIds:['a-tutor']})
    assert.notEqual(humanDirect.id,agentDirect.id)
    // The caller exception must not grant membership to a selected administrator peer.
    await seedUserMembership('u-admin-peer',scope.companyId,{role:'TEACHER',isAdmin:true})
    await createConversation(scope, { participantIds: ['u-admin-peer','a-tutor'] },400)
    await pool.query('UPDATE company_memberships SET is_admin=FALSE WHERE company_id=$1 AND user_id=$2', [scope.companyId,ME_USER_ID])
    await createConversation(scope, { participantIds: agents },404)
    assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1',[scope.companyId])).rowCount,3)
  } finally { conversationInfrastructure.syncChannel=sync }
})

test('[integration] keyed group retries are durable, scoped, concurrent and payload-bound', async () => {
  const scope = await seedCreationWorkspace()
  const input = { participantIds: [OTHER_USER_ID,'a-tutor'], requestId: 'request-327-concurrent' }
  const responses = await Promise.all(Array.from({length:6}, () => fetch(`${baseUrl}/api/projects/${scope.projectId}/conversations`, {
    method: 'POST', headers: {'content-type':'application/json','x-company-id':scope.companyId,'x-project-id':scope.projectId}, body: JSON.stringify(input),
  })))
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,200,200,200,201])
  const bodies = await Promise.all(responses.map(r=>r.json())) as Array<{id:string}>
  assert.equal(new Set(bodies.map(r=>r.id)).size,1)
  assert.deepEqual(await createConversation(scope,input,200),{id:bodies[0].id,created:false})
  assert.deepEqual(await createConversation(scope,{...input,participantIds:[...input.participantIds].reverse()},200),{id:bodies[0].id,created:false})
  const conflict=await createConversation(scope,{...input,title:'different'},409)
  assert.equal((conflict as unknown as {code:string}).code,'creation_conflict')
  const fresh = await createConversation(scope,{...input,requestId:'request-327-new'})
  assert.notEqual(fresh.id,bodies[0].id)
  const otherActor = await conversationsApplication.create({...scope,userId:OTHER_USER_ID}, {...input,participantIds:[ME_USER_ID,'a-tutor']})
  assert.notEqual(otherActor.id,bodies[0].id)
  assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1',[scope.companyId])).rowCount,3)
  assert.equal((await pool.query('SELECT channel_id FROM im_channel_bindings WHERE company_id=$1',[scope.companyId])).rowCount,3)
  const otherProject={companyId:scope.companyId,projectId:'second-project'}
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by) VALUES($1,$2,'INSTITUTIONAL_COURSE','Second',$3)`,[otherProject.projectId,scope.companyId,ME_USER_ID])
  const sameKeyOtherProject=await createConversation(otherProject,{...input,participantIds:['a-tutor','a-second']},400)
  assert.equal((sameKeyOtherProject as unknown as {code:string}).code,'invalid_members')
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status) VALUES('a-second',$1,'agent','Second','S','transparent','avail')`,[scope.companyId])
  const otherGroup=await createConversation(otherProject,{...input,participantIds:['a-tutor','a-second']})
  assert.notEqual(otherGroup.id,bodies[0].id)
  await pool.query('DELETE FROM project_memberships WHERE company_id=$1 AND user_id=$2',[scope.companyId,OTHER_USER_ID])
  const invalid=await createConversation(scope,input,400)
  assert.equal((invalid as unknown as {code:string}).code,'invalid_members')
})

test('[integration] keyed creation rolls back before commit and retries after a channel outage', async () => {
  const scope=await seedCreationWorkspace()
  const input={participantIds:[OTHER_USER_ID,'a-tutor'],requestId:'request-327-outage'}
  const transaction=conversationInfrastructure.transaction
  conversationInfrastructure.transaction=work=>transaction(async db=>{await work(db);throw new Error('injected rollback before commit')})
  try { await createConversation(scope,input,500) } finally { conversationInfrastructure.transaction=transaction }
  assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1',[scope.companyId])).rowCount,0)
  assert.equal((await pool.query('SELECT channel_id FROM im_channel_bindings WHERE company_id=$1',[scope.companyId])).rowCount,0)
  const sync=conversationInfrastructure.syncChannel
  conversationInfrastructure.syncChannel=async()=>{throw new Error('injected IM outage')}
  let id: string
  try { id=(await createConversation(scope,input)).id } finally { conversationInfrastructure.syncChannel=sync }
  assert.deepEqual(await createConversation(scope,input,200),{id,created:false})
  assert.equal((await pool.query('SELECT id FROM conversations WHERE company_id=$1',[scope.companyId])).rowCount,1)
  assert.equal((await pool.query('SELECT channel_id FROM im_channel_bindings WHERE company_id=$1',[scope.companyId])).rowCount,1)
  await mkdir('artifacts/issue-327',{recursive:true})
  await writeFile('artifacts/issue-327/rollback-retry.json',JSON.stringify({passed:true,checks:['transaction-rollback-no-orphans','channel-outage-retains-binding','same-key-retry-one-conversation-one-binding']},null,2))
})


// #680 failure model: student creators cannot invite; invite opens private task
// history; stale company membership admits a peer; removals leave a leader in
// runtime policy; retries duplicate audit/history or erase existing messages.
test('[integration] room creators stage agent/teacher additions and removals with durable versioned boundaries', async t => {
  const scope = await seedCreationWorkspace()
  const student = createServer(await buildApiTestApp(OTHER_USER_ID)).listen(0)
  await new Promise<void>(resolve => student.once('listening', resolve))
  t.after(() => new Promise<void>(resolve => student.close(() => resolve())))
  const address = student.address() as { port: number }
  const { id } = await conversationsApplication.create({ ...scope, userId: OTHER_USER_ID }, { participantIds: [ME_USER_ID, 'u-lin'] })
  const headers = { 'content-type': 'application/json', 'x-company-id': scope.companyId, 'x-project-id': scope.projectId }
  const url = `http://127.0.0.1:${address.port}/api/conversations/${id}/members`
  const change = (member: string, method = 'POST') => fetch(method === 'DELETE' ? `${url}/${member}` : url, {
    method, headers, ...(method === 'POST' ? { body: JSON.stringify({ id: member }) } : {}),
  })
  const view = await fetch(url, { headers })
  assert.equal(view.status, 200)
  const state = await view.json() as { canManage: boolean; historyVisibility: string; candidates: Array<{ id: string }> }
  assert.equal(state.canManage, true)
  assert.equal(state.historyVisibility, 'shared_conversation')
  assert.ok(state.candidates.some(p => p.id === 'a-tutor'))
  const posted: unknown[] = [], updates: unknown[] = []
  const publishUpdated = conversationInfrastructure.publishUpdated
  conversationInfrastructure.publishUpdated = async event => { updates.push(event.patch) }
  const publish = conversationInfrastructure.postMembershipMessage
  conversationInfrastructure.postMembershipMessage = async input => { posted.push(input); return { queued: true } }
  try {
    for (let i = 0; i < 2; i++) assert.equal((await change('a-tutor')).status, 200)
    await seedUserMembership('u-teacher', scope.companyId, { role: 'TEACHER', displayName: 'Teacher' })
    await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,$2,'u-teacher','TEACHER')`, [scope.companyId, scope.projectId])
    assert.equal((await change('u-teacher')).status, 200)
    await pool.query(`UPDATE conversations SET leader_id='a-tutor' WHERE id=$1`, [id])
    assert.equal((await change('a-tutor', 'DELETE')).status, 200)
    assert.equal((await change('a-tutor', 'DELETE')).status, 200)
    assert.equal((await change(OTHER_USER_ID, 'DELETE')).status, 400)
    const row = (await pool.query(`SELECT c.members,c.leader_id,b.profile FROM conversations c JOIN im_channel_bindings b ON b.channel_id=c.id WHERE c.id=$1`, [id])).rows[0]
    assert.deepEqual(row.members, [OTHER_USER_ID, ME_USER_ID, 'u-lin', 'u-teacher'])
    assert.deepEqual(row.profile.members, row.members)
    assert.equal(row.leader_id, null)
    assert.equal(row.profile.leaderAgentId, undefined)
    assert.equal(row.profile.membershipVersion, 3)
    const audits = (await pool.query(`SELECT user_id,detail FROM audit_events WHERE kind='conversation.membership_changed' ORDER BY id`)).rows
    assert.equal(audits.length, 3)
    assert.deepEqual(audits.map(a => a.detail.version), [1,2,3])
    assert.ok(audits.every(a => a.user_id === OTHER_USER_ID && a.detail.historyVisibility === 'shared_conversation' && a.detail.projectId === scope.projectId))
    assert.equal(posted.length, 3)
    assert.deepEqual(updates, Array.from({ length: 5 }, () => ({ membershipChanged: true })))
    const { syncConversationPolicy } = await import('../agent-runtime/conversations.js')
    let policy: unknown
    await syncConversationPolicy({ conversations: { sync: async (value: unknown) => { policy = value } } } as never, scope.companyId, id)
    assert.ok(!(policy as { participants: Array<{ id: string }> }).participants.some(p => p.id === 'a-tutor'))
  } finally { conversationInfrastructure.postMembershipMessage = publish; conversationInfrastructure.publishUpdated = publishUpdated }
})

test('[integration] room member mutation rejects non-managers, foreign/stale peers and managed private contexts', async t => {
  const scope = await seedCreationWorkspace()
  const { id } = await createConversation(scope, { participantIds: [OTHER_USER_ID, 'u-lin'] })
  const headers = { 'content-type': 'application/json', 'x-company-id': scope.companyId, 'x-project-id': scope.projectId }
  const url = `${baseUrl}/api/conversations/${id}/members`
  const add = (participantId: string) => fetch(url, { method: 'POST', headers, body: JSON.stringify({ id: participantId }) })
  const student = createServer(await buildApiTestApp(OTHER_USER_ID)).listen(0)
  await new Promise<void>(resolve => student.once('listening', resolve))
  t.after(() => new Promise<void>(resolve => student.close(() => resolve())))
  const address = student.address() as { port: number }
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/conversations/${id}/members`, { method: 'POST', headers, body: JSON.stringify({ id: 'a-tutor' }) })).status, 403)
  await pool.query(`UPDATE im_channel_bindings SET profile=profile-'createdByUserId' WHERE channel_id=$1`, [id])
  // Established legacy rooms remain manageable by an active teacher already in the room.
  await seedUserMembership('u-outsider', scope.companyId, { role: 'STUDENT' })
  assert.equal((await add('u-outsider')).status, 400)
  assert.equal((await add('not-in-company')).status, 400)
  await pool.query(`UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2`, [scope.companyId, OTHER_USER_ID])
  assert.equal((await add(OTHER_USER_ID)).status, 400)
  await pool.query(`INSERT INTO context_threads(id,company_id,project_id,context_type,context_id,channel_id,created_by) VALUES('private-680',$1,$2,'CASE_DISCUSSION','private-680',$3,$4)`, [scope.companyId, scope.projectId, id, ME_USER_ID])
  assert.equal((await add('a-tutor')).status, 403)
  assert.equal((await fetch(`${url}/u-lin`, { method: 'DELETE', headers })).status, 403)
  assert.equal((await pool.query(`SELECT 1 FROM audit_events WHERE kind='conversation.membership_changed'`)).rowCount, 0)
  assert.deepEqual((await pool.query('SELECT members FROM conversations WHERE id=$1', [id])).rows[0].members, [ME_USER_ID, OTHER_USER_ID, 'u-lin'])
})

test('[integration] a teacher updates legacy shared groups without rewriting history and removed humans lose access', async t => {
  const scope = await seedCreationWorkspace()
  const { id } = await createConversation(scope, { participantIds: [OTHER_USER_ID, 'a-tutor'] })
  await pool.query(`UPDATE im_channel_bindings SET profile=profile-'createdByUserId' WHERE channel_id=$1`, [id])
  const payload = Buffer.from(JSON.stringify({ type: 1001, ...createNativeMessage({ id: 'original-evidence-680', role: 'user',
    content: [{ type: 'text', text: 'original student analysis' }] }) })).toString('base64')
  const im = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ messages: [{ message_seq: 1, channel_id: id, from_uid: OTHER_USER_ID,
      message_idstr: 'retained-680', client_msg_no: 'retained-680', timestamp: 1, payload }] }))
  }).listen(0)
  await new Promise<void>(resolve => im.once('listening', resolve))
  const imAddress = im.address() as { port: number }
  _setWukongClientForTests(new WukongClient({ apiUrl: `http://127.0.0.1:${imAddress.port}`, wsUrl: 'ws://unused', apiToken: 'fixture', webhookSecret: 'fixture' }))
  const sync = conversationInfrastructure.syncChannel, publish = conversationInfrastructure.postMembershipMessage
  conversationInfrastructure.syncChannel = async () => undefined
  conversationInfrastructure.postMembershipMessage = async () => ({ queued: true })
  t.after(async () => { conversationInfrastructure.syncChannel = sync; conversationInfrastructure.postMembershipMessage = publish; installFakeWukong(); await new Promise<void>(resolve => im.close(() => resolve())) })
  const headers = { 'content-type': 'application/json', 'x-company-id': scope.companyId, 'x-project-id': scope.projectId }
  const historyUrl = `${baseUrl}/api/im/channels/${id}/messages`
  const beforeHistory = await fetch(historyUrl, { headers })
  assert.equal(beforeHistory.status, 200)
  const original = await beforeHistory.json()
  assert.equal((await fetch(`${baseUrl}/api/conversations/${id}/members`, { method: 'POST', headers, body: JSON.stringify({ id: 'u-lin' }) })).status, 200)
  assert.equal((await fetch(`${baseUrl}/api/conversations/${id}/members/${OTHER_USER_ID}`, { method: 'DELETE', headers })).status, 200)
  const afterHistory = await fetch(historyUrl, { headers })
  assert.equal(afterHistory.status, 200)
  assert.deepEqual(await afterHistory.json(), original)
  assert.equal((original as unknown[]).length, 1)
  const removed = createServer(await buildApiTestApp(OTHER_USER_ID)).listen(0)
  await new Promise<void>(resolve => removed.once('listening', resolve))
  t.after(() => new Promise<void>(resolve => removed.close(() => resolve())))
  const address = removed.address() as { port: number }
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/im/channels/${id}/messages`, { headers })).status, 404)
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/conversations/${id}/members`, { headers })).status, 404)
  await pool.query(`UPDATE projects SET status='READ_ONLY' WHERE id=$1`, [scope.projectId])
  assert.equal((await fetch(`${baseUrl}/api/conversations/${id}/members`, { method: 'POST', headers, body: JSON.stringify({ id: OTHER_USER_ID }) })).status, 403)
  const readOnlyView = await fetch(`${baseUrl}/api/conversations/${id}/members`, { headers })
  assert.equal(readOnlyView.status, 200)
  assert.equal((await readOnlyView.json() as { canManage: boolean }).canManage, false)
})
