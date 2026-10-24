import { randomUUID } from 'node:crypto'
import { insertCourse, findCourse } from '../modules/learning/courses-repository.js'

import assert from 'node:assert/strict'

import { createServer, type Server } from 'node:http'

import { after, before, beforeEach, test } from 'node:test'

import { type RawData, WebSocket } from 'ws'

import * as Y from 'yjs'

import { pool } from '../db/pool.js'

import { applyLocalUpdate } from '../modules/documents/public.js'

import { createWsTicket } from '../modules/identity/public.js'

import { __setCreateNotebookOverrideForTesting, __setUpdateNotebookOverrideForTesting } from '../modules/knowledge/provider.js'

import { attachWebSocket } from '../ws.js'

import { seedUserMembership, buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, teardownAll } from './_helpers.js'


const OWNER = 'u-course-owner'

const LEARNER = 'u-course-learner'

let ownerServer: Server

let learnerServer: Server

let ownerUrl = ''

let learnerUrl = ''


async function listen(userId: string, withWebSocket = false): Promise<{ server: Server; url: string }> {
  const app = await buildApiTestApp(userId)
  return await new Promise((resolve) => {
    const server = createServer(app)
    if (withWebSocket) attachWebSocket(server)
    server.listen(0, () => {
      const address = server.address()
      resolve({ server, url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` })
    })
  })
}


before(async () => {
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  __setCreateNotebookOverrideForTesting(async (input) => ({
    id: `notebook-${input.externalKey.replaceAll(':', '-')}`,
    name: input.name,
    description: input.description,
    archived: false,
    external_key: input.externalKey,
  }))
  __setUpdateNotebookOverrideForTesting(async (id, input) => ({
    id,
    name: input.name ?? 'Course notebook',
    description: input.description ?? '',
    archived: input.archived ?? false,
  }))
  await ensureSchemaOnce()
  const owner = await listen(OWNER); ownerServer = owner.server; ownerUrl = owner.url
  const learner = await listen(LEARNER, true); learnerServer = learner.server; learnerUrl = learner.url
})

beforeEach(async () => { installFakeWukong(); await resetAllTables() })

after(async () => {
  __setCreateNotebookOverrideForTesting(null)
  __setUpdateNotebookOverrideForTesting(null)
  delete process.env.OPEN_NOTEBOOK_ENABLED
  await teardownAll(ownerServer)
  if (learnerServer.listening) await new Promise<void>((resolve) => learnerServer.close(() => resolve()))
})


async function seedCompany(companyId = 'co-courses'): Promise<void> {
  await pool.query(
    `INSERT INTO users(id,email,display_name,email_verified_at)
     VALUES($1,'owner@test.local','Owner',NOW()) ON CONFLICT(id) DO NOTHING`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO users (id,email,display_name,email_verified_at)
     VALUES ($1,'learner@test.local','Learner',NOW()) ON CONFLICT(id) DO NOTHING`,
    [LEARNER],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id)
     VALUES ($1,'Course test',$1,'EDUCATION','plan-education')`,
    [companyId],
  )
  await seedUserMembership(OWNER,companyId)
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status) VALUES
       ($1,$3,'human','Owner','O','#667085','avail'),
       ($2,$3,'human','Learner','L','#667085','avail') ON CONFLICT DO NOTHING`,
    [OWNER, LEARNER, companyId],
  )
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,description,color,created_by,is_default)
     VALUES ($1,$2,'TEACHING','课程','','#64748b',$3,TRUE)`,
    [`general-${companyId}`, companyId, OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'TEACHER')`,
    [companyId, `general-${companyId}`, OWNER],
  )
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,$4)`,[`general-course-${companyId}`,companyId,`general-${companyId}`,OWNER])
}


async function createCourse(name: string, companyId = 'co-courses', kind: 'TEACHING' | 'INSTITUTIONAL_COURSE' = 'TEACHING') {
  const id = randomUUID(), projectId = randomUUID(), roomId = randomUUID()
  await insertCourse(pool, { companyId, userId: OWNER, courseId: id, projectId, roomId, kind, planId: 'plan-education',
    input: { name, description: `${name} description`, color: '#5266d6' } })
  return await findCourse(pool,id,companyId,OWNER) as { id: string; projectId: string; projectKind: string; studyRoomId: string }

}


async function createInvitation(
  projectId: string,
  companyId = 'co-courses',
  email: string | null = 'learner@test.local',
) {
  const created = await fetch(`${ownerUrl}/api/projects/${projectId}/invitations`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId },
    body: JSON.stringify({ email, expiresInDays: 7, maxUses: 1 }),
  })
  const createdRaw = await created.text()
  assert.equal(created.status, 201, createdRaw)
  return JSON.parse(createdRaw) as { token: string; id: string }
}


async function inviteAndAccept(projectId: string, companyId = 'co-courses') {
  const invitation = await createInvitation(projectId, companyId)
  const accepted = await fetch(`${learnerUrl}/api/project-invitations/${encodeURIComponent(invitation.token)}/accept`, { method: 'POST' })
  const acceptedRaw = await accepted.text()
  assert.equal(accepted.status, 200, acceptedRaw)
  return invitation
}


test('[integration] learner sees only enrolled courses and receives opaque 404 for another Project', async () => {
  await seedCompany()
  const first = await createCourse('Physics')
  const second = await createCourse('Chemistry')
  assert.equal(first.projectKind, 'TEACHING')
  assert.equal(second.projectKind, 'TEACHING')
  await inviteAndAccept(first.projectId)
  await pool.query(
    `INSERT INTO documents (id,company_id,project_id,title,created_by) VALUES
      ('doc-first','co-courses',$1,'First',$3),('doc-second','co-courses',$2,'Second',$3)`,
    [first.projectId, second.projectId, OWNER],
  )

  const courses = await fetch(`${learnerUrl}/api/courses`, { headers: { 'x-company-id': 'co-courses' } })
  assert.equal(courses.status, 200)
  assert.deepEqual((await courses.json() as Array<{ id: string }>).map((course) => course.id), [first.id])
  const allowed = await fetch(`${learnerUrl}/api/documents`, { headers: { 'x-company-id': 'co-courses', 'x-project-id': first.projectId } })
  assert.deepEqual((await allowed.json() as { documents: Array<{ id: string }> }).documents.map((document) => document.id), ['doc-first'])
  const denied = await fetch(`${learnerUrl}/api/documents/doc-second`, { headers: { 'x-company-id': 'co-courses', 'x-project-id': second.projectId } })
  assert.equal(denied.status, 404)
})


test('[integration] Project invitation replay is idempotent and never grants or downgrades Teacher', async () => {
  await seedCompany()
  const course = await createCourse('Mathematics')
  const learnerInvite = await inviteAndAccept(course.projectId)
  const replay = await fetch(`${learnerUrl}/api/project-invitations/${encodeURIComponent(learnerInvite.token)}/accept`, { method: 'POST' })
  assert.equal(replay.status, 200)
  assert.equal((await pool.query(`SELECT use_count FROM project_invitations WHERE token_hash=$1`, [learnerInvite.id])).rows[0].use_count, 1)

  await assert.rejects(pool.query(`UPDATE project_memberships SET role='TEACHER' WHERE project_id=$1 AND user_id=$2`,[course.projectId,LEARNER]))

  const ended = await fetch(`${ownerUrl}/api/projects/${course.projectId}/end`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId },
    body: '{}',
  })
  assert.equal(ended.status, 200, await ended.text())
  const readOnly = await fetch(`${ownerUrl}/api/projects/${course.projectId}/enter-read-only`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId },
    body: '{}',
  })
  assert.equal(readOnly.status, 200, await readOnly.text())
  const archived = await fetch(`${ownerUrl}/api/projects/${course.projectId}/archive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId },
    body: '{}',
  })
  assert.equal(archived.status, 200, await archived.text())
  const write = await fetch(`${learnerUrl}/api/documents`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId }, body: JSON.stringify({ title: 'Blocked' }) })
  assert.equal(write.status, 403)
})


