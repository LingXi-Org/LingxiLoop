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
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, teardownAll } from './_helpers.js'

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
    `INSERT INTO companies (id,name,slug,type,personal_owner_user_id,plan_id)
     VALUES ($1,'Course test',$1,'PERSONAL',$2,'plan-personal-free')`,
    [companyId, OWNER],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role) VALUES($1,$2,'OWNER')`,
    [companyId, OWNER],
  )
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status) VALUES
       ($1,$3,'human','Owner','O','#667085','avail'),
       ($2,$3,'human','Learner','L','#667085','avail')`,
    [OWNER, LEARNER, companyId],
  )
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,description,color,created_by,is_default)
     VALUES ($1,$2,'PERSONAL_LEARNING','我的学习','','#64748b',$3,TRUE)`,
    [`general-${companyId}`, companyId, OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'OWNER')`,
    [companyId, `general-${companyId}`, OWNER],
  )
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

test('[integration] learning dashboard crosses Companies only through actor memberships and returns real attempt facts', async () => {
  await seedCompany('co-dashboard-a')
  const courseA = await createCourse('Dashboard A', 'co-dashboard-a')
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id)
     VALUES ('co-dashboard-b','Dashboard school','co-dashboard-b','EDUCATION','plan-personal-free')`,
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role)
     VALUES ('co-dashboard-b',$1,'OWNER')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO education_contracts
       (id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ('contract-dashboard-b','co-dashboard-b','plan-personal-free','ACTIVE',
       NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
  )
  await pool.query(
    `INSERT INTO organization_seats (id,company_id,contract_id,user_id,status)
     VALUES ('seat-dashboard-b','co-dashboard-b','contract-dashboard-b',$1,'ACTIVE')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO projects
       (id,company_id,kind,name,description,color,created_by,is_default)
     VALUES ('project-dashboard-b','co-dashboard-b','INSTITUTIONAL_COURSE',
       'Dashboard B','','#2563eb',$1,FALSE)`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO courses (id,company_id,project_id,created_by)
     VALUES ('course-dashboard-b','co-dashboard-b','project-dashboard-b',$1)`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role)
     VALUES ('co-dashboard-b','project-dashboard-b',$1,'OWNER')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id)
     VALUES ('co-dashboard-no-seat','No seat school','co-dashboard-no-seat','EDUCATION','plan-personal-free')`,
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role)
     VALUES ('co-dashboard-no-seat',$1,'OWNER')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO projects
       (id,company_id,kind,name,description,color,created_by,is_default)
     VALUES ('project-dashboard-no-seat','co-dashboard-no-seat','INSTITUTIONAL_COURSE',
       'Must stay hidden','','#dc2626',$1,FALSE)`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO courses (id,company_id,project_id,created_by)
     VALUES ('course-dashboard-no-seat','co-dashboard-no-seat','project-dashboard-no-seat',$1)`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role)
     VALUES ('co-dashboard-no-seat','project-dashboard-no-seat',$1,'OWNER')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,description,color,created_by,is_default)
     VALUES ('project-not-member','co-dashboard-a','TEACHING','Hidden','','#000000',$1,FALSE)`,
    [OWNER],
  )

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
    'co-dashboard-a', 'co-dashboard-b',
  ])
  assert.equal(spaces.some((space) => space.projectId === 'project-not-member'), false)
  assert.equal(spaces.some((space) => space.projectId === 'project-dashboard-no-seat'), false)
  const personal = spaces.find((space) => space.projectId === 'general-co-dashboard-a')
  assert.deepEqual(personal && {
    perspective: personal.perspective,
    canManage: personal.canManage,
    canEditContent: personal.canEditContent,
    canUpdateCourse: personal.canUpdateCourse,
    canInviteMembers: personal.canInviteMembers,
    canRevokeInvitations: personal.canRevokeInvitations,
    canUpdateMembers: personal.canUpdateMembers,
    canRemoveMembers: personal.canRemoveMembers,
    canSubmit: personal.canSubmit,
    canReview: personal.canReview,
    lifecycleAction: personal.lifecycleAction,
  }, {
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

  await pool.query(`UPDATE projects SET status='TRANSFER_PENDING' WHERE id=$1`, [courseA.projectId])
  const transferPendingSpace = (await responseJson<{ data: DashboardSpace[] }>(
    await fetch(`${ownerUrl}/api/learning/spaces?limit=100`),
  )).data.find((space) => space.projectId === courseA.projectId)
  assert.deepEqual(transferPendingSpace && {
    canManage: transferPendingSpace.canManage,
    canEditContent: transferPendingSpace.canEditContent,
    canUpdateCourse: transferPendingSpace.canUpdateCourse,
    canInviteMembers: transferPendingSpace.canInviteMembers,
    canRevokeInvitations: transferPendingSpace.canRevokeInvitations,
    canUpdateMembers: transferPendingSpace.canUpdateMembers,
    canRemoveMembers: transferPendingSpace.canRemoveMembers,
    lifecycleAction: transferPendingSpace.lifecycleAction,
  }, {
    canManage: true,
    canEditContent: true,
    canUpdateCourse: false,
    canInviteMembers: false,
    canRevokeInvitations: false,
    canUpdateMembers: false,
    canRemoveMembers: false,
    lifecycleAction: null,
  })
  await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`, [courseA.projectId])

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
  await pool.query(
    `UPDATE project_memberships SET role='TA'
      WHERE company_id='co-dashboard-a' AND project_id=$1 AND user_id=$2`,
    [courseA.projectId, OWNER],
  )
  const taOverview = await fetch(
    `${ownerUrl}/api/projects/${courseA.projectId}/learning/overview?windowDays=30`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.equal((await responseJson<{ perspective: string }>(taOverview)).perspective, 'learner')
  await pool.query(
    `UPDATE project_memberships SET role='OWNER'
      WHERE company_id='co-dashboard-a' AND project_id=$1 AND user_id=$2`,
    [courseA.projectId, OWNER],
  )

  const learnerOverview = await fetch(
    `${ownerUrl}/api/projects/general-co-dashboard-a/learning/overview`,
    { headers: { 'x-company-id': 'co-dashboard-a' } },
  )
  assert.equal(
    (await responseJson<{ perspective: string }>(learnerOverview)).perspective,
    'learner',
  )

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

  for (const role of ['OBSERVER', 'TA'] as const) {
    await pool.query(
      `UPDATE project_memberships SET role=$1
        WHERE company_id='co-dashboard-a' AND project_id=$2 AND user_id=$3`,
      [role, courseA.projectId, LEARNER],
    )
    const readOnlyLearnerSpace = (await responseJson<{ data: DashboardSpace[] }>(
      await fetch(`${learnerUrl}/api/learning/spaces?limit=100`),
    )).data[0]
    assert.deepEqual(readOnlyLearnerSpace && {
      projectId: readOnlyLearnerSpace.projectId,
      perspective: readOnlyLearnerSpace.perspective,
      canManage: readOnlyLearnerSpace.canManage,
      canEditContent: readOnlyLearnerSpace.canEditContent,
      canUpdateCourse: readOnlyLearnerSpace.canUpdateCourse,
      canInviteMembers: readOnlyLearnerSpace.canInviteMembers,
      canRevokeInvitations: readOnlyLearnerSpace.canRevokeInvitations,
      canUpdateMembers: readOnlyLearnerSpace.canUpdateMembers,
      canRemoveMembers: readOnlyLearnerSpace.canRemoveMembers,
      canSubmit: readOnlyLearnerSpace.canSubmit,
      canReview: readOnlyLearnerSpace.canReview,
      lifecycleAction: readOnlyLearnerSpace.lifecycleAction,
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
      canSubmit: false,
      canReview: false,
      lifecycleAction: null,
    })
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

test('[integration] Education Company cannot use the Teaching creation entrypoint', async () => {
  await pool.query(
    `INSERT INTO users(id,email,display_name,email_verified_at)
     VALUES($1,'owner@test.local','Owner',NOW())`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,plan_id)
     VALUES('co-education-course','Education','education-course','EDUCATION','plan-personal-free')`,
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role)
     VALUES('co-education-course',$1,'OWNER')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES('contract-education-course','co-education-course','plan-personal-free','ACTIVE',
       NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES('seat-education-course','co-education-course','contract-education-course',$1,'ACTIVE')`,
    [OWNER],
  )
  const response = await fetch(`${ownerUrl}/api/courses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': 'co-education-course' },
    body: JSON.stringify({ name: 'Institutional course' }),
  })
  assert.equal(response.status, 403)
  assert.equal(
    (await pool.query(`SELECT COUNT(*)::int AS count FROM projects WHERE company_id='co-education-course'`)).rows[0].count,
    0,
  )
})

