import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { WebSocket, type RawData } from 'ws'
import * as Y from 'yjs'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'
import { createWsTicket } from '../auth.js'
import { pool } from '../db/pool.js'
import { applyLocalUpdate } from '../documents/rooms.js'
import { attachWebSocket } from '../ws.js'

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
  await ensureSchemaOnce()
  const owner = await listen(OWNER); ownerServer = owner.server; ownerUrl = owner.url
  const learner = await listen(LEARNER, true); learnerServer = learner.server; learnerUrl = learner.url
})
beforeEach(resetAllTables)
after(async () => { await teardownAll(ownerServer); if (learnerServer.listening) await new Promise<void>((resolve) => learnerServer.close(() => resolve())) })

async function seedCompany(companyId = 'co-courses'): Promise<void> {
  await pool.query(`INSERT INTO companies (id,name,slug,owner_user_id) VALUES ($1,'Course test',$1,$2)`, [companyId, OWNER])
  await seedUserMembership(OWNER, companyId, { email: 'owner@test.local', displayName: 'Owner' })
  await pool.query(
    `INSERT INTO projects (id,company_id,name,description,color,created_by,is_general)
     VALUES ($1,$2,'General','','#64748b',$3,TRUE)`,
    [`general-${companyId}`, companyId, OWNER],
  )
  await pool.query(`INSERT INTO users (id,email,display_name,tier,email_verified_at) VALUES ($1,$2,'Learner','pro',NOW())`, [LEARNER, 'learner@test.local'])
}

async function createCourse(name: string, companyId = 'co-courses') {
  const response = await fetch(`${ownerUrl}/api/courses`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ name, description: `${name} description` }),
  })
  const raw = await response.text()
  assert.equal(response.status, 201, raw)
  return JSON.parse(raw) as { id: string; projectId: string; studyRoomId: string }
}

async function createInvitation(
  courseId: string,
  role: 'teacher' | 'learner',
  companyId = 'co-courses',
  email: string | null = 'learner@test.local',
) {
  const created = await fetch(`${ownerUrl}/api/courses/${courseId}/invitations`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ email, role, expiresInDays: 7, maxUses: 1 }),
  })
  const createdRaw = await created.text()
  assert.equal(created.status, 201, createdRaw)
  return JSON.parse(createdRaw) as { token: string; id: string }
}

async function inviteAndAccept(courseId: string, role: 'teacher' | 'learner', companyId = 'co-courses') {
  const invitation = await createInvitation(courseId, role, companyId)
  const accepted = await fetch(`${learnerUrl}/api/course-invitations/${encodeURIComponent(invitation.token)}/accept`, { method: 'POST' })
  const acceptedRaw = await accepted.text()
  assert.equal(accepted.status, 200, acceptedRaw)
  return invitation
}

