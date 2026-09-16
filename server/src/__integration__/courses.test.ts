import { storage } from '../storage.js'
import type { LearningGrowthLearner } from '../modules/learning/growth-repository.js'
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

async function createCourse(name: string, companyId = 'co-courses') {
  const response = await fetch(`${ownerUrl}/api/courses`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ name, description: `${name} description` }),
  })
  const raw = await response.text()
  assert.equal(response.status, 201, raw)
  return JSON.parse(raw) as { id: string; projectId: string; projectKind: string; studyRoomId: string }
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

async function responseJson<T>(response: Response): Promise<T> {
  const raw = await response.text()
  assert.equal(response.status, 200, raw)
  return JSON.parse(raw) as T
}

interface DashboardSpace {
  companyId: string
  projectId: string
  perspective: 'learner' | 'teacher'
  canManage: boolean
  canEditContent: boolean
  canUpdateCourse: boolean
  canInviteMembers: boolean
  canRevokeInvitations: boolean
  canUpdateMembers: boolean
  canRemoveMembers: boolean
  canSubmit: boolean
  canReview: boolean
  lifecycleAction: 'END' | 'ENTER_READ_ONLY' | 'ENTER_RETENTION' | 'ARCHIVE' | null
}

test('[integration] learning dashboard stays in the current company and follows course grants and returns real attempt facts', async () => {
  await seedCompany('co-dashboard-a')
  const courseA = await createCourse('Dashboard A', 'co-dashboard-a')
  await pool.query(`UPDATE company_memberships SET is_admin=FALSE WHERE user_id=$1`,[OWNER])
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by)
    VALUES('project-dashboard-b','co-dashboard-a','INSTITUTIONAL_COURSE','Dashboard B',$1),
          ('project-not-member','co-dashboard-a','TEACHING','Hidden',$1)`,[OWNER])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by)
    VALUES('course-dashboard-b','co-dashboard-a','project-dashboard-b',$1)`,[OWNER])
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role)
    VALUES('co-dashboard-a','project-dashboard-b',$1,'TEACHER')`,[OWNER])

  const firstPage = await fetch(`${ownerUrl}/api/learning/spaces?limit=1`)
  const first = await responseJson<{
    data: DashboardSpace[]
    nextCursor: string | null
  }>(firstPage)
  assert.equal(first.data.length, 1)
  assert.ok(first.nextCursor)
  const secondPage = await fetch(
    `${ownerUrl}/api/learning/spaces?limit=100&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
  )
  const second = await responseJson<typeof first>(secondPage)
  const spaces = [...first.data, ...second.data]
  assert.equal(spaces.length, 3)
  assert.equal(new Set(spaces.map((space) => space.projectId)).size, 3)
  assert.deepEqual([...new Set(spaces.map((space) => space.companyId))].sort(), [
    'co-dashboard-a',
  ])
  assert.equal(spaces.some((space) => space.projectId === 'project-not-member'), false)
  assert.equal(spaces.some((space) => space.projectId === 'project-dashboard-no-seat'), false)
  const activeOwner = spaces.find((space) => space.projectId === courseA.projectId)
  assert.deepEqual(activeOwner && {
    perspective: activeOwner.perspective,
    canManage: activeOwner.canManage,
    canEditContent: activeOwner.canEditContent,
    canUpdateCourse: activeOwner.canUpdateCourse,
    canInviteMembers: activeOwner.canInviteMembers,
    canRevokeInvitations: activeOwner.canRevokeInvitations,
    canUpdateMembers: activeOwner.canUpdateMembers,
    canRemoveMembers: activeOwner.canRemoveMembers,
    canSubmit: activeOwner.canSubmit,
    canReview: activeOwner.canReview,
    lifecycleAction: activeOwner.lifecycleAction,
  }, {
    perspective: 'teacher',
    canManage: true,
    canEditContent: true,
    canUpdateCourse: true,
    canInviteMembers: true,
    canRevokeInvitations: true,
    canUpdateMembers: true,
    canRemoveMembers: true,
    canSubmit: false,
    canReview: true,
    lifecycleAction: 'END',
  })

  await pool.query(`UPDATE projects SET status='COURSE_ENDED' WHERE id=$1`, [courseA.projectId])
  await pool.query(`UPDATE projects SET status='READ_ONLY' WHERE id='project-dashboard-b'`)
  const lifecycleSpaces = await responseJson<{ data: DashboardSpace[] }>(
    await fetch(`${ownerUrl}/api/learning/spaces?limit=100`),
  )
  const endedCourse = lifecycleSpaces.data.find((space) => space.projectId === courseA.projectId)
  assert.deepEqual(endedCourse && {
    canManage: endedCourse.canManage,
    canEditContent: endedCourse.canEditContent,
    canReview: endedCourse.canReview,
    lifecycleAction: endedCourse.lifecycleAction,
  }, {
    canManage: true,
    canEditContent: false,
    canReview: true,
    lifecycleAction: 'ENTER_READ_ONLY',
  })
  const institutionalReadOnly = lifecycleSpaces.data.find(
    (space) => space.projectId === 'project-dashboard-b',
  )
  assert.deepEqual(institutionalReadOnly && {
    canManage: institutionalReadOnly.canManage,
    canEditContent: institutionalReadOnly.canEditContent,
    canReview: institutionalReadOnly.canReview,
    lifecycleAction: institutionalReadOnly.lifecycleAction,
  }, {
    canManage: true,
    canEditContent: false,
    canReview: false,
    lifecycleAction: 'ENTER_RETENTION',
  })
  await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=ANY($1::text[])`, [
    [courseA.projectId, 'project-dashboard-b'],
  ])

  await inviteAndAccept(courseA.projectId, 'co-dashboard-a')
  await pool.query(
    `INSERT INTO projects
       (id,company_id,kind,name,description,color,status,created_by,is_default)
     VALUES ('project-dashboard-draft','co-dashboard-a','TEACHING',
       'Draft learner metadata','','#dc2626','DRAFT',$1,FALSE)`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO courses (id,company_id,project_id,created_by)
     VALUES ('course-dashboard-draft','co-dashboard-a','project-dashboard-draft',$1)`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role)
     VALUES ('co-dashboard-a','project-dashboard-draft',$1,'STUDENT')`,
    [LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_knowledge_units
       (id,company_id,project_id,title,success_criteria,target_level,status,created_by)
     VALUES ('unit-dashboard','co-dashboard-a',$1,'Fractions','Solve fractions',3,'PUBLISHED',$2)`,
    [courseA.projectId, OWNER],
  )
  await pool.query(
    `INSERT INTO learning_states
       (company_id,project_id,user_id,knowledge_unit_id,level,status,next_review_at,last_evidence_at)
     VALUES ('co-dashboard-a',$1,$2,'unit-dashboard',3,'VERIFIED',NOW()-INTERVAL '1 day',NOW())`,
    [courseA.projectId, LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_activities
       (id,company_id,project_id,title,instructions,kind,status,created_by)
     VALUES ('activity-dashboard','co-dashboard-a',$1,'Fraction practice','Show work','PRACTICE','PUBLISHED',$2)`,
    [courseA.projectId, OWNER],
  )
  await pool.query(
    `INSERT INTO evidence_records
       (id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id)
     VALUES ('evidence-dashboard','co-dashboard-a',$1,'L1','OBSERVED','activity_submission',$2,'{}','USER',$2)`,
    [courseA.projectId, LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_attempts
       (id,company_id,project_id,learner_id,activity_id,assistance,evidence_id,status)
     VALUES ('attempt-dashboard','co-dashboard-a',$1,$2,'activity-dashboard','NONE','evidence-dashboard','SUBMITTED')`,
    [courseA.projectId, LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_evaluations
       (id,company_id,project_id,attempt_id,demonstrated_level,confidence,evaluator_id,evaluator_kind,status)
     VALUES ('evaluation-dashboard','co-dashboard-a',$1,'attempt-dashboard',3,0.9,$2,'TEACHER','PENDING')`,
    [courseA.projectId, OWNER],
  )

  const reviews = await responseJson<Array<Record<string, unknown>>>(await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/reviews`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  ))
  assert.equal(reviews.length, 1)
  assert.deepEqual({
    id: reviews[0]?.id,
    learnerDisplayName: reviews[0]?.learner_display_name,
    hasEvidence: Object.hasOwn(reviews[0] ?? {}, 'evidence'),
    hasRubricResults: Object.hasOwn(reviews[0] ?? {}, 'rubric_results'),
  }, {
    id: 'evaluation-dashboard',
    learnerDisplayName: 'Learner',
    hasEvidence: false,
    hasRubricResults: false,
  })

  const teacherOverview = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/overview?windowDays=30`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  const teacher = await responseJson<{
    perspective: string
    summary: { learnerCount: number; attempts: number; pendingReviews: number }
  }>(teacherOverview)
  assert.equal(teacher.perspective, 'teacher')
  assert.deepEqual(
    {
      learnerCount: teacher.summary.learnerCount,
      attempts: teacher.summary.attempts,
      pendingReviews: teacher.summary.pendingReviews,
    },
    { learnerCount: 1, attempts: 1, pendingReviews: 1 },
  )
  await pool.query(`UPDATE projects SET status='READ_ONLY' WHERE id=$1`, [courseA.projectId])
  const readOnlyTeacherOverview = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/overview?windowDays=30`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.equal(
    (await responseJson<{ perspective: string }>(readOnlyTeacherOverview)).perspective,
    'teacher',
  )
  const readOnlyLearners = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/learners`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.equal(readOnlyLearners.status, 403, await readOnlyLearners.text())
  await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`, [courseA.projectId])
  const learners = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/learners`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.deepEqual(
    (await responseJson<{ data: Array<{ learnerId: string; attemptCount: number }> }>(learners)).data
      .map(({ learnerId, attemptCount }) => ({ learnerId, attemptCount })),
    [{ learnerId: LEARNER, attemptCount: 1 }],
  )
  const searchedLearners = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/learners?search=${encodeURIComponent('learner@test.local')}`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.deepEqual(
    (await responseJson<{ data: Array<{ learnerId: string }> }>(searchedLearners)).data
      .map(({ learnerId }) => learnerId),
    [LEARNER],
  )
  const unmatchedLearners = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/learners?search=not-a-learner`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.deepEqual(
    (await responseJson<{ data: Array<{ learnerId: string }> }>(unmatchedLearners)).data,
    [],
  )

  const learnerDetail = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/learners/${LEARNER}`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.equal(
    (await responseJson<{ summary: { attemptCount: number } }>(learnerDetail)).summary.attemptCount,
    1,
  )

  const attempt = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/attempts/attempt-dashboard`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  const detail = await responseJson<{
    attemptId: string
    learner: { learnerId: string }
    evaluations: unknown[]
  }>(attempt)
  assert.deepEqual(
    { attemptId: detail.attemptId, learnerId: detail.learner.learnerId, evaluations: detail.evaluations.length },
    { attemptId: 'attempt-dashboard', learnerId: LEARNER, evaluations: 1 },
  )

  const learnerSpaces = await fetch(`${learnerUrl}/api/learning/spaces?limit=100`)
  const studentSpace = (await responseJson<{ data: DashboardSpace[] }>(learnerSpaces)).data[0]
  assert.deepEqual(studentSpace && {
    projectId: studentSpace.projectId,
    perspective: studentSpace.perspective,
    canManage: studentSpace.canManage,
    canEditContent: studentSpace.canEditContent,
    canUpdateCourse: studentSpace.canUpdateCourse,
    canInviteMembers: studentSpace.canInviteMembers,
    canRevokeInvitations: studentSpace.canRevokeInvitations,
    canUpdateMembers: studentSpace.canUpdateMembers,
    canRemoveMembers: studentSpace.canRemoveMembers,
    canSubmit: studentSpace.canSubmit,
    canReview: studentSpace.canReview,
    lifecycleAction: studentSpace.lifecycleAction,
  }, {
    projectId: courseA.projectId,
    perspective: 'learner',
    canManage: false,
    canEditContent: false,
    canUpdateCourse: false,
    canInviteMembers: false,
    canRevokeInvitations: false,
    canUpdateMembers: false,
    canRemoveMembers: false,
    canSubmit: true,
    canReview: false,
    lifecycleAction: null,
  })

  for (const role of ['OBSERVER','TA','TEACHER']) {
    await assert.rejects(pool.query(`UPDATE project_memberships SET role=$1 WHERE project_id=$2 AND user_id=$3`,
      [role,courseA.projectId,LEARNER]))
  }

})

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

test('[integration] company teachers can create Teaching courses', async () => {
  await seedCompany()
  assert.equal((await createCourse('Teaching course')).projectKind,'TEACHING')
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

test('[integration] shared vine credits real evidence once, preserves the whole journey and isolates course peers', async () => {
  await seedCompany()
  const course = await createCourse('Growth')
  const otherCourse = await createCourse('Other growth')
  await inviteAndAccept(course.projectId)
  const peer = 'u-growth-peer'
  await pool.query(`INSERT INTO users(id,email,display_name) VALUES($1,'peer@test.local','Peer')`, [peer])
  await seedUserMembership(peer, 'co-courses', { role: 'STUDENT' })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES('co-courses',$1,$2,'STUDENT')`, [course.projectId, peer])
  await pool.query(
    `INSERT INTO learning_activities(id,company_id,project_id,title,instructions,kind,status,created_by)
     SELECT id,'co-courses',$1,id,'Private instructions','PRACTICE','PUBLISHED',$2
       FROM unnest(ARRAY['growth-a','growth-b','growth-rejected','growth-missing']) id`,
    [course.projectId, OWNER],
  )
  await pool.query(
    `INSERT INTO learning_knowledge_units(id,company_id,project_id,title,success_criteria,target_level,status,created_by)
     VALUES('growth-unit','co-courses',$1,'Private objective','Private criteria',3,'PUBLISHED',$2)`,
    [course.projectId, OWNER],
  )
  await pool.query(
    `INSERT INTO learning_states(company_id,project_id,user_id,knowledge_unit_id,level,status,last_evidence_at)
     VALUES('co-courses',$1,$2,'growth-unit',3,'VERIFIED','2025-03-01T00:00:00Z')`,
    [course.projectId, LEARNER],
  )
  for (const [id, activity, assistance, status, evaluated] of [
    ['guided', 'growth-a', 'GUIDED', 'EVALUATED', true],
    ['hint', 'growth-a', 'HINT', 'EVALUATED', true],
    ['independent', 'growth-a', 'NONE', 'EVALUATED', true],
    ['repeat', 'growth-a', 'NONE', 'EVALUATED', true],
    ['pending', 'growth-b', 'NONE', 'SUBMITTED', false],
    ['rejected', 'growth-rejected', 'NONE', 'REJECTED', true],
    ['mismatched', 'growth-missing', 'NONE', 'SUBMITTED', false],
  ] as const) {
    await pool.query(
      `INSERT INTO evidence_records(id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id)
       VALUES($1,'co-courses',$2,'L1','OBSERVED','activity_submission',$3,'{"answer":"PRIVATE_LEARNER_WORK"}','USER',$3)`,
      [`evidence-${id}`, course.projectId, id === 'mismatched' ? peer : LEARNER],
    )
    await pool.query(
      `INSERT INTO learning_attempts(id,company_id,project_id,learner_id,activity_id,assistance,evidence_id,status,submitted_at)
       VALUES($1,'co-courses',$2,$3,$4,$5,$6,$7,'2025-01-01T00:00:00Z')`,
      [`attempt-${id}`, course.projectId, LEARNER, activity, assistance, `evidence-${id}`, status],
    )
    await pool.query(
      `INSERT INTO learning_evaluations(id,company_id,project_id,attempt_id,demonstrated_level,confidence,evaluator_id,evaluator_kind,status)
       VALUES($1,'co-courses',$2,$3,2,0.9,$4,'TEACHER',$5)`,
      [`evaluation-${id}`, course.projectId, `attempt-${id}`, OWNER, evaluated ? 'ACCEPTED' : 'PENDING'],
    )
  }
  await pool.query(
    `INSERT INTO learning_missions(id,company_id,project_id,learner_id,conversation_id,trigger_client_msg_no,goal,success_criteria,created_by)
     VALUES('growth-mission','co-courses',$1,$2,$3,'growth-trigger','Private mission','Private criteria',$4)`,
    [course.projectId, LEARNER, course.studyRoomId, OWNER],
  )
  await pool.query(
    `INSERT INTO learning_mission_steps(id,company_id,project_id,mission_id,kind,description,success_criteria)
     VALUES('growth-a','co-courses',$1,'growth-mission','PRACTICE','Private step','Private criteria')`,
    [course.projectId],
  )
  await pool.query(
    `INSERT INTO evidence_records(id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id)
     VALUES('growth-step-evidence','co-courses',$1,'L1','OBSERVED','mission_work',$2,'{}','USER',$2)`,
    [course.projectId, LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_attempts(id,company_id,project_id,learner_id,mission_step_id,assistance,evidence_id,status,submitted_at)
     VALUES('growth-step-attempt','co-courses',$1,$2,'growth-a','HINT','growth-step-evidence','EVALUATED','2025-02-01T00:00:00Z')`,
    [course.projectId, LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_evaluations(id,company_id,project_id,attempt_id,demonstrated_level,confidence,evaluator_id,evaluator_kind,status)
     VALUES('growth-step-evaluation','co-courses',$1,'growth-step-attempt',2,0.9,$2,'TEACHER','ACCEPTED')`,
    [course.projectId, OWNER],
  )
  const headers = { 'x-company-id': 'co-courses' }
  const growth = async (base = learnerUrl, suffix = '') => responseJson<{ data: LearningGrowthLearner[]; nextCursor: string | null }>(
    await fetch(`${base}/api/projects/${course.projectId}/learning/growth${suffix}`, { headers }),
  )
  const initial = await growth()
  assert.deepEqual(initial, await growth(ownerUrl))
  assert.deepEqual(initial.data.map(({ learnerId, points, evidenceCount, acceptedCount, independentCount, masteryPoints }) => (
    { learnerId, points, evidenceCount, acceptedCount, independentCount, masteryPoints }
  )), [
    { learnerId: LEARNER, points: 21, evidenceCount: 3, acceptedCount: 2, independentCount: 1, masteryPoints: 9 },
    { learnerId: peer, points: 0, evidenceCount: 0, acceptedCount: 0, independentCount: 0, masteryPoints: 0 },
  ])
  assert.deepEqual(initial.data[0].waypoints, [
    { position: 6, evidenceCount: 1, objectiveCount: 0 },
    { position: 7, evidenceCount: 1, objectiveCount: 0 },
    { position: 12, evidenceCount: 1, objectiveCount: 0 },
    { position: 21, evidenceCount: 0, objectiveCount: 1 },
  ])
  assert.doesNotMatch(JSON.stringify(initial), /PRIVATE_LEARNER_WORK|Private objective|Private instructions|email|feedback|rubric|evidenceId/)
  await pool.query(`UPDATE learning_evaluations SET status='PENDING' WHERE id IN ('evaluation-independent','evaluation-repeat')`)
  assert.equal((await growth()).data[0].points, 20)
  await pool.query(`UPDATE learning_evaluations SET status='PENDING' WHERE id='evaluation-hint'`)
  assert.equal((await growth()).data[0].points, 19)
  await pool.query(`UPDATE learning_evaluations SET demonstrated_level=0 WHERE id='evaluation-guided'`)
  assert.equal((await growth()).data[0].points, 16)
  await pool.query(`UPDATE learning_evaluations SET status='ACCEPTED',demonstrated_level=2 WHERE id IN ('evaluation-independent','evaluation-repeat','evaluation-hint','evaluation-guided')`)
  const first = await growth(learnerUrl, '?limit=1')
  assert.equal(first.data.length, 1)
  assert.equal(first.nextCursor, LEARNER)
  const second = await growth(learnerUrl, `?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`)
  assert.deepEqual(second.data.map((item) => item.learnerId), [peer])
  assert.equal(second.nextCursor, null)
  const invalid = await fetch(`${learnerUrl}/api/projects/${course.projectId}/learning/growth?limit=101`, { headers })
  assert.equal(invalid.status, 400)
  const foreign = await fetch(`${learnerUrl}/api/projects/${otherCourse.projectId}/learning/growth`, { headers })
  assert.equal(foreign.status, 404)
  await pool.query(
    `INSERT INTO learning_activities(id,company_id,project_id,title,instructions,kind,status,created_by)
     SELECT 'growth-extra-'||n,'co-courses',$1,'Practice','','PRACTICE','PUBLISHED',$2 FROM generate_series(1,70) n`,
    [course.projectId, OWNER],
  )
  await pool.query(
    `INSERT INTO evidence_records(id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id)
     SELECT 'growth-evidence-'||n,'co-courses',$1,'L1','OBSERVED','activity_submission',$2,'{}','USER',$2 FROM generate_series(1,70) n`,
    [course.projectId, LEARNER],
  )
  await pool.query(
    `INSERT INTO learning_attempts(id,company_id,project_id,learner_id,activity_id,evidence_id)
     SELECT 'growth-attempt-'||n,'co-courses',$1,$2,'growth-extra-'||n,'growth-evidence-'||n FROM generate_series(1,70) n`,
    [course.projectId, LEARNER],
  )
  const history = (await growth()).data[0]
  assert.equal(history.points, 91)
  assert.equal(history.waypoints.length, 64)
  assert.equal(history.waypoints.at(-1)?.position, 91)
  assert.equal(history.waypoints.reduce((count, point) => count + point.evidenceCount, 0), 73)
  assert.equal(history.waypoints.reduce((count, point) => count + point.objectiveCount, 0), 1)

  await pool.query(`UPDATE company_memberships SET status='SUSPENDED' WHERE company_id='co-courses' AND user_id=$1`, [peer])
  assert.deepEqual((await growth()).data.map((item) => item.learnerId), [LEARNER])
  await pool.query(`UPDATE project_memberships SET status='SUSPENDED' WHERE company_id='co-courses' AND project_id=$1 AND user_id=$2`, [course.projectId, LEARNER])
  assert.deepEqual((await growth(ownerUrl)).data, [])
  assert.equal((await fetch(`${learnerUrl}/api/projects/${course.projectId}/learning/growth`, { headers })).status, 403)
})



