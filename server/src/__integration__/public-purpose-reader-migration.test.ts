import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { migrateDatabase, assertMigrationsCurrent } from '../db/migrate.js'

async function isolated(run:(db:Pool)=>Promise<void>){
  const url=new URL(process.env.DATABASE_URL!)
  assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname),'dedicated local/CI database only')
  assert.match(url.pathname,/test/i)
  const admin=new Pool({connectionString:url.toString()}),name='purpose_reader_test_'+randomUUID().replaceAll('-','')
  await admin.query(`CREATE DATABASE "${name}"`)
  url.pathname='/'+name
  const db=new Pool({connectionString:url.toString()})
  try{await run(db)}finally{await db.end();await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end()}
}
async function source50(db:Pool){
  const applied=await migrateDatabase(db)
  assert.equal(applied.at(-1),'0051_public_text_reader')
  await assertMigrationsCurrent(db)
  // Local synthetic fixture:0051 is provenance-only, so restore precisely its
  // source metadata to exercise the actual50->51 transition, never production.
  await db.query("DELETE FROM schema_migrations WHERE version=51; UPDATE lingxios_installation SET runtime_version='3.6.0'")
}
const installed=async(db:Pool)=>(await db.query('SELECT * FROM lingxios_installation')).rows
const history=async(db:Pool)=>(await db.query('SELECT * FROM schema_migrations ORDER BY version')).rows

test('0051 fresh history, exact50 upgrade and repeat preserve native14 without DDL',async()=>isolated(async db=>{
  await source50(db)
  const old=await history(db)
  assert.equal(old.length,50)
  await assert.rejects(assertMigrationsCurrent(db),/migration\(s\).*required/)
  const native=await db.query("SELECT oid,relname FROM pg_class WHERE relnamespace='lingxios'::regnamespace ORDER BY oid")
  await db.query(`CREATE FUNCTION forbid_reader_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected native DDL'; END $$;
    CREATE EVENT TRIGGER forbid_reader_ddl ON ddl_command_start EXECUTE FUNCTION forbid_reader_ddl()`)
  assert.deepEqual(await migrateDatabase(db),['0051_public_text_reader'])
  assert.deepEqual((await history(db)).slice(0,50),old)
  assert.equal((await installed(db))[0].runtime_version,'3.7.0')
  assert.equal((await db.query('SELECT version FROM lingxios.schema_version')).rows[0].version,14)
  assert.deepEqual((await db.query("SELECT oid,relname FROM pg_class WHERE relnamespace='lingxios'::regnamespace ORDER BY oid")).rows,native.rows)
  const target=await installed(db),targetHistory=await history(db)
  await assertMigrationsCurrent(db)
  assert.deepEqual(await migrateDatabase(db),[])
  assert.deepEqual(await installed(db),target)
  assert.deepEqual(await history(db),targetHistory)
}))

test('0051 ledger failure rolls provenance back and mismatched source or target cannot be adopted',async()=>isolated(async db=>{
  await source50(db)
  const original=await installed(db),old=await history(db)
  await db.query(`CREATE FUNCTION reject_reader_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=51 THEN RAISE EXCEPTION 'reader ledger fixture'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_reader_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_reader_ledger()`)
  await assert.rejects(migrateDatabase(db),/migration 51_public_text_reader failed/)
  assert.deepEqual(await installed(db),original);assert.deepEqual(await history(db),old)
  await db.query('DROP TRIGGER reject_reader_ledger ON schema_migrations; DROP FUNCTION reject_reader_ledger()')
  for(const [column,value] of [['runtime_version','3.5.8'],['schema_version',13],['protocol_version',12],['schema_sha256','a'.repeat(64)]] as const){
    await db.query(`UPDATE lingxios_installation SET ${column}=$1`,[value])
    const corrupt=await installed(db)
    await assert.rejects(migrateDatabase(db),/migration 51_public_text_reader failed/)
    assert.deepEqual(await installed(db),corrupt);assert.deepEqual(await history(db),old)
    await db.query(`UPDATE lingxios_installation SET ${column}=$1`,[original[0][column]])
  }
  await db.query('DELETE FROM lingxios_installation')
  await assert.rejects(migrateDatabase(db),/migration 51_public_text_reader failed/)
  await db.query('INSERT INTO lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256,installed_at) VALUES($1,$2,$3,$4,$5)',
    [original[0].runtime_version,original[0].schema_version,original[0].protocol_version,original[0].schema_sha256,original[0].installed_at])
  await db.query('UPDATE lingxios.schema_version SET version=13')
  await assert.rejects(migrateDatabase(db),/migration 51_public_text_reader failed/)
  await db.query('UPDATE lingxios.schema_version SET version=14')
  await db.query("UPDATE schema_migrations SET checksum=repeat('b',64) WHERE version=50")
  await assert.rejects(migrateDatabase(db),/checksum mismatch/)
  await db.query('UPDATE schema_migrations SET checksum=$1 WHERE version=50',[old[49].checksum])
  assert.deepEqual(await migrateDatabase(db),['0051_public_text_reader'])
  await db.query("UPDATE lingxios_installation SET runtime_version='3.6.0'")
  const mismatched=await installed(db)
  await assert.rejects(assertMigrationsCurrent(db),/package\/schema mismatch/)
  await assert.rejects(migrateDatabase(db),/package\/schema mismatch/)
  assert.deepEqual(await installed(db),mismatched,'repeat must never silently repair target provenance')
}))