test('[integration] learner sees only enrolled courses and receives opaque 404 for another Project', async () => {
  await seedCompany()
  const first = await createCourse('Physics')
  const second = await createCourse('Chemistry')
  await inviteAndAccept(first.id, 'learner')
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

test('[integration] course invitation replay is idempotent and teacher upgrade never downgrades', async () => {
  await seedCompany()
  const course = await createCourse('Mathematics')
  const learnerInvite = await inviteAndAccept(course.id, 'learner')
  const replay = await fetch(`${learnerUrl}/api/course-invitations/${encodeURIComponent(learnerInvite.token)}/accept`, { method: 'POST' })
  assert.equal(replay.status, 200)
  assert.equal((await pool.query(`SELECT use_count FROM course_invitations WHERE token_hash=$1`, [learnerInvite.id])).rows[0].use_count, 1)

  await inviteAndAccept(course.id, 'teacher')
  assert.equal((await pool.query(`SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`, [course.id, LEARNER])).rows[0].role, 'teacher')
  const downgrade = await inviteAndAccept(course.id, 'learner')
  assert.equal((await pool.query(`SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`, [course.id, LEARNER])).rows[0].role, 'teacher')
  assert.equal((await pool.query(`SELECT use_count FROM course_invitations WHERE token_hash=$1`, [downgrade.id])).rows[0].use_count, 0)

  await fetch(`${ownerUrl}/api/courses/${course.id}/archive`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses' }, body: '{}' })
  const write = await fetch(`${learnerUrl}/api/documents`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses', 'x-project-id': course.projectId }, body: JSON.stringify({ title: 'Blocked' }) })
  assert.equal(write.status, 409)
})

test('[integration] concurrent teacher and learner invitations preserve the teacher role', async () => {
  await seedCompany()
  const course = await createCourse('Concurrency')
  const [teacherInvite, learnerInvite] = await Promise.all([
    createInvitation(course.id, 'teacher', 'co-courses', null),
    createInvitation(course.id, 'learner', 'co-courses', null),
  ])
  const responses = await Promise.all([teacherInvite, learnerInvite].map((invitation) => fetch(
    `${learnerUrl}/api/course-invitations/${encodeURIComponent(invitation.token)}/accept`,
    { method: 'POST' },
  )))
  assert.deepEqual(responses.map((response) => response.status), [200, 200])
  assert.equal((await pool.query(
    `SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`,
    [course.id, LEARNER],
  )).rows[0].role, 'teacher')
})

test('[integration] removing a member invalidates replay of their consumed course invitation', async () => {
  await seedCompany()
  const course = await createCourse('Replay revocation')
  const invitation = await inviteAndAccept(course.id, 'learner')

  const removed = await fetch(`${ownerUrl}/api/courses/${course.id}/members/${LEARNER}`, {
    method: 'DELETE', headers: { 'x-company-id': 'co-courses' },
  })
  assert.equal(removed.status, 200, await removed.text())
  const replay = await fetch(
    `${learnerUrl}/api/course-invitations/${encodeURIComponent(invitation.token)}/accept`,
    { method: 'POST' },
  )
  assert.equal(replay.status, 410, await replay.text())
  assert.equal((await pool.query(
    `SELECT 1 FROM course_members WHERE course_id=$1 AND user_id=$2`,
    [course.id, LEARNER],
  )).rowCount, 0)

  const visible = await fetch(`${learnerUrl}/api/courses`, { headers: { 'x-company-id': 'co-courses' } })
  assert.equal(visible.status, 200)
  assert.deepEqual(await visible.json(), [])
})

test('[integration] concurrent company removals cannot delete every teacher from an active course', async () => {
  await seedCompany()
  const course = await createCourse('Teacher invariant')
  const teachers = ['u-company-teacher-a', 'u-company-teacher-b']
  await pool.query(
    `INSERT INTO users (id,email,display_name,tier,email_verified_at) VALUES
       ($1,'teacher-a@test.local','Teacher A','pro',NOW()),
       ($2,'teacher-b@test.local','Teacher B','pro',NOW())`,
    teachers,
  )
  await pool.query(
    `INSERT INTO company_members (company_id,user_id,role) VALUES
       ('co-courses',$1,'member'),('co-courses',$2,'member')`,
    teachers,
  )
  await pool.query(
    `INSERT INTO course_members (course_id,company_id,user_id,role) VALUES
       ($1,'co-courses',$2,'teacher'),($1,'co-courses',$3,'teacher')`,
    [course.id, ...teachers],
  )
  const removeOwnerFromCourse = await fetch(`${ownerUrl}/api/courses/${course.id}/members/${OWNER}`, {
    method: 'DELETE', headers: { 'x-company-id': 'co-courses' },
  })
  assert.equal(removeOwnerFromCourse.status, 200, await removeOwnerFromCourse.text())

  const removals = await Promise.all(teachers.map((teacherId) => fetch(
    `${ownerUrl}/api/companies/co-courses/members/${teacherId}`,
    { method: 'DELETE', headers: { 'x-company-id': 'co-courses' } },
  )))
  assert.deepEqual(removals.map((response) => response.status).sort(), [200, 409])
  assert.equal((await pool.query(
    `SELECT COUNT(*)::int AS count FROM course_members WHERE course_id=$1 AND role='teacher'`,
    [course.id],
  )).rows[0].count, 1)
  assert.equal((await pool.query(
    `SELECT COUNT(*)::int AS count FROM company_members
      WHERE company_id='co-courses' AND user_id=ANY($1::text[])`,
    [teachers],
  )).rows[0].count, 1)
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
  await inviteAndAccept(course.id, 'learner')
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
