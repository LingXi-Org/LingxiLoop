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

test('0060 replaces Canvas grants while preserving revoked grants, custom prompts and old Canvas data', async () => {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname))
  assert.match(source.pathname, /(?:^|_)test(?:_|$)/)
  assert.equal(source.searchParams.has('host'), false)
  const name = `artifacts_${randomUUID().replaceAll('-', '')}_test`
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
  const target = new URL(source); target.pathname = `/${name}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  const directory = await mkdtemp(join(tmpdir(), 'native-artifacts59-'))
  let owned = false, database: Pool | undefined
  try {
    await admin.query(`CREATE DATABASE ${name}`); owned = true
    database = new Pool({ connectionString: target.toString(), max: 2 })
    const migrations = new URL('../db/migrations/', import.meta.url)
    for (const file of await readdir(migrations)) if (Number(file.slice(0, 4)) <= 59) await copyFile(new URL(file, migrations), join(directory, file))
    assert.equal((await migrateDatabase(database, pathToFileURL(`${directory}${sep}`))).length, 59)
    await database.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES('artifacts60','School','artifacts60','EDUCATION','plan-education');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities,system_prompt) VALUES
        ('allowed','artifacts60','agent','Allowed','A','#000','avail','["canvas","documents"]','custom prompt'),
        ('revoked','artifacts60','agent','Revoked','R','#000','avail','["documents"]','custom prompt'),
        ('teacher','artifacts60','agent','Teacher','T','#000','avail','["teacher_admin","knowledge"]','custom prompt');`)
    const canvasTables = (await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'canvas_%' ORDER BY tablename")).rows
    assert.ok(canvasTables.length > 0)
    assert.deepEqual(await migrateDatabase(database), ['0060_native_artifacts'])
    assert.deepEqual((await database.query("SELECT id,capabilities,system_prompt FROM participants WHERE company_id='artifacts60' ORDER BY id")).rows, [
      { id: 'allowed', capabilities: ['documents','design','slides'], system_prompt: 'custom prompt' },
      { id: 'revoked', capabilities: ['documents'], system_prompt: 'custom prompt' },
      { id: 'teacher', capabilities: ['teacher_admin','knowledge'], system_prompt: 'custom prompt' },
    ])
    assert.deepEqual((await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'canvas_%' ORDER BY tablename")).rows, canvasTables)
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  } finally {
    if (database) await database.end()
    if (owned) await admin.query(`DROP DATABASE ${name}`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