test('[integration] Project invitation replay is idempotent and never grants or downgrades Teacher', async () => {
  await seedCompany()
  const course = await createCourse('Mathematics')
  const learnerInvite = await inviteAndAccept(course.projectId)
  const replay = await fetch(`${learnerUrl}/api/project-invitations/${encodeURIComponent(learnerInvite.token)}/accept`, { method: 'POST' })
  assert.equal(replay.status, 200)
  assert.equal((await pool.query(`SELECT use_count FROM project_invitations WHERE token_hash=$1`, [learnerInvite.id])).rows[0].use_count, 1)

  await pool.query(`UPDATE project_memberships SET role='TEACHER' WHERE project_id=$1 AND user_id=$2`, [course.projectId, LEARNER])
  const teacherInvite = await inviteAndAccept(course.projectId)
  assert.equal((await pool.query(`SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2`, [course.projectId, LEARNER])).rows[0].role, 'TEACHER')
  assert.equal((await pool.query(`SELECT use_count FROM project_invitations WHERE token_hash=$1`, [teacherInvite.id])).rows[0].use_count, 0)

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
    `SELECT 1 FROM project_memberships WHERE project_id=$1 AND user_id=$2`,
    [course.projectId, LEARNER],
  )).rowCount, 0)

  const visible = await fetch(`${learnerUrl}/api/courses`, { headers: { 'x-company-id': 'co-courses' } })
  assert.equal(visible.status, 200)
  assert.deepEqual(await visible.json(), [])
})

