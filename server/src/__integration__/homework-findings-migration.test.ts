import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { Pool } from 'pg'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { pool } from '../db/pool.js'

after(() => pool.end())

test('519 product57 to58 keeps existing draft content, status and runtime provenance', async () => {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname))
  assert.match(source.pathname, /(?:^|_)test(?:_|$)/)
  assert.equal(source.searchParams.has('host'), false)
  const name = `homework_findings_${randomUUID().replaceAll('-', '')}_test`
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
  const target = new URL(source); target.pathname = `/${name}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  const directory = await mkdtemp(join(tmpdir(), 'homework-findings57-'))
  let owned = false, database: Pool | undefined
  try {
    await admin.query(`CREATE DATABASE ${name}`); owned = true
    database = new Pool({ connectionString: target.toString(), max: 2 })
    const migrations = new URL('../db/migrations/', import.meta.url)
    for (const file of await readdir(migrations)) if (Number(file.slice(0, 4)) <= 57) await copyFile(new URL(file, migrations), join(directory, file))
    assert.equal((await migrateDatabase(database, pathToFileURL(`${directory}${sep}`))).length, 57)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('teacher519','teacher519@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('school519','School','school519','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
        VALUES('project519','school519','TEACHING','plan-education','Course','ACTIVE','teacher519');
      INSERT INTO courses(id,company_id,project_id,created_by) VALUES('course519','school519','project519','teacher519');
      INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,title,instructions,criteria,visible_hash,validation_status)
        SELECT status,'school519','project519','course519','teacher519','Saved title','Saved task','["Teacher standard"]',repeat('a',64),status
        FROM unnest(ARRAY['PENDING','READY','INVALID','ERROR','MATERIAL_ERROR']) AS status`)
    const original = (await database.query('SELECT * FROM homeworks ORDER BY id')).rows
    const provenance = (await database.query('SELECT * FROM lingxios_installation')).rows
    assert.deepEqual(await migrateDatabase(database), ['0058_homework_validation_findings'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    const after = (await database.query('SELECT * FROM homeworks ORDER BY id')).rows
    assert.deepEqual(after.map(({ validation_findings, ...row }) => { assert.deepEqual(validation_findings, []); return row }), original)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows, provenance)
  } finally {
    if (database) await database.end()
    if (owned) await admin.query(`DROP DATABASE ${name}`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
