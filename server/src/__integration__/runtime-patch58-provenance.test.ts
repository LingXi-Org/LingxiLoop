import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Pool} from 'pg'
import {packageResources,releaseVersions} from '@lyyzka/lingxios'
import {applyPublishedRuntimePatch,assertRuntimePatchDescriptors,loadRuntimePatchInventory,observePublishedRuntimePatch,preflightPublishedRuntimePatch} from '../db/runtime-patch.js'
import {loadLockedRuntimePackage,PUBLIC_PURPOSE_SCHEMA_HASH} from '../db/runtime-profile.js'

const actual=String(releaseVersions.runtime)
const options={skip:['3.8.16','3.8.17'].includes(actual)?false:'requires the actual formal3.8.16 or3.8.17 package and matching locks'}
async function isolated(run:(db:Pool)=>Promise<void>){
 const url=new URL(process.env.DATABASE_URL??'')
 assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname));assert.match(url.pathname,/test/i)
 assert.doesNotMatch(url.pathname,/(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
 const admin=new Pool({connectionString:url.toString(),max:1}),name='runtime_patch58_test_'+randomUUID().replaceAll('-','')
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
 const migrations=await loadRuntimePatchInventory(58)
 for(const m of migrations)await db.query('INSERT INTO public.schema_migrations VALUES($1,$2,$3)',[m.version,m.name,m.checksum])
 const source={runtime:actual==='3.8.17'?'3.8.16':'3.8.15',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:58,migrations}
 const target={...source,runtime:actual,integrity:locked.integrity,tarball:locked.tarball}
 await db.query('INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256) VALUES($1,14,11,$2)',[source.runtime,source.schemaHash])
 return {source,target}
}
test('product58 permits only the reviewed exact next patch, not another patch or major',options,async()=>isolated(async db=>{
 const {source,target}=await setup(db)
 const from={...source,runtime:'3.8.16'},to={...target,runtime:'3.8.17'}
 assert.doesNotThrow(()=>assertRuntimePatchDescriptors(from,to))
 for(const runtime of ['3.8.18','4.0.0-slim.0'])assert.throws(()=>assertRuntimePatchDescriptors(from,{...to,runtime}))
 if(actual!=='3.8.17')await assert.rejects(applyPublishedRuntimePatch(db,from,to),/Exact formal runtime/)
}))
test('preflight is read-only with source clients; exact CAS preserves all data and target redeploy does not reapply',options,async()=>isolated(async db=>{
 const {source,target}=await setup(db),before=(await db.query('SELECT * FROM public.lingxios_installation')).rows
 const other=new Pool({connectionString:db.options.connectionString,max:1})
 try{
  await other.query('SELECT 1')
  assert.equal((await preflightPublishedRuntimePatch(db,source,target)).state,'source')
  assert.deepEqual((await db.query('SELECT * FROM public.lingxios_installation')).rows,before)
  await assert.rejects(applyPublishedRuntimePatch(db,source,target),/no other database clients/)
 }finally{await other.end()}
 const ledger=(await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows
 await db.query(`CREATE FUNCTION forbid_patch58_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected DDL'; END $$;
 CREATE EVENT TRIGGER forbid_patch58_ddl ON ddl_command_start EXECUTE FUNCTION forbid_patch58_ddl()`)
 assert.equal((await applyPublishedRuntimePatch(db,source,target)).updated,1)
 await assert.rejects(applyPublishedRuntimePatch(db,source,target),/source provenance changed/)
 assert.equal((await observePublishedRuntimePatch(db,source,target)).state,'target')
 assert.deepEqual((await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows,ledger)
 assert.deepEqual((await db.query('SELECT * FROM public.business_fixture')).rows,[{id:1,value:'preserve'}])
 await db.query("INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,lease_expires_at) VALUES('active','t','a','s','turn','interactive','fixture','leased',NOW()+INTERVAL '1 minute')")
 assert.equal((await preflightPublishedRuntimePatch(db,source,target)).complete,true,'installed target uses normal convergence, never another CAS')
}))
test('retained job checkpoints and unknown commit remain guarded',options,async()=>isolated(async db=>{
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
 assert.equal((await observePublishedRuntimePatch(db,source,target)).complete,true,'observe committed target; never resubmit CAS')
}))
