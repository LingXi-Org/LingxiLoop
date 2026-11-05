import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { CasesApplication } from '../modules/cases/application.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

const teacher = { companyId: 'cases-school', userId: 'cases-teacher' }
const student = { companyId: teacher.companyId, userId: 'cases-student' }
const other = { companyId: 'other-school', userId: 'other-teacher' }
const app = new CasesApplication(pool, { transaction: work => withTransaction(pool, work), putObject: async () => {} })
const content = { title: 'KV cache', summary: 'Memory reuse', body: 'A published lesson.', category: '推理优化', tags: [], cover: null, college: '计算机学院', coverText: 'KV', coverColor: 'blue' as const }
const servers: import('node:http').Server[] = []
before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  for (const scope of [teacher, other]) {
    await pool.query("INSERT INTO companies(id,name,slug,type,plan_id) VALUES($1,$1,$1,'EDUCATION','plan-education')", [scope.companyId])
    await seedUserMembership(scope.userId, scope.companyId, { role: 'TEACHER', isAdmin: false })
  }
  await seedUserMembership(student.userId, student.companyId, { role: 'STUDENT', isAdmin: false })
})
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
after(() => teardownAll())

test('options persist without articles, deduplicate and remain organization scoped and teacher managed', async () => {
  assert.deepEqual(await app.createOption(teacher, 'category', '推理优化'), { categories: ['推理优化'], colleges: [] })
  await app.createOption(teacher, 'category', '推理优化')
  await app.createOption(teacher, 'college', '计算机学院')
  const fresh = new CasesApplication(pool, { transaction: work => withTransaction(pool, work), putObject: async () => {} })
  assert.deepEqual(await fresh.options(teacher), { categories: ['推理优化'], colleges: ['计算机学院'] })
  assert.deepEqual(await fresh.options(other), { categories: [], colleges: [] })
  assert.deepEqual((await fresh.list(student)).categories, ['推理优化'])
  await assert.rejects(app.createOption(student, 'college', 'Forbidden'), { status: 403 })
  await assert.rejects(app.options(student), { status: 403 })
  await assert.rejects(app.createOption({ ...teacher, companyId: other.companyId }, 'category', 'Forbidden'), { status: 404 })
})

test('text covers preserve published snapshots, old clients, conflicts and do not queue legacy generation', async () => {
  const draft = await app.create(teacher, content)
  await assert.rejects(app.detail(student, draft.id), { status: 404 })
  const published = await app.publish(teacher, draft.id, draft.version)
  const changed = { ...content, college: '软件学院', coverText: 'QK', coverColor: 'green' as const }
  const saved = await app.save(teacher, draft.id, changed, published.version)
  const reader = await app.detail(student, draft.id)
  assert.deepEqual([reader.college, reader.coverText, reader.coverColor], ['计算机学院', 'KV', 'blue'])
  const { college: _college, coverText: _text, coverColor: _color, ...legacy } = content
  const oldSave = await app.save(teacher, draft.id, legacy, saved.version)
  assert.deepEqual([oldSave.college, oldSave.coverText, oldSave.coverColor], ['软件学院', 'QK', 'green'])
  await assert.rejects(app.save(teacher, draft.id, changed, saved.version), { status: 409 })
  await assert.rejects(app.save(student, draft.id, content, oldSave.version), { status: 403 })
  await assert.rejects(app.detail(other, draft.id, 'manage'), { status: 404 })
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM organization_case_cover_jobs')).rows[0].n, 0)
  await app.createOption(teacher, 'college', '计算机学院')
  await app.remove(teacher, draft.id, oldSave.version)
  assert.deepEqual((await app.options(teacher)).colleges, ['计算机学院'])
})

test('HTTP options validate kind and bounded names and reject student writes', async () => {
  for (const user of [teacher, student]) {
    const server = (await buildApiTestApp(user.userId)).listen(0, '127.0.0.1')
    servers.push(server); await once(server, 'listening')
    const { port } = server.address() as import('node:net').AddressInfo
    const post = (body: unknown) => fetch(`http://127.0.0.1:${port}/api/cases/options`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': teacher.companyId }, body: JSON.stringify(body) })
    assert.equal((await post({ kind: 'college', name: '信息学院' })).status, user === teacher ? 201 : 403)
    if (user === teacher) {
      for (const invalid of [{ kind: 'role', name: 'Teacher' }, { kind: 'category', name: ' ' }, { kind: 'college', name: 'x'.repeat(81) }]) assert.equal((await post(invalid)).status, 400)
    }
  }
})
