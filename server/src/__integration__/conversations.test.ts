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
  input: { participantIds: string[]; title?: string },
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
    body: JSON.stringify({ clientNonce: 'created-conversation-message', payload: {
      version: 1, kind: 'text', clientMsgNo: 'created-conversation-message', body: '你好',
    } }),
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
