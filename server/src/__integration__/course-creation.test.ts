import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { errorHandler } from '../http/errors.js'
import { companyAdminRouter } from '../modules/platform-operations/company-router.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

const company = 'creation-school', admin = 'creation-admin', teacher = 'creation-teacher', student = 'creation-student'
const servers: Server[] = [], origins = new Map<string, string>()
before(async () => {
  await ensureSchemaOnce()
  for (const user of [admin, teacher, student]) {
    const app = await buildApiTestApp(user)
    app.use('/management', companyAdminRouter); app.use(errorHandler)
    const server = createServer(app); servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address(); assert.ok(address && typeof address === 'object')
    origins.set(user, `http://127.0.0.1:${address.port}`)
  }
})
beforeEach(async () => {
  installFakeWukong(); await resetAllTables()
  await pool.query("INSERT INTO companies(id,name,slug,type,plan_id,status) VALUES($1,$1,$1,'EDUCATION','plan-education','ACTIVE')", [company])
  await seedUserMembership(admin, company, { isAdmin: true })
  await seedUserMembership(teacher, company, { isAdmin: false })
  await seedUserMembership(student, company, { role: 'STUDENT' })
  await pool.query('UPDATE users SET email_verified_at=NOW()')
})
after(async () => {
  for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  await teardownAll()
})
async function request(user: string, path: string, method = 'GET', body?: object, companyId = company) {
  const response = await fetch(`${origins.get(user)}${path}`, { method,
    headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  const raw = await response.text()
  return { status: response.status, body: raw.startsWith('{') || raw.startsWith('[') ? JSON.parse(raw) : raw }
}

test('an existing first administrator can create the first course, enter its space and assign a teacher', async () => {
  assert.deepEqual((await request(admin, '/api/learning/spaces')).body.data, [])
  const created = await request(admin, '/api/courses', 'POST', { name: '第一门课程', description: '课程简介' })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const course = created.body
  assert.equal(course.projectKind, 'TEACHING')
  assert.equal(course.courseRole, 'teacher')
  const spaces = (await request(admin, '/api/learning/spaces')).body.data
  assert.ok(spaces.some((space: { courseId: string; canManage: boolean }) => space.courseId === course.id && space.canManage))
  assert.ok((await request(admin, '/management/courses')).body.some((row: { id: string }) => row.id === course.id))
  const room = (await pool.query('SELECT members FROM conversations WHERE id=$1', [course.studyRoomId])).rows[0]
  assert.ok(room.members.includes(admin))
  assert.equal((await pool.query('SELECT count(*)::int n FROM learning_course_teacher_rooms WHERE course_id=$1', [course.id])).rows[0].n, 1)
  const effects = (await pool.query('SELECT kind FROM learning_effects WHERE course_id=$1', [course.id])).rows.map(row => row.kind)
  for (const kind of ['study_room.sync', 'teacher_room.sync', 'teacher_agent.welcome', 'notebook.ensure']) assert.ok(effects.includes(kind), kind)
  assert.equal((await request(admin, `/management/courses/${course.id}/members/${teacher}`, 'PUT', { role: 'TEACHER', idempotencyKey: 'creation-teacher-assignment' })).status, 201)
  assert.ok((await request(teacher, '/api/learning/spaces')).body.data.some((row: { courseId: string }) => row.courseId === course.id))
})

test('company management creates courses through the same complete workflow and institutional creation remains available', async () => {
  const managed = await request(admin, '/management/courses', 'POST', { name: '后台课程' })
  assert.equal(managed.status, 201, JSON.stringify(managed.body))
  assert.equal((await request(admin, `/api/courses/${managed.body.id}`)).status, 200)
  const institutional = await request(admin, '/api/institutional-courses', 'POST', { name: '机构课程' })
  assert.equal(institutional.status, 201, JSON.stringify(institutional.body))
  assert.equal(institutional.body.projectKind, 'INSTITUTIONAL_COURSE')
})

test('existing teacher creation permission is preserved while management remains administrator-only', async () => {
  assert.equal((await request(teacher, '/api/courses', 'POST', { name: '教师课程' })).status, 201)
  assert.equal((await request(teacher, '/management/courses', 'POST', { name: 'Denied' })).status, 403)
})

test('students, foreign tenants, invalid input and read-only companies cannot create courses', async () => {
  assert.ok([403, 404].includes((await request(student, '/api/courses', 'POST', { name: 'Denied' })).status))
  assert.equal((await request(student, '/management/courses', 'POST', { name: 'Denied' })).status, 403)
  assert.ok([403, 404].includes((await request(admin, '/api/courses', 'POST', { name: 'Foreign' }, 'other-company')).status))
  assert.equal((await request(admin, '/api/courses', 'POST', { name: '  ' })).status, 400)
  await pool.query("UPDATE companies SET status='READ_ONLY' WHERE id=$1", [company])
  assert.equal((await request(admin, '/api/courses', 'POST', { name: 'Readonly' })).status, 403)
  assert.equal((await pool.query('SELECT count(*)::int n FROM courses')).rows[0].n, 0)
})

test('a failure during initialization rolls back the course, membership and conversations together', async () => {
  await pool.query(`CREATE FUNCTION reject_test_course_room() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test initialization failure'; END $$;
    CREATE TRIGGER reject_test_course_room BEFORE INSERT ON learning_course_teacher_rooms FOR EACH ROW EXECUTE FUNCTION reject_test_course_room()`)
  try {
    assert.equal((await request(admin, '/api/courses', 'POST', { name: 'Failing course' })).status, 500)
    for (const table of ['courses', 'projects', 'project_memberships', 'conversations']) {
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0, table)
    }
  } finally { await pool.query('DROP TRIGGER reject_test_course_room ON learning_course_teacher_rooms; DROP FUNCTION reject_test_course_room()') }
})