test('[integration] concurrent Project invitations converge on one Student membership', async () => {
  await seedCompany()
  const course = await createCourse('Concurrency')
  const [teacherInvite, learnerInvite] = await Promise.all([
    createInvitation(course.projectId, 'co-courses', null),
    createInvitation(course.projectId, 'co-courses', null),
  ])
  const responses = await Promise.all([teacherInvite, learnerInvite].map((invitation) => fetch(
    `${learnerUrl}/api/project-invitations/${encodeURIComponent(invitation.token)}/accept`,
    { method: 'POST' },
  )))
  assert.deepEqual(responses.map((response) => response.status), [200, 200])
  assert.equal((await pool.query(
    `SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2`,
    [course.projectId, LEARNER],
  )).rows[0].role, 'STUDENT')
})


test('[integration] removing a member invalidates replay of their consumed course invitation', async () => {
  await seedCompany()
  const course = await createCourse('Replay revocation')
  const invitation = await inviteAndAccept(course.projectId)

  const removed = await fetch(`${ownerUrl}/api/courses/${course.id}/members/${LEARNER}`, {
    method: 'DELETE', headers: { 'x-company-id': 'co-courses' },
  })
  assert.equal(removed.status, 200, await removed.text())
  const replay = await fetch(
    `${learnerUrl}/api/project-invitations/${encodeURIComponent(invitation.token)}/accept`,
    { method: 'POST' },
  )
  assert.equal(replay.status, 410, await replay.text())
  assert.equal((await pool.query(
    `SELECT 1 FROM project_memberships WHERE project_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [course.projectId, LEARNER],
  )).rowCount, 0)

  const visible = await fetch(`${learnerUrl}/api/courses`, { headers: { 'x-company-id': 'co-courses' } })
  assert.equal(visible.status, 200)
  assert.deepEqual(await visible.json(), [])
})


function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error('timed out waiting for WebSocket message'))
    }, timeoutMs)
    const onMessage = (raw: RawData) => {
      let message: Record<string, unknown>
      try { message = JSON.parse(raw.toString()) as Record<string, unknown> } catch { return }
      if (!predicate(message)) return
      clearTimeout(timeout)
      socket.off('message', onMessage)
      resolve(message)
    }
    socket.on('message', onMessage)
  })
}


test('[integration] removing a course member revokes an existing document WebSocket subscription', async (t) => {
  await seedCompany()
  const course = await createCourse('Realtime security')
  await inviteAndAccept(course.projectId)
  await pool.query(
    `INSERT INTO documents (id,company_id,project_id,title,created_by)
     VALUES ('doc-live','co-courses',$1,'Live document',$2)`,
    [course.projectId, OWNER],
  )

  const { ticket } = await createWsTicket(LEARNER)
  const socket = new WebSocket(`${learnerUrl.replace('http://', 'ws://')}/ws?t=${encodeURIComponent(ticket)}`)
  t.after(() => socket.terminate())
  const hello = waitForSocketMessage(socket, (message) => message.type === 'hello')
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  await hello
  const synced = waitForSocketMessage(
    socket,
    (message) => message.documentId === 'doc-live' && (message.type === 'doc.sync' || message.type === 'doc.error'),
  )
  socket.send(JSON.stringify({ type: 'doc.subscribe', documentId: 'doc-live' }))
  const syncResult = await synced
  assert.equal(syncResult.type, 'doc.sync', JSON.stringify(syncResult))

  const removed = await fetch(`${ownerUrl}/api/courses/${course.id}/members/${LEARNER}`, {
    method: 'DELETE', headers: { 'x-company-id': 'co-courses' },
  })
  assert.equal(removed.status, 200, await removed.text())
  assert.equal(socket.readyState, WebSocket.OPEN)

  const receivedUpdates: Record<string, unknown>[] = []
  const capture = (raw: RawData) => {
    const message = JSON.parse(raw.toString()) as Record<string, unknown>
    if (message.type === 'doc.update' && message.documentId === 'doc-live') receivedUpdates.push(message)
  }
  socket.on('message', capture)
  const source = new Y.Doc()
  source.getText('content').insert(0, 'must not leak')
  await applyLocalUpdate('doc-live', 'co-courses', 'review-test', OWNER, Y.encodeStateAsUpdate(source))
  await new Promise((resolve) => setTimeout(resolve, 200))
  socket.off('message', capture)
  assert.equal(receivedUpdates.length, 0)
  socket.close()
})
test('[integration] course settings persist metadata and reject learner or cross-tenant edits', async () => {
  await seedCompany()
  const course = await createCourse('Before settings restore')
  await inviteAndAccept(course.projectId)
  const headers = { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId }
  const updated = await fetch(`${ownerUrl}/api/courses/${course.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: 'Restored course', description: 'Updated description' }),
  })
  assert.equal(updated.status, 200, await updated.text())
  const detail = await fetch(`${ownerUrl}/api/courses/${course.id}`, { headers })
  const saved = await detail.json() as { name: string; description: string }
  assert.equal(saved.name, 'Restored course')
  assert.equal(saved.description, 'Updated description')
  const denied = await fetch(`${learnerUrl}/api/courses/${course.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: 'Unauthorized edit' }),
  })
  assert.equal(denied.status, 403)
  const invalid = await fetch(`${ownerUrl}/api/courses/${course.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: '' }),
  })
  assert.equal(invalid.status, 400)
  const crossTenant = await fetch(`${ownerUrl}/api/courses/${course.id}`, {
    method: 'PATCH', headers: { ...headers, 'x-company-id': 'co-other-settings' }, body: JSON.stringify({ name: 'Cross tenant edit' }),
  })
  assert.ok([403, 404].includes(crossTenant.status))
})


