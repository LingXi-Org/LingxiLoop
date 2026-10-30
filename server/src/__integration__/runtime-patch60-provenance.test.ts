import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {Pool} from 'pg'
import {packageResources,releaseVersions} from '@lyyzka/lingxios'
import {assertMigrationsCurrent,migrateDatabase} from '../db/migrate.js'
import {applyPublishedRuntimePatch,assertRuntimePatchDescriptors,loadRuntimePatchInventory,observePublishedRuntimePatch,preflightPublishedRuntimePatch} from '../db/runtime-patch.js'
import {loadLockedRuntimePackage,PUBLIC_PURPOSE_SCHEMA_HASH} from '../db/runtime-profile.js'
import {parseRuntimePatchInput} from '../runtime-patch-bin.js'

const actual=String(releaseVersions.runtime)
const formal19={skip:actual==='3.8.19'?false:'requires the actual formal3.8.19 archive and matching locks'}
async function isolated(run:(db:Pool)=>Promise<void>){
 const url=new URL(process.env.DATABASE_URL??'')
 assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname));assert.match(url.pathname,/(?:^|_)test(?:_|$)/)
 assert.doesNotMatch(url.pathname,/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
 const admin=new Pool({connectionString:url.toString(),max:1}),name='runtime_patch60_'+randomUUID().replaceAll('-','')+'_test'
 await admin.query(`CREATE DATABASE "${name}"`);url.pathname='/'+name
 const db=new Pool({connectionString:url.toString(),max:1})
 try{await run(db)}finally{await db.end();await admin.query(`DROP DATABASE "${name}"`);await admin.end()}
}
async function setup(db:Pool){
 const locked=await loadLockedRuntimePackage();assert.equal(locked.runtime,actual)
 await db.query(await readFile(packageResources().schema,'utf8'))
 await db.query(`CREATE TABLE public.schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL);
 CREATE TABLE public.lingxios_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),runtime_version text NOT NULL,schema_version integer NOT NULL,protocol_version integer NOT NULL,schema_sha256 text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.business_fixture(id integer PRIMARY KEY,value text); INSERT INTO public.business_fixture VALUES(1,'preserve');`)
 const migrations=await loadRuntimePatchInventory(60)
 for(const m of migrations)await db.query('INSERT INTO public.schema_migrations VALUES($1,$2,$3)',[m.version,m.name,m.checksum])
 const source={runtime:'3.8.18',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:60,migrations}
 const target={...source,runtime:'3.8.19',integrity:locked.integrity,tarball:locked.tarball}
 await db.query('INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256) VALUES($1,14,11,$2)',[source.runtime,source.schemaHash])
 return {source,target}
}
test('product60 admits only18 to19 and refuses an installed formal18 package as the target',async()=>isolated(async db=>{
 assert.ok(['3.8.18','3.8.19'].includes(actual),'owning check requires the actual formal18 or19 package')
 const {source,target}=await setup(db)
 assert.doesNotThrow(()=>assertRuntimePatchDescriptors(source,target))
 for(const runtime of ['3.8.17','3.8.20','4.0.0-slim.0'])assert.throws(()=>assertRuntimePatchDescriptors(source,{...target,runtime}))
 assert.throws(()=>assertRuntimePatchDescriptors({...source,productVersion:59},{...target,productVersion:59}))
 if(actual==='3.8.18'){
  await assert.rejects(applyPublishedRuntimePatch(db,source,target),/Exact formal runtime/)
  assert.equal((await db.query('SELECT runtime_version FROM public.lingxios_installation')).rows[0].runtime_version,'3.8.18')
 }else assert.doesNotThrow(()=>parseRuntimePatchInput(JSON.stringify({source,target})))
}))
test('formal19 exact CAS preserves all60 migration rows and business data; startup performs no product SQL',formal19,async()=>isolated(async db=>{
 const {source,target}=await setup(db),before=(await db.query('SELECT * FROM public.lingxios_installation')).rows
 const ledger=(await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows
 const other=new Pool({connectionString:db.options.connectionString,max:1})
 try{
  await other.query('SELECT 1')
  assert.equal((await preflightPublishedRuntimePatch(db,source,target)).state,'source')
  assert.deepEqual((await db.query('SELECT * FROM public.lingxios_installation')).rows,before)
  await assert.rejects(applyPublishedRuntimePatch(db,source,target),/no other database clients/)
 }finally{await other.end()}
 await db.query(`CREATE FUNCTION forbid_patch60_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected DDL'; END $$;
 CREATE EVENT TRIGGER forbid_patch60_ddl ON ddl_command_start EXECUTE FUNCTION forbid_patch60_ddl()`)
 assert.equal((await applyPublishedRuntimePatch(db,source,target)).updated,1)
 await assert.rejects(applyPublishedRuntimePatch(db,source,target),/source provenance changed/)
 assert.equal((await observePublishedRuntimePatch(db,source,target)).state,'target')
 const installed=(await db.query('SELECT * FROM public.lingxios_installation')).rows
 // This fixture has no product plan tables: attempting migrations or ordinary
 // seed writes would fail, as would any DDL under the trigger above.
 assert.deepEqual(await migrateDatabase(db),[])
 await assertMigrationsCurrent(db)
 assert.deepEqual((await db.query('SELECT * FROM public.lingxios_installation')).rows,installed)
 assert.deepEqual((await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows,ledger)
 assert.deepEqual((await db.query('SELECT * FROM public.business_fixture')).rows,[{id:1,value:'preserve'}])
 await db.query("INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,lease_expires_at) VALUES('active','t','a','s','turn','interactive','fixture','leased',NOW()+INTERVAL '1 minute')")
 assert.equal((await preflightPublishedRuntimePatch(db,source,target)).complete,true,'installed target uses convergence without another CAS')
}))
test('formal19 refuses fresh,58 or59 product history before any migration or adoption',formal19,async()=>{
 await isolated(async db=>{
  await assert.rejects(migrateDatabase(db),/requires already installed product60/)
  assert.equal((await db.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name,null)
 })
 for(const count of [58,59])await isolated(async db=>{
  await setup(db)
  await db.query('DELETE FROM public.schema_migrations WHERE version>$1',[count])
  const ledger=(await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows
  await assert.rejects(migrateDatabase(db),/requires already installed product60/)
  await assert.rejects(assertMigrationsCurrent(db),/migration\(s\)/)
  assert.deepEqual((await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows,ledger)
  assert.deepEqual((await db.query('SELECT * FROM public.business_fixture')).rows,[{id:1,value:'preserve'}])
  assert.equal((await db.query('SELECT runtime_version FROM public.lingxios_installation')).rows[0].runtime_version,'3.8.18')
 })
})
test('formal19 retains bound-job and uncertain-commit safeguards on product60',formal19,async()=>isolated(async db=>{
 const {source,target}=await setup(db)
 await db.query("INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status) VALUES('waiting','t','a','s','job','interactive','fixture','waiting')")
 await db.query("INSERT INTO lingxios.agent_steps(work_id,step_id,request_version,kind,input_hash,input) VALUES('waiting','step',1,'runtime.checkpoint','hash','{}')")
 await assert.rejects(preflightPublishedRuntimePatch(db,source,target),/incompatible resumable/)
 await db.query("DELETE FROM lingxios.agent_work_items WHERE id='waiting'")
 const lost={connect:async()=>{const client=await db.connect();return new Proxy(client,{get(owner,key){
  if(key==='query')return async(...args:unknown[])=>{const result=await Reflect.apply(owner.query,owner,args);if(args[0]==='COMMIT')throw Error('lost commit');return result}
  if(key==='release')return owner.release.bind(owner)
  return Reflect.get(owner,key,owner)
 }})}} as unknown as Pool
 await assert.rejects(applyPublishedRuntimePatch(lost,source,target),e=>(e as {uncertain?:boolean}).uncertain===true)
 assert.equal((await observePublishedRuntimePatch(db,source,target)).complete,true,'observe target; never replay CAS')
}))