test('[integration] profile and course avatars persist, share across views and enforce upload ownership and course lifecycle', async () => {
  await seedCompany()
  const course = await createCourse('Avatars')
  await inviteAndAccept(course.projectId)
  const headers = { 'content-type': 'application/json', 'x-company-id': 'co-courses' }
  const changeProfile = (input: unknown, base = ownerUrl) => fetch(`${base}/api/me/avatar`, { method: 'PUT', headers, body: JSON.stringify(input) })
  const changeCourse = (input: unknown, base = ownerUrl) => fetch(`${base}/api/courses/${course.id}`, { method: 'PATCH', headers, body: JSON.stringify(input) })
  const generated = await responseJson<{ avatarUrl: string; avatarSeed: string }>(await changeProfile({ seed: 'marbles-test' }))
  assert.equal(generated.avatarSeed, 'marbles-test')
  assert.ok(generated.avatarUrl.startsWith('data:image/svg+xml'))
  assert.equal((await pool.query('SELECT avatar_url FROM participants WHERE id=$1 AND company_id=$2', [OWNER, 'co-courses'])).rows[0].avatar_url, generated.avatarUrl)
  const me = await responseJson<{ user: { avatarUrl: string; avatarSeed: string } }>(await fetch(`${ownerUrl}/api/auth/me`))
  assert.deepEqual({ avatarUrl: me.user.avatarUrl, avatarSeed: me.user.avatarSeed }, generated)
  assert.equal((await changeProfile({ seed: 'other', userId: LEARNER })).status, 400)
  const courseAvatar = await responseJson<{ avatarUrl: string; avatarSeed: string }>(await changeCourse({ avatar: { seed: 'planets-test' } }))
  assert.equal(courseAvatar.avatarSeed, 'planets-test')
  const courseRead = await responseJson<{ avatarUrl: string; avatarSeed: string }>(await fetch(`${learnerUrl}/api/courses/${course.id}`, { headers }))
  assert.equal(courseRead.avatarUrl, courseAvatar.avatarUrl)
  const spaces = await responseJson<{ data: Array<{ projectId: string; avatarUrl: string }> }>(await fetch(`${learnerUrl}/api/learning/spaces`, { headers }))
  assert.equal(spaces.data.find((item) => item.projectId === course.projectId)?.avatarUrl, courseAvatar.avatarUrl)
  const projects = await responseJson<Array<{ id: string; avatarUrl: string }>>(await fetch(`${learnerUrl}/api/projects`, { headers }))
  assert.equal(projects.find((item) => item.id === course.projectId)?.avatarUrl, courseAvatar.avatarUrl)
  assert.equal((await changeCourse({ avatar: { seed: 'forbidden' } }, learnerUrl)).status, 403)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
  const upload = async (mime: string, body: Buffer) => {
    const signed = await responseJson<{ key: string }>(await fetch(`${ownerUrl}/api/uploads/presign`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'avatar.png', mime, size: body.length }),
    }))
    await storage.put(signed.key, body, mime)
    return signed.key
  }
  const key = await upload('image/png', png)
  assert.equal((await changeProfile({ key }, learnerUrl)).status, 403)
  assert.equal((await changeProfile({ key: 'attachments/another-company/unknown.png' })).status, 403)
  assert.equal((await changeProfile({ key: await upload('image/gif', png) })).status, 415)
  assert.equal((await changeProfile({ key: await upload('image/png', Buffer.from('not a picture')) })).status, 415)
  assert.equal((await changeProfile({ key: await upload('image/png', Buffer.alloc(5 * 1024 * 1024 + 1)) })).status, 413)
  const unchanged = await responseJson<{ user: { avatarUrl: string } }>(await fetch(`${ownerUrl}/api/auth/me`))
  assert.equal(unchanged.user.avatarUrl, generated.avatarUrl)
  const uploaded = await responseJson<{ avatarUrl: string; avatarSeed: null }>(await changeProfile({ key }))
  assert.match(uploaded.avatarUrl, /\/avatars\/co-courses\//)
  assert.equal(uploaded.avatarSeed, null)
  const savedCourse = await responseJson<{ avatarUrl: string; avatarSeed: null }>(await changeCourse({ avatar: { key } }))
  assert.match(savedCourse.avatarUrl, /\/avatars\/co-courses\//)
  assert.equal(savedCourse.avatarSeed, null)
  assert.notEqual(savedCourse.avatarUrl, uploaded.avatarUrl)
  // Changing the still-valid presigned source cannot change an already saved avatar.
  await storage.put(key, Buffer.from('replacement'), 'image/png')
  assert.deepEqual(await storage.readObject(new URL(uploaded.avatarUrl).pathname.slice(1)), png)
  await pool.query("UPDATE projects SET status='READ_ONLY' WHERE id=$1", [course.projectId])
  assert.equal((await changeCourse({ avatar: { seed: 'readonly' } })).status, 403)
  assert.equal((await pool.query('SELECT avatar_url FROM projects WHERE id=$1', [course.projectId])).rows[0].avatar_url, savedCourse.avatarUrl)
})
