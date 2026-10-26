import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID,createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Pool} from 'pg'
import {packageResources,releaseVersions} from '@lyyzka/lingxios'
import {applyPublishedRuntimePatch,loadRuntimePatchInventory,observePublishedRuntimePatch,runtimePatchPlanHash} from '../db/runtime-patch.js'
import {loadLockedRuntimePackage,PUBLIC_PURPOSE_SCHEMA_HASH} from '../db/runtime-profile.js'

// The current SDK12 business batch can run without claiming qualification of14.
// No fake version, schema, registry lock or public export substitution is used.
const actual14=String(releaseVersions.runtime)==='3.8.14'
const options={skip:actual14?false:'Requires the actual formal3.8.14 package and matching locks; stale SDK is not qualification'}
async function isolated(run:(db:Pool)=>Promise<void>){
 const url=new URL(process.env.DATABASE_URL??'')
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','postgres'].includes(url.hostname)&&!url.search&&!url.hash)
 assert.match(url.pathname,/(?:^|[_-])test(?:$|[_-])/i)
 assert.doesNotMatch(url.pathname,/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
 const admin=new Pool({connectionString:url.toString(),max:1}),name='runtime_patch57_test_'+randomUUID().replaceAll('-','')
 await admin.query(`CREATE DATABASE "${name}"`);url.pathname='/'+name
 const db=new Pool({connectionString:url.toString(),max:1})
 try{await run(db)}finally{await db.end();await admin.query(`DROP DATABASE "${name}"`);await admin.end()}
}
async function setup(db:Pool){
 const locked=await loadLockedRuntimePackage();assert.equal(locked.runtime,'3.8.14')
 const schema=await readFile(packageResources().schema,'utf8')
 assert.equal(createHash('sha256').update(schema).digest('hex'),PUBLIC_PURPOSE_SCHEMA_HASH)
 assert.deepEqual(releaseVersions,{runtime:'3.8.14',controlPlane:11,kernel:2,schema:14,assistantMessage:2,publicText:3,runTrace:1})
 const migrations=await loadRuntimePatchInventory(57)
 await db.query(schema)
 await db.query(`CREATE TABLE public.schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL);
 CREATE TABLE public.lingxios_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),runtime_version text NOT NULL,schema_version integer NOT NULL,protocol_version integer NOT NULL,schema_sha256 text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.business_fixture(id integer PRIMARY KEY,value text); INSERT INTO public.business_fixture VALUES(1,'preserve');`)
 for(const m of migrations)await db.query('INSERT INTO public.schema_migrations VALUES($1,$2,$3)',[m.version,m.name,m.checksum])
 const source={runtime:'3.8.12',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:57,migrations}
 const target={...source,runtime:'3.8.14',integrity:locked.integrity,tarball:locked.tarball}
 await db.query('INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256) VALUES($1,$2,$3,$4)',[source.runtime,source.schema,source.protocol,source.schemaHash])
 return {source,target}
}
const snapshot=async(db:Pool)=>(await db.query('SELECT * FROM public.lingxios_installation')).rows
test('published product57 CAS changes exactly one provenance row, no DDL/ledger/business mutation, and never replays',options,async()=>isolated(async db=>{
 const {source,target}=await setup(db),before=await snapshot(db),ledger=(await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows
 await db.query(`CREATE FUNCTION forbid_patch57_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected DDL'; END $$;
 CREATE EVENT TRIGGER forbid_patch57_ddl ON ddl_command_start EXECUTE FUNCTION forbid_patch57_ddl()`)
 const pending=await observePublishedRuntimePatch(db,source,target);assert.equal(pending.complete,false);assert.equal(pending.state,'source')
 assert.deepEqual(await snapshot(db),before)
 assert.deepEqual(await applyPublishedRuntimePatch(db,source,target),{source:'3.8.12',target:'3.8.14',schema:14,product:57,updated:1})
 const after=await snapshot(db);assert.equal(after[0].runtime_version,'3.8.14')
 assert.deepEqual((await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows,ledger)
 assert.deepEqual((await db.query('SELECT * FROM public.business_fixture')).rows,[{id:1,value:'preserve'}])
 await assert.rejects(applyPublishedRuntimePatch(db,source,target),/source provenance changed/)
 const complete=await observePublishedRuntimePatch(db,source,target)
 assert.equal(complete.complete,true);assert.equal(complete.state,'target');assert.equal(complete.planHash,runtimePatchPlanHash(source,target))
 assert.deepEqual(await snapshot(db),after)
}))
test('product57 unknown COMMIT is observed read-only, not replayed; mixed provenance refuses completion',options,async()=>isolated(async db=>{
 const {source,target}=await setup(db)
 const lostCommit={connect:async()=>{
  const client=await db.connect()
  return new Proxy(client,{get(owner,key){
   if(key==='query')return async(...args:unknown[])=>{const result=await Reflect.apply(owner.query,owner,args);if(args[0]==='COMMIT')throw Error('lost commit response');return result}
   if(key==='release')return owner.release.bind(owner)
   return Reflect.get(owner,key,owner)
  }})
 }} as unknown as Pool
 await assert.rejects(applyPublishedRuntimePatch(lostCommit,source,target),error=>(error as {uncertain?:boolean}).uncertain===true)
 assert.equal((await snapshot(db))[0].runtime_version,'3.8.14')
 const observedQueries:string[]=[]
 const observer={connect:async()=>{
  const client=await db.connect()
  return new Proxy(client,{get(owner,key){
   if(key==='query')return async(...args:unknown[])=>{observedQueries.push(String(args[0]));return Reflect.apply(owner.query,owner,args)}
   if(key==='release')return owner.release.bind(owner)
   return Reflect.get(owner,key,owner)
  }})
 }} as unknown as Pool
 assert.equal((await observePublishedRuntimePatch(observer,source,target)).complete,true)
 assert.ok(observedQueries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'))
 assert.ok(observedQueries.every(sql=>!/^\s*(UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)\b/i.test(sql)))
 await db.query("UPDATE public.lingxios_installation SET runtime_version='3.8.15'")
 await assert.rejects(observePublishedRuntimePatch(db,source,target),/unknown provenance/)
}))
test('product57 CAS blocks retained checkpoints, concurrent clients and complete ledger name drift',options,async()=>isolated(async db=>{
 const {source,target}=await setup(db),before=await snapshot(db)
 for(const kind of ['turn','job']){
  await db.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status)
   VALUES('private-work','tenant','agent','session',$1,'interactive','private','waiting')`,[kind])
  await db.query(`INSERT INTO lingxios.agent_steps(work_id,step_id,request_version,kind,input_hash,input)
   VALUES('private-work','step',1,'runtime.checkpoint','hash','{}')`)
  await assert.rejects(applyPublishedRuntimePatch(db,source,target),/zero live leases/)
  // Production gen13 retained one waiting turn with a runtime checkpoint but
  // zero live leases. The read-only preflight must refuse that same data shape.
  await assert.rejects(observePublishedRuntimePatch(db,source,target),/complete maintenance barrier/)
  assert.deepEqual(await snapshot(db),before)
  await db.query("DELETE FROM lingxios.agent_work_items WHERE id='private-work'")
 }
 const other=new Pool({connectionString:(db as unknown as {options:{connectionString:string}}).options.connectionString,max:1})
 try{await other.query('SELECT 1');await assert.rejects(applyPublishedRuntimePatch(db,source,target),/no other database clients/)}finally{await other.end()}
 await db.query("UPDATE public.schema_migrations SET name='renamed' WHERE version=57")
 await assert.rejects(applyPublishedRuntimePatch(db,source,target),/Installed inventory/)
 await assert.rejects(observePublishedRuntimePatch(db,source,target),/Installed inventory/)
 assert.deepEqual(await snapshot(db),before)
}))
