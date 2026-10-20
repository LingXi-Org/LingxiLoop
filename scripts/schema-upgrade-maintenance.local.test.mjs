// Opt-in local PostgreSQL only. Own tmpfs container; never shared DB/production.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash,randomBytes} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {Pool} from 'pg'
import {packageResources} from '@lyyzka/lingxios'
import {STATE_SQL,parseMarker,validateStateReceipt} from './schema-upgrade-komodo.mjs'
import {assertBarrier,assertOrdinarySchema,recoveryBoundary} from './schema-upgrade-maintenance.mjs'
const enabled=process.env.SCHEMA_UPGRADE_LOCAL_TEST==='1',run=promisify(execFile)
const docker=async args=>(await run('docker',args,{maxBuffer:2*1024*1024,timeout:30000})).stdout.trim()
test('dedicated PostgreSQL: read-only barrier rejects real sessions/leases and tracks47/48 actual state',{skip:!enabled,timeout:60000},async()=>{
 const nonce=randomBytes(6).toString('hex'),name=`lingxiloop-schema-barrier-${nonce}`,owner=`schema-barrier-${nonce}`
 const output=resolve(process.env.SCHEMA_UPGRADE_LOCAL_OUTPUT??`artifacts/schema-upgrade-local/${nonce}.json`)
 const receipt={productionRequests:0,providerRequests:0,sharedDatabaseRequests:0,sourceSchema:12,sourceSchemaHash:null,cases:[],ownedContainerRemoved:false}
 let pool,holder,created=false
 try{
  // Only read the existing local fixture image identity. Never query/mutate it.
  const image=await docker(['inspect','--format','{{.Image}}','lingxiloop-issue196-postgres-1']);assert.match(image,/^sha256:[a-f0-9]{64}$/)
  const source=new URL(process.env.DATABASE_URL);assert.equal(source.hostname,'127.0.0.1')
  const password=decodeURIComponent(source.password);assert.ok(password)
  await run('docker',['run','-d','--pull=never','--name',name,'--label',`lingxi.schema-barrier-owner=${owner}`,'--memory','512m','--tmpfs','/var/lib/postgresql/data:rw,size=512m','-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=schema_barrier_test',image],{env:{...process.env,POSTGRES_PASSWORD:password},timeout:30000,maxBuffer:100000});created=true
  let ready=false
  for(let i=0;i<40;i++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','schema_barrier_test']);ready=true;break}catch{await new Promise(r=>setTimeout(r,250))}}
  assert.ok(ready)
  const ports=JSON.parse(await docker(['inspect','--format','{{json .NetworkSettings.Ports}}',name]));assert.equal(ports['5432/tcp'][0].HostIp,'127.0.0.1')
  const url=new URL(source);url.username='postgres';url.password=password;url.port=ports['5432/tcp'][0].HostPort;url.pathname='/schema_barrier_test'
  pool=new Pool({connectionString:url.href,max:2})
  const schema=await readFile(packageResources().schema012,'utf8')
  receipt.sourceSchemaHash=createHash('sha256').update(schema).digest('hex')
  assert.equal(receipt.sourceSchemaHash,'e8c09fa33af0c073f57effa99aad7beae4f4737dd2966d6584519ec5d4aa1d1a')
  await pool.query(schema)
  assert.equal((await pool.query('SELECT version FROM lingxios.schema_version WHERE singleton')).rows[0].version,12)
  await pool.query(`CREATE TABLE public.schema_migrations(version integer PRIMARY KEY,name text,checksum text);
CREATE TABLE public.lingxios_installation(singleton boolean PRIMARY KEY DEFAULT true,runtime_version text,schema_version int,protocol_version int,schema_sha256 text);
INSERT INTO public.schema_migrations SELECT n,'fixture_'||n,repeat('c',64) FROM generate_series(1,46)n;
INSERT INTO public.lingxios_installation VALUES(true,'3.5.6',12,11,repeat('c',64));`)
  const query=async()=>{
   const all=await pool.query(STATE_SQL),r=all.find(x=>x.rows?.length)?.rows[0]
   return validateStateReceipt(parseMarker({status:'Complete',success:true,logs:[{stdout:Object.values(r)[0]}]},'STATE'))
  }
  let state=await query();assertBarrier(state);assert.equal(state.schema,12);assert.equal(state.product,46)
  assert.throws(()=>assertOrdinarySchema(state,{schema:13}));receipt.cases.push('empty-native12-rejects-ordinary-upgrade')
  // Same query in a true read-only transaction rejects writes, no query timeout
  // or privilege error is treated as an empty result.
  await assert.rejects(pool.query("BEGIN READ ONLY; INSERT INTO public.schema_migrations VALUES(99,'forbidden','x'); COMMIT"),e=>e.code==='25006');await pool.query('ROLLBACK')
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,46);receipt.cases.push('read-only-enforced')
  holder=new Pool({connectionString:url.href,max:1});await holder.query('SELECT 1')
  state=await query();assert.equal(state.otherClients,1);assert.throws(()=>assertBarrier(state));await holder.end();holder=null;receipt.cases.push('idle-other-client-rejected')
  // Public native schema fixture, with only the required lease columns supplied.
  await pool.query("INSERT INTO lingxios.agent_os_session_leases(session_key,work_id,fence,expires_at) VALUES('synthetic','synthetic',1,NOW()+INTERVAL '1 minute')")
  state=await query();assert.equal(state.liveSession,1);assert.throws(()=>assertBarrier(state));await pool.query('DELETE FROM lingxios.agent_os_session_leases');receipt.cases.push('live-native-session-lease-rejected')
  await pool.query("BEGIN; UPDATE lingxios.schema_version SET version=13; UPDATE public.lingxios_installation SET schema_version=13; INSERT INTO schema_migrations VALUES(47,'continuity',repeat('d',64)); COMMIT")
  state=await query();assert.equal(state.product,47);assert.equal(recoveryBoundary(state,{}),'fix-forward');assertOrdinarySchema(state,{schema:13});receipt.cases.push('actual47-requires-fix-forward')
  await assert.rejects(pool.query("BEGIN; INSERT INTO schema_migrations VALUES(48,'later',repeat('e',64)); SELECT 1/0; COMMIT"));await pool.query('ROLLBACK')
  assert.equal((await query()).product,47);receipt.cases.push('failed48-preserves47')
  await pool.query("INSERT INTO schema_migrations VALUES(48,'later',repeat('e',64))");state=await query();assert.equal(state.product,48);assertBarrier(state);receipt.cases.push('actual48-remains-fix-forward')
 }finally{
  await holder?.end();await pool?.end()
  if(created){assert.equal(await docker(['inspect','--format','{{index .Config.Labels "lingxi.schema-barrier-owner"}}',name]),owner);await docker(['rm','--force',name]);receipt.ownedContainerRemoved=true}
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600})
 }
})