test('[integration] course creator OWNER is immutable while other teachers can be removed', async () => {
  await seedCompany()
  const course = await createCourse('Teacher invariant')
  const teachers = ['u-company-teacher-a', 'u-company-teacher-b']
  await pool.query(
    `INSERT INTO users (id,email,display_name,email_verified_at) VALUES
       ($1,'teacher-a@test.local','Teacher A',NOW()),
       ($2,'teacher-b@test.local','Teacher B',NOW())`,
    teachers,
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role) VALUES
       ('co-courses',$1,'MEMBER'),('co-courses',$2,'MEMBER')`,
    teachers,
  )
  await pool.query(
    `INSERT INTO project_memberships (project_id,company_id,user_id,role) VALUES
       ($1,'co-courses',$2,'TEACHER'),($1,'co-courses',$3,'TEACHER')`,
    [course.projectId, ...teachers],
  )
  const removeOwnerFromCourse = await fetch(`${ownerUrl}/api/courses/${course.id}/members/${OWNER}`, {
    method: 'DELETE', headers: { 'x-company-id': 'co-courses' },
  })
  assert.equal(removeOwnerFromCourse.status, 409, await removeOwnerFromCourse.text())

  const downgradeOwner = await fetch(`${ownerUrl}/api/courses/${course.id}/members/${OWNER}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-company-id': 'co-courses' },
    body: JSON.stringify({ role: 'learner' }),
  })
  assert.equal(downgradeOwner.status, 409, await downgradeOwner.text())

  const removals = await Promise.all(teachers.map((teacherId) => fetch(
    `${ownerUrl}/api/companies/co-courses/members/${teacherId}`,
    { method: 'DELETE', headers: { 'x-company-id': 'co-courses' } },
  )))
  assert.deepEqual(removals.map((response) => response.status).sort(), [200, 200])
  assert.equal((await pool.query(
    `SELECT COUNT(*)::int AS count FROM project_memberships
      WHERE project_id=$1 AND status='ACTIVE' AND role IN ('OWNER','TEACHER')`,
    [course.projectId],
  )).rows[0].count, 1)
  assert.equal((await pool.query(
    `SELECT COUNT(*)::int AS count FROM company_memberships
      WHERE company_id='co-courses' AND user_id=ANY($1::text[])`,
    [teachers],
  )).rows[0].count, 0)
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