// LL-088: both public metadata writers must agree with the capabilities shown
// in the UI. A rejected write must preserve the row and its durable effects.
for (const kind of ['TEACHING', 'INSTITUTIONAL_COURSE'] as const) {
  test(`[integration] ${kind} settings enforce student, teacher and administrator boundaries`, async (t) => {
    await seedCompany()
    const course = await createCourse('Authorization matrix', 'co-courses', kind)
    await inviteAndAccept(course.projectId)
    await pool.query("UPDATE company_memberships SET is_admin=FALSE WHERE user_id=$1", [OWNER])
    const adminId = 'u-settings-admin', outsiderId = 'u-settings-outsider'
    await seedUserMembership(adminId, 'co-courses', { role: 'TEACHER', isAdmin: true })
    await seedUserMembership(outsiderId, 'co-courses', { role: 'TEACHER', isAdmin: false })
    const admin = await listen(adminId), outsider = await listen(outsiderId)
    t.after(async () => {
      await Promise.all([admin.server, outsider.server].map(server => new Promise<void>(resolve => server.close(() => resolve()))))
    })
    const headers = { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId }
    const writers = [
      { path: `/api/courses/${course.id}`, method: 'PATCH' },
      { path: `/api/projects/${course.projectId}`, method: 'PUT' },
    ]
    const snapshot = async () => ({
      project: (await pool.query('SELECT name,description,color,avatar_url,avatar_seed,updated_at FROM projects WHERE id=$1', [course.projectId])).rows,
      audit: (await pool.query("SELECT id FROM audit_events WHERE kind='course_update' AND detail->>'courseId'=$1 ORDER BY id", [course.id])).rows,
      effects: (await pool.query("SELECT id,generation,queued_generation,payload FROM learning_effects WHERE course_id=$1 AND kind='course_metadata.sync' ORDER BY id", [course.id])).rows,
    })
    const write = async (url: string, writer: typeof writers[number], description: string, extraHeaders = {}) => {
      const response = await fetch(`${url}${writer.path}`, {
        method: writer.method, headers: { ...headers, ...extraHeaders }, body: JSON.stringify({ description }),
      })
      await response.text()
      return response.status
    }
    const studentIdentity = (await pool.query(`SELECT cm.role,cm.is_admin,pm.role AS project_role
      FROM company_memberships cm JOIN project_memberships pm ON pm.company_id=cm.company_id AND pm.user_id=cm.user_id
      WHERE cm.user_id=$1 AND pm.project_id=$2`, [LEARNER, course.projectId])).rows[0]
    assert.deepEqual(studentIdentity, { role: 'STUDENT', is_admin: false, project_role: 'STUDENT' })
    const spacesResponse = await fetch(`${learnerUrl}/api/learning/spaces`, { headers })
    assert.equal(spacesResponse.status, 200)
    const spaces = await spacesResponse.json() as { data: Array<{ projectId: string; perspective: string; canManage: boolean; canUpdateCourse: boolean }> }
    const space = spaces.data.find(item => item.projectId === course.projectId)
    assert.equal(space?.perspective, 'learner')
    assert.equal(space?.canManage, false)
    assert.equal(space?.canUpdateCourse, false)
    const studentDetail = await fetch(`${learnerUrl}/api/courses/${course.id}`, { headers })
    assert.equal(studentDetail.status, 200)
    const studentCourse = await studentDetail.json() as { courseRole: string; canManage: boolean }
    assert.equal(studentCourse.courseRole, 'learner')
    assert.equal(studentCourse.canManage, false)
    const adminDetail = await fetch(`${admin.url}/api/courses/${course.id}`, { headers })
    assert.equal(adminDetail.status, 200)
    assert.equal((await adminDetail.json() as { canManage: boolean }).canManage, true)
    for (const writer of writers) {
      const initial = await snapshot()
      // Browser-supplied roles/user IDs cannot replace the authenticated actor.
      assert.equal(await write(learnerUrl, writer, 'Student attempt', { 'x-user-id': OWNER, 'x-role': 'teacher' }), 403)
      assert.equal(await write(outsider.url, writer, 'Unassigned teacher attempt'), 404)
      assert.deepEqual(await snapshot(), initial)
      assert.equal(await write(ownerUrl, writer, `Teacher via ${writer.method}`), 200)
      assert.equal((await snapshot()).project[0].description, `Teacher via ${writer.method}`)
      // Organization administrators legitimately manage courses without a grant.
      assert.equal(await write(admin.url, writer, `Admin via ${writer.method}`), 200)
      assert.equal((await snapshot()).project[0].description, `Admin via ${writer.method}`)
      const allowed = await snapshot()
      assert.equal(await write(ownerUrl, writer, 'Forged company', { 'x-company-id': 'co-other-settings' }), 404)
      assert.deepEqual(await snapshot(), allowed)
    }
    await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE project_id=$1 AND user_id=$2", [course.projectId, OWNER])
    const beforeRevoked = await snapshot()
    for (const writer of writers) assert.equal(await write(ownerUrl, writer, 'Revoked teacher attempt'), 403)
    assert.deepEqual(await snapshot(), beforeRevoked)
    await pool.query("UPDATE projects SET status='READ_ONLY' WHERE id=$1", [course.projectId])
    const beforeReadonly = await snapshot()
    for (const writer of writers) assert.equal(await write(admin.url, writer, 'Read-only admin attempt'), 403)
    assert.deepEqual(await snapshot(), beforeReadonly)
  })
}
