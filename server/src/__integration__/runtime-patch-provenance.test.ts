import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {readFile} from 'node:fs/promises'
import {packageResources,releaseVersions} from '@lyyzka/lingxios'
import {compareAndSwapRuntimeProvenance,loadRuntimePatchInventory,readRuntimePatchBarrier} from '../db/runtime-patch.js'
import {PUBLIC_PURPOSE_SCHEMA_HASH} from '../db/runtime-profile.js'

// Failure model: docs/runtime-patch-release-failure-model.md. Disposable DB only.
async function isolated(run:(db:Pool)=>Promise<void>){
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname));assert.match(url.pathname,/test/i)
 const admin=new Pool({connectionString:url.toString()}),name='runtime_patch_test_'+randomUUID().replaceAll('-','')
 await admin.query(`CREATE DATABASE "${name}"`);url.pathname='/'+name
 const db=new Pool({connectionString:url.toString()})
 try{await run(db)}finally{await db.end();await admin.query(`DROP DATABASE "${name}"`);await admin.end()}
}
const inventory=await loadRuntimePatchInventory()
const source={runtime:'3.8.2',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:54,migrations:inventory}
const target={...source,runtime:'3.8.3'}
async function setup(db:Pool){
 await db.query(await readFile(packageResources().schema,'utf8'))
 await db.query(`CREATE TABLE schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL);
 CREATE TABLE lingxios_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),runtime_version text NOT NULL,schema_version integer NOT NULL,protocol_version integer NOT NULL,schema_sha256 text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE business_fixture(id integer PRIMARY KEY,value text); INSERT INTO business_fixture VALUES(1,'preserve');`)
 for(const m of inventory)await db.query('INSERT INTO schema_migrations VALUES($1,$2,$3)',[m.version,m.name,m.checksum])
 await db.query('INSERT INTO lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256) VALUES($1,$2,$3,$4)',[source.runtime,source.schema,source.protocol,source.schemaHash])
}
const snapshot=async(db:Pool)=>(await db.query('SELECT * FROM lingxios_installation')).rows
test('current patch refuses partial existing history before any DDL or provenance mutation',{
 skip:releaseVersions.runtime==='3.8.2'?'Requires the actual newer formal package; no version substitution':false,
},async()=>isolated(async db=>{
 await setup(db);await db.query('DELETE FROM schema_migrations WHERE version=54');const before=await snapshot(db)
 await db.query(`CREATE FUNCTION forbid_patch_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected DDL'; END $$;
 CREATE EVENT TRIGGER forbid_patch_ddl ON ddl_command_start EXECUTE FUNCTION forbid_patch_ddl()`)
 const {migrateDatabase}=await import('../db/migrate.js')
 await assert.rejects(migrateDatabase(db),/historical package/)
 assert.deepEqual(await snapshot(db),before)
 assert.equal((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,53)
}))
test('empty full54 installation stamps the actual installed package once; startup and repeat never adopt a mismatch',async()=>isolated(async db=>{
 const {migrateDatabase,assertMigrationsCurrent}=await import('../db/migrate.js')
 assert.equal((await migrateDatabase(db)).length,54)
 assert.equal((await snapshot(db))[0].runtime_version,releaseVersions.runtime)
 await assertMigrationsCurrent(db);const before=await snapshot(db)
 assert.deepEqual(await migrateDatabase(db),[]);assert.deepEqual(await snapshot(db),before)
 await db.query("UPDATE lingxios_installation SET runtime_version='3.8.1'")
 const changed=await snapshot(db)
 await assert.rejects(assertMigrationsCurrent(db),/package\/schema mismatch/)
 await assert.rejects(migrateDatabase(db),/package\/schema mismatch/)
 assert.deepEqual(await snapshot(db),changed)
}))
test('runtime provenance CAS changes one exact row without DDL or business/ledger writes and rejects replay',async()=>isolated(async db=>{
 await setup(db);const history=(await db.query('SELECT * FROM schema_migrations ORDER BY version')).rows
 await db.query(`CREATE FUNCTION forbid_patch_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected DDL'; END $$;
 CREATE EVENT TRIGGER forbid_patch_ddl ON ddl_command_start EXECUTE FUNCTION forbid_patch_ddl()`)
 assert.deepEqual(await compareAndSwapRuntimeProvenance(db,source,target),{source:'3.8.2',target:'3.8.3',schema:14,product:54,updated:1})
 assert.equal((await snapshot(db))[0].runtime_version,'3.8.3')
 assert.deepEqual((await db.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
 assert.deepEqual((await db.query('SELECT * FROM business_fixture')).rows,[{id:1,value:'preserve'}])
 const after=await snapshot(db);await assert.rejects(compareAndSwapRuntimeProvenance(db,source,target));assert.deepEqual(await snapshot(db),after)
}))
test('CAS refuses mismatched source, inventory, native schema and rolls back UPDATE failure',async()=>isolated(async db=>{
 await setup(db);const before=await snapshot(db)
 for(const bad of [{...source,runtime:'3.8.1'},{...source,schemaHash:'a'.repeat(64)},
  {...source,migrations:source.migrations.map((m,i)=>i===0?{...m,checksum:'b'.repeat(64)}:m)}]){
  await assert.rejects(compareAndSwapRuntimeProvenance(db,bad,target));assert.deepEqual(await snapshot(db),before)
 }
 await db.query('UPDATE lingxios.schema_version SET version=13');await assert.rejects(compareAndSwapRuntimeProvenance(db,source,target));await db.query('UPDATE lingxios.schema_version SET version=14')
 await db.query(`CREATE FUNCTION reject_patch_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;
 CREATE TRIGGER reject_patch_update BEFORE UPDATE ON lingxios_installation FOR EACH ROW EXECUTE FUNCTION reject_patch_update()`)
 await assert.rejects(compareAndSwapRuntimeProvenance(db,source,target));assert.deepEqual(await snapshot(db),before)
}))
test('waiting, future queued and expired/cancelled leased bindings/checkpoints block CAS without exposing data',async()=>isolated(async db=>{
 await setup(db)
 for(const status of ['waiting','queued','leased'])for(const kind of ['turn','resume','routine','teacher_digest'])for(const step of ['runtime.binding','runtime.checkpoint']){
  await db.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,available_at,lease_expires_at,cancel_requested_at)
   VALUES('private-work','tenant','agent','room',$1,'interactive','private-source',$2,NOW()+INTERVAL '1 day',NOW()-INTERVAL '1 day',NOW())`,[kind,status])
  await db.query(`INSERT INTO lingxios.agent_steps(work_id,step_id,request_version,kind,input_hash,input)
   VALUES('private-work','step',1,$1,'hash','{"private":"do not return"}')`,[step])
  const barrier=await readRuntimePatchBarrier(db);assert.equal(barrier.incompatibleRuns,1);assert.doesNotMatch(JSON.stringify(barrier),/private|tenant|room|agent/)
  await assert.rejects(compareAndSwapRuntimeProvenance(db,source,target));assert.equal((await snapshot(db))[0].runtime_version,'3.8.2')
  await db.query("DELETE FROM lingxios.agent_work_items WHERE id='private-work'")
 }
 await db.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,lease_expires_at)
  VALUES('live','tenant','agent','room','turn','interactive','source','leased',NOW()+INTERVAL '1 minute')`)
 await assert.rejects(compareAndSwapRuntimeProvenance(db,source,target));assert.equal((await snapshot(db))[0].runtime_version,'3.8.2')
}))
