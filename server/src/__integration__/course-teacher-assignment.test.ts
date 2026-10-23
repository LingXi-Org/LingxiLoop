import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { errorHandler } from '../http/errors.js'
import { companyAdminRouter } from '../modules/platform-operations/company-router.js'
import { insertCourse } from '../modules/learning/courses-repository.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model precedes this fixture in docs/evidence/issue-346/FAILURE-MODEL.md.
// Real product routers/database, injected synthetic identities, no provider calls.
const company = 'assignment-school', foreignCompany = 'assignment-other-school'
const admin = 'assignment-admin', teacher = 'assignment-teacher', student = 'assignment-student'
const outsider = 'assignment-outsider', otherTeacher = 'assignment-other-teacher', foreignTeacher = 'assignment-foreign-teacher'
const target = 'assignment-course', other = 'assignment-other-course', foreign = 'assignment-foreign-course'
const servers: Server[] = [], origins = new Map<string, string>(), receipts: object[] = []
async function listen(userId: string) {
  const app = await buildApiTestApp(userId)
  app.use('/management', companyAdminRouter); app.use(errorHandler)
  const server = createServer(app); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}
async function request<T = Record<string, unknown>>(actor: string, path: string, method = 'GET', body?: object, scope = company) {
  const response = await fetch(`${origins.get(actor)}${path}`, { method,
    headers: { 'content-type': 'application/json', 'x-company-id': scope },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  const text = await response.text()
  return { status: response.status, body: (text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text) as T }
}
const assignment = { kind: 'assignment', title: 'Synthetic teacher assignment', body: 'Explain a concept in your own words.', tags: [], links: [], attachments: [] }
const addBody = (key: string) => ({ role: 'TEACHER', idempotencyKey: `synthetic-${key}` })
const add = (actor: string, courseId: string, userId: string, key = `${courseId}-${userId}`) =>
  request(actor, `/management/courses/${courseId}/members/${userId}`, 'PUT', addBody(key))
const publish = (actor: string, courseId = target) => request(actor, `/api/courses/${courseId}/forum`, 'POST', assignment)
const denied = (status: number) => assert.ok([403, 404].includes(status), `expected opaque authorization denial, received ${status}`)

before(async () => {
  await ensureSchemaOnce()
  for (const actor of [admin, teacher, student, outsider, otherTeacher, foreignTeacher]) origins.set(actor, await listen(actor))
})
beforeEach(async () => {
  installFakeWukong(); await resetAllTables()
  for (const id of [company, foreignCompany]) await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id,status) VALUES($1,$1,$1,'EDUCATION','plan-education','ACTIVE')`, [id])
  for (const [id, role] of [[admin, 'TEACHER'], [teacher, 'TEACHER'], [student, 'STUDENT'], [outsider, 'TEACHER'], [otherTeacher, 'TEACHER']] as const) {
    await seedUserMembership(id, company, { role, isAdmin: id === admin })
  }
  await seedUserMembership(foreignTeacher, foreignCompany, { isAdmin: true })
  await pool.query('UPDATE users SET email_verified_at=NOW()')
  for (const [id, companyId, owner] of [[target, company, admin], [other, company, admin], [foreign, foreignCompany, foreignTeacher]]) {
    await insertCourse(pool, { companyId, userId: owner, projectId: `${id}-project`, courseId: id, roomId: `${id}-room`, kind: 'TEACHING', planId: 'plan-education',
      input: { name: id, description: '', color: '#5266d6' } })
  }
  for (const [courseId, userId, role] of [[target, student, 'STUDENT'], [other, otherTeacher, 'TEACHER']] as const) {
    await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,$4)`, [`${courseId}-project`, company, userId, role])
  }
})
after(async () => {
  await mkdir('artifacts/issue-346', { recursive: true })
  await writeFile('artifacts/issue-346/api.json', JSON.stringify({ syntheticOnly: true, originalCaseVerified: false,
    injectedAuthentication: true, realPostgres: true, productionOperations: 0, modelCalls: 0, receipts }, null, 2) + '\n')
  for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  await teardownAll()
})

test('company management offers only writable courses from its own authoritative company', async () => {
  await pool.query("UPDATE projects SET status='READ_ONLY' WHERE id=$1", [`${other}-project`])
  const courses = await request<Array<{ id: string; companyId: string }>>(admin, '/management/courses')
  assert.equal(courses.status, 200)
  assert.deepEqual(courses.body.map(row => row.id), [target])
  assert.ok(courses.body.every(row => row.companyId === company))
  for (const actor of [teacher, student, outsider, otherTeacher]) denied((await request(actor, '/management/courses')).status)
  denied((await add(admin, foreign, teacher)).status)
  denied((await add(admin, other, teacher)).status)
  assert.equal((await pool.query('SELECT count(*)::int n FROM project_memberships WHERE user_id=$1', [teacher])).rows[0].n, 0)
  receipts.push({ scenario: 'management-scope', ownWritableCourses: 1, foreignOrReadonlyDenied: true, nonAdminDenied: true })
})

