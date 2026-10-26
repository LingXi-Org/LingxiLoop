import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { databaseTool } from './database-tools.mjs'
import { databaseEvidence } from './local-control.mjs'
import { ComposeAdapter } from './adapter.mjs'
import { Executor,Journal } from './executor.mjs'
import { hash } from './journal.mjs'
import { manifest,policy,contract } from './fixtures/fake-host.mjs'
const exec = promisify(execFile)
const archiveProbe=async(policy,op,{dumpHash})=>({complete:true,dumpHash,manifestHash:op.manifestHash,generation:op.generation})

test('isolated real PostgreSQL snapshot/restore verifies all-table counts and separates cleanup failure', { skip:process.env.RELEASE_HOST_DOCKER_TEST !== '1' },async t=>{
  const binary = process.env.RELEASE_HOST_DOCKER_BIN ?? '/usr/local/bin/docker', directory = await mkdtemp(join(tmpdir(),'release-host-pg-')), container = `lingxi-release-host-fixture-${process.pid}`
  const run = async args=>(await exec(binary,args,{ encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000 })).stdout
  t.after(async()=>{ await run(['rm','--force',container]).catch(()=>{}); await rm(directory,{ recursive:true,force:true }) })
  await run(['run','--detach','--rm','--pull','never','--network','none','--memory','512m','--cpus','1','--tmpfs','/var/lib/postgresql/data:rw','--name',container,'--env','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector:pg16'])
  const deadline = Date.now()+30000
  while (true) { try { assert.equal((await run(['exec',container,'cat','/proc/1/comm'])).trim(),'postgres'); await run(['exec',container,'pg_isready','--username','postgres']); break } catch(error) { if(Date.now()>deadline)throw error; await new Promise(resolve=>setTimeout(resolve,200)) } }
  const checksum = 'a'.repeat(64), schemaHash = 'b'.repeat(64), migrations = [{ version:1,name:'fixture',checksum }]
  await run(['exec','--user','postgres',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-c',`CREATE SCHEMA lingxios;
    CREATE TABLE lingxios.schema_version(singleton boolean PRIMARY KEY,version integer); INSERT INTO lingxios.schema_version VALUES(true,14);
    CREATE TABLE public.lingxios_installation(singleton boolean PRIMARY KEY,schema_version integer,runtime_version text,protocol_version integer,schema_sha256 text); INSERT INTO public.lingxios_installation VALUES(true,14,'fixture',11,'${schemaHash}');
    CREATE TABLE public.schema_migrations(version integer,name text,checksum text); INSERT INTO public.schema_migrations VALUES(1,'fixture','${checksum}');
    CREATE TABLE lingxios.agent_work_items(id text,kind text,status text,lease_expires_at timestamptz);
    CREATE TABLE lingxios.agent_steps(work_id text,kind text);
    CREATE TABLE lingxios.agent_os_session_leases(expires_at timestamptz);
    CREATE TABLE lingxios.agent_attempts(ended_at timestamptz,lease_expires_at timestamptz);
    CREATE TABLE lingxios.agent_memory_capture(completed_at timestamptz,claim_token text,claim_until timestamptz);
    CREATE TABLE lingxios.agent_delivery_outbox(delivered_at timestamptz,claim_token text,available_at timestamptz);
    CREATE TABLE lingxios.agent_run_events(LIKE lingxios.agent_delivery_outbox);
    CREATE TABLE lingxios.agent_model_budget_calls(LIKE lingxios.agent_delivery_outbox);
    CREATE TABLE lingxios.agent_terminal_outbox(LIKE lingxios.agent_delivery_outbox);
    CREATE TABLE public.private_fixture(tenant text,body text); INSERT INTO public.private_fixture VALUES('tenant-a','synthetic row a'),('tenant-b','synthetic row b');`])
  const local = policy(directory), release = manifest(directory), sourceContract={ ...contract,productSchema:1 },targetContract={ ...contract,productSchema:2 }
  local.dockerBinary=binary; local.archive={baseUrl:'https://archive.fixture.invalid',tokenFile:'/fixed/test-token'};local.database={ container,user:'postgres',database:'postgres',profiles:{ [`14:1:${schemaHash}`]:{ migrationsHash:hash(migrations),protocolVersion:11,contract:sourceContract,requiredCapabilities:contract.capabilities } } }
  const target=release.targets['main-runtime-a']; target.contract=targetContract; target.hostPlan.contract=targetContract; target.hostPlan.recovery.contract=sourceContract
  target.hostPlan.source=structuredClone(target.hostPlan.recovery)
  target.hostPlan.database={ from:{ nativeSchema:14,productSchema:1 },to:{ nativeSchema:14,productSchema:2 },migrations:[{ version:1,checksum },{ version:2,checksum:'c'.repeat(64) }],strategy:'maintenance',rpo:'zero-committed-writes' }
  const journal=new Journal(join(directory,'journal.sqlite'));t.after(()=>journal.close())
  const executor=new Executor({ journal,adapter:new ComposeAdapter(local) }),manifestHash=hash(release);executor.register(release,manifestHash)
  const op={ releaseId:release.releaseId,target:'main-runtime-a',phase:'backup',generation:1,manifestHash,parameters:{} }
  const actual=await databaseEvidence(local,run);assert.equal(actual.verified,true);assert.equal(actual.otherClients,0)
  await run(['exec','--user','postgres',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-c',`INSERT INTO lingxios.agent_work_items(id,kind,status) VALUES ('waiting-turn','turn','waiting'),('unbound','turn','waiting'),('completed','turn','completed'),('waiting-job','job','waiting');
    INSERT INTO lingxios.agent_steps VALUES ('waiting-turn','runtime.binding'),('waiting-turn','runtime.checkpoint'),('completed','runtime.checkpoint'),('waiting-job','runtime.binding');`])
  const blocked=await databaseEvidence(local,run);assert.equal(blocked.incompatibleRuns,2);assert.equal(blocked.liveWork,0)
  await run(['exec','--user','postgres',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-c',"UPDATE lingxios.agent_work_items SET status='completed' WHERE id IN ('waiting-turn','waiting-job')"])
  assert.equal((await databaseEvidence(local,run)).incompatibleRuns,0)
  await assert.rejects(databaseTool(local,'backup',op,{run,archiveUpload:async()=>{throw Object.assign(Error('Injected lost archive response'),{code:'ARCHIVE_UPLOAD_UNCONFIRMED',uncertain:true})},archiveObserve:archiveProbe}),{code:'ARCHIVE_UPLOAD_UNCONFIRMED'})
  // The real local dump remains; GET-only archive observation can complete the interrupted backup without redumping/reuploading.
  const backup=await databaseTool(local,'backupObserve',op,{run,archiveObserve:archiveProbe});assert.equal(backup.complete,true);assert.equal(backup.rpo,'zero-committed-writes');assert.equal(backup.archive.dumpHash,backup.dumpHash)
  assert.equal((await databaseTool(local,'backupObserve',op,{ run,archiveUpload:archiveProbe,archiveObserve:archiveProbe })).dumpHash,backup.dumpHash)
  const cleanupFailureRun=async args=>{ if(args.includes('dropdb'))throw Error('Injected isolated cleanup failure');return run(args) }
  const restore=await databaseTool(local,'restoreVerify',{ ...op,phase:'restore-verify' },{ run:cleanupFailureRun,archiveUpload:archiveProbe,archiveObserve:archiveProbe })
  assert.equal(restore.complete,true);assert.equal(restore.countsHash,backup.countsHash);assert.equal(restore.cleanupErrors[0].code,'ISOLATED_DATABASE_CLEANUP_FAILED')
  const observed=await databaseTool(local,'restoreVerifyObserve',op,{ run,archiveUpload:archiveProbe,archiveObserve:archiveProbe });assert.equal(observed.complete,true)
  const after=await databaseEvidence(local,run);assert.equal(after.nativeSchema,14);assert.equal(after.productSchema,1)
  assert.equal((await run(['exec','--user','postgres',container,'psql','-X','-qAt','-c','SELECT count(*) FROM public.private_fixture'])).trim(),'2')
})
