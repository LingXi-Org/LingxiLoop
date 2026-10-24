import assert from 'node:assert/strict'
import { after,before,test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { copyFile,mkdtemp,readdir,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pool } from '../db/pool.js'
import { assertMigrationsCurrent,migrateDatabase } from '../db/migrate.js'

// Keep this owning test at its actual product55 boundary as later product
// migrations are added. The current formal runtime and original SQL stay intact.
let product55Directory:string|undefined,product55Url:URL
before(async()=>{
  product55Directory=await mkdtemp(join(tmpdir(),'case-cover55-'))
  product55Url=pathToFileURL(`${product55Directory}${sep}`)
  const migrations=new URL('../db/migrations/',import.meta.url)
  for(const file of await readdir(migrations)) if(Number(file.slice(0,4))<=55) await copyFile(new URL(file,migrations),join(product55Directory,file))
})
after(async()=>{
  await pool.end()
  if(product55Directory)await rm(product55Directory,{recursive:true,force:true})
})
// Own only databases whose CREATE succeeded in this invocation; never reset or
// drop an existing integration database. The source URL must be a local test DB.
async function withDatabase(work:(database:Pool)=>Promise<void>) {
  const source=new URL(process.env.INTEGRATION_DATABASE_URL!)
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(source.hostname),'local fixture only')
  assert.match(source.pathname,/(?:^|_)test(?:_|$)/)
  assert.equal(source.searchParams.has('host'),false)
  const name=`case_cover_migration_${randomUUID().replaceAll('-','')}_test`
  const adminUrl=new URL(source);adminUrl.pathname='/postgres'
  const target=new URL(source);target.pathname=`/${name}`
  const admin=new Pool({connectionString:adminUrl.toString(),max:1})
  let owned=false,database:Pool|undefined
  try {
    await admin.query(`CREATE DATABASE ${name}`);owned=true
    database=new Pool({connectionString:target.toString(),max:4})
    await work(database)
  } finally {
    if(database)await database.end()
    if(owned)await admin.query(`DROP DATABASE ${name}`)
    await admin.end()
  }
}
test('fresh product55 installs the exact runtime once and repeated migration is a no-op',{timeout:120000},async()=>{
  await withDatabase(async database=>{
    assert.equal((await migrateDatabase(database,product55Url)).length,55)
    assert.deepEqual(await migrateDatabase(database,product55Url),[])
    await assertMigrationsCurrent(database,product55Url)
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,14)
  })
})
test('product55 preserves54 cases/provenance, rolls back DDL and ledger together, rejects partial/mismatched history', {timeout:120000},async()=>{
  await withDatabase(async database=>{
  const name=(await database.query('SELECT current_database() AS name')).rows[0].name as string
  assert.match(name,/(?:^|_)test(?:_|$)/)
  assert.equal((await database.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name,null,'requires a new empty task test database')
  const directory=await mkdtemp(join(tmpdir(),'case-cover54-'))
  try {
    const migrations=new URL('../db/migrations/',import.meta.url)
    for(const file of await readdir(migrations)) if(Number(file.slice(0,4))<=54) await copyFile(new URL(file,migrations),join(directory,file))
    assert.equal((await migrateDatabase(database,pathToFileURL(`${directory}${sep}`))).length,54)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('cover-migration-teacher','cover-migration@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('cover-migration-school','School','cover-migration-school','EDUCATION','plan-education');
      INSERT INTO organization_cases(id,company_id,created_by,draft) VALUES('cover-migration-case','cover-migration-school','cover-migration-teacher',
      '{"title":"Existing case","summary":"Original","body":"Original body","category":"Networks","tags":["router"],"cover":"/api/files?key=original-image"}')`)
    const original=(await database.query('SELECT * FROM organization_cases')).rows
    const provenance=(await database.query('SELECT * FROM lingxios_installation')).rows
    const history=(await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    await database.query(`CREATE FUNCTION reject_cover55() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.version=55 THEN RAISE EXCEPTION 'synthetic ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_cover55 BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_cover55()`)
    await assert.rejects(migrateDatabase(database,product55Url),/migration 55_case_covers failed/)
    assert.equal((await database.query("SELECT to_regclass('organization_case_cover_jobs') AS name")).rows[0].name,null)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
    await database.query('DROP TRIGGER reject_cover55 ON schema_migrations; DROP FUNCTION reject_cover55()')
    await database.query("UPDATE lingxios_installation SET runtime_version='3.8.2'")
    await assert.rejects(migrateDatabase(database,product55Url),/migration 55_case_covers failed/)
    assert.equal((await database.query("SELECT to_regclass('organization_case_cover_jobs') AS name")).rows[0].name,null)
    await database.query('UPDATE lingxios_installation SET runtime_version=$1',[provenance[0].runtime_version])
    const last=history.at(-1)!
    await database.query('DELETE FROM schema_migrations WHERE version=54')
    try { await assert.rejects(migrateDatabase(database,product55Url),/partial product history/) }
    finally { await database.query('INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES($1,$2,$3,$4)',[last.version,last.name,last.checksum,last.applied_at]) }
    assert.deepEqual(await migrateDatabase(database,product55Url),['0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database,product55Url),[])
    await assertMigrationsCurrent(database,product55Url)
    assert.deepEqual((await database.query('SELECT * FROM organization_cases')).rows,original)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows,provenance)
    assert.equal((await database.query('SELECT COUNT(*)::int AS n FROM organization_case_cover_jobs')).rows[0].n,0,'migration does not trigger generation')
  } finally { await rm(directory,{recursive:true,force:true}) }
  })
})