test('explicit teacher assignment reads back in both member lists and permits publishing only in that course', async () => {
  denied((await publish(teacher)).status)
  const before = await request<Array<{ id: string }>>(admin, `/api/courses/${target}/members`)
  assert.equal(before.status, 200); assert.ok(!before.body.some(row => row.id === teacher))
  const saved = await add(admin, target, teacher)
  assert.equal(saved.status, 201, JSON.stringify(saved.body))
  const replay = await add(admin, target, teacher)
  assert.equal(replay.status, 201, JSON.stringify(replay.body))
  const members = await request<Array<{ id: string; role: string }>>(admin, `/api/courses/${target}/members`)
  assert.deepEqual(members.body.filter(row => row.id === teacher).map(row => row.role), ['teacher'])
  const companyMembers = await request<Array<{ id: string; courses: Array<{ courseId: string; role: string }> }>>(admin, `/api/companies/${company}/members`)
  assert.deepEqual(companyMembers.body.find(row => row.id === teacher)?.courses.map(row => [row.courseId, row.role]), [[target, 'teacher']])
  assert.equal((await publish(teacher)).status, 201)
  denied((await publish(teacher, other)).status)
  // A fresh HTTP context must resolve durable membership, not a stale token claim/cache.
  origins.set(teacher, await listen(teacher))
  assert.equal((await publish(teacher)).status, 201)
  assert.equal((await pool.query("SELECT count(*)::int n FROM project_memberships WHERE user_id=$1 AND status='ACTIVE'", [teacher])).rows[0].n, 1)
  receipts.push({ scenario: 'explicit-assignment', beforePublish: 'denied', afterPublish: 201, freshContextPublish: 201,
    courseMemberCount: 1, companyCourseCount: 1, duplicateGrantCount: 1, unrelatedPublish: 'denied' })
})

test('promotion keeps old student access revoked until one course is explicitly reassigned to the new teacher period', async () => {
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')`, [`${other}-project`, company, student])
  const oldPeriod = (await pool.query('SELECT period_id FROM company_memberships WHERE company_id=$1 AND user_id=$2', [company, student])).rows[0].period_id
  const promoted = await request(admin, `/api/companies/${company}/members/${student}/promote-teacher`, 'POST', { projectId: `${target}-project` })
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body))
  assert.equal((await pool.query("SELECT count(*)::int n FROM project_memberships WHERE user_id=$1 AND status='ACTIVE'", [student])).rows[0].n, 0)
  denied((await publish(student)).status)
  const assigned = await add(admin, target, student)
  assert.equal(assigned.status, 201, JSON.stringify(assigned.body))
  const membership = (await pool.query(`SELECT m.role,m.company_period_id,c.period_id FROM project_memberships m
    JOIN company_memberships c ON c.company_id=m.company_id AND c.user_id=m.user_id WHERE m.project_id=$1 AND m.user_id=$2`, [`${target}-project`, student])).rows[0]
  assert.equal(membership.role, 'TEACHER'); assert.equal(membership.company_period_id, membership.period_id); assert.notEqual(membership.period_id, oldPeriod)
  assert.equal((await publish(student)).status, 201)
  denied((await publish(student, other)).status)
  receipts.push({ scenario: 'promotion-and-explicit-reassignment', oldActiveCourses: 0, newActiveCourses: 1,
    freshTeacherPeriodBound: true, publish: 201, formerOtherCoursePublish: 'denied' })
})

test('students, nonmembers and other-course teachers cannot assign themselves or publish across courses', async () => {
  for (const actor of [student, outsider, otherTeacher]) {
    denied((await publish(actor)).status)
    denied((await add(actor, target, actor)).status)
    const direct = await request(actor, `/api/courses/${target}/members/${actor}`, 'PUT', addBody(`self-${actor}`))
    denied(direct.status)
  }
  for (const candidate of [student, foreignTeacher]) assert.equal((await add(admin, target, candidate)).status, 409)
  const malformed = await request(admin, `/management/courses/${target}/members/${teacher}`, 'PUT', { ...addBody('invalid'), role: 'STUDENT' })
  assert.equal(malformed.status, 400)
  assert.equal((await pool.query('SELECT count(*)::int n FROM course_forum_posts')).rows[0].n, 0)
  assert.equal((await pool.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2', [`${target}-project`, student])).rows[0].role, 'STUDENT')
  receipts.push({ scenario: 'negative-authority', deniedActorClasses: 3, invalidTargetClasses: 2, malformedRole: 400, unauthorizedPublishedPosts: 0 })
})

test('revoked membership is rechecked on the next request and failed assignments leave no grant', async () => {
  assert.equal((await add(admin, target, teacher)).status, 201)
  const removed = await request(admin, `/api/courses/${target}/members/${teacher}`, 'DELETE')
  assert.equal(removed.status, 200)
  denied((await publish(teacher)).status)
  await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [company, teacher])
  assert.equal((await add(admin, target, teacher, 'suspended')).status, 409)
  assert.equal((await pool.query("SELECT count(*)::int n FROM project_memberships WHERE user_id=$1 AND status='ACTIVE'", [teacher])).rows[0].n, 0)
  await pool.query('UPDATE company_memberships SET is_admin=FALSE WHERE company_id=$1 AND user_id=$2', [company, admin])
  denied((await request(admin, '/management/courses')).status)
  denied((await add(admin, target, outsider)).status)
  receipts.push({ scenario: 'fresh-authorization', removalImmediatelyDeniesPublish: true, suspendedTarget: 409, revokedAdminDenied: true, partialGrant: false })
})
