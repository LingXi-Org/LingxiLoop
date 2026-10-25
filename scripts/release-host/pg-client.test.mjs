import test from 'node:test'
import assert from 'node:assert/strict'
import { readPgState,STATE_SQL,MAX_STATE_BYTES } from './pg-client.mjs'
import { databaseEvidence,localControl } from './local-control.mjs'
import { hash } from './journal.mjs'
const image=`sha256:${'a'.repeat(64)}`,secret='synthetic-private-password',url=`postgresql://private:${secret}@10.20.0.2:5433/lingxiloop`,migrations=[{version:1,name:'initial',checksum:'b'.repeat(64)}]
const contract={nativeSchema:14,productSchema:1,api:'api-v1',worker:'worker-v1',checkpoint:'checkpoint-v1',control:'11',capabilities:[]}
const state={nativeSchema:14,installedSchema:14,productSchema:1,migrationCount:1,schemaHash:'c'.repeat(64),protocolVersion:11,migrations,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:0}
function policy(){return{stateDirectory:'/var/lib/lingxi-release',database:{transport:'cached-client',clientImage:image,envFile:'/etc/lingxi-release/secrets/original-app-b.env',clientWorkdir:'/app',profiles:{[`14:1:${state.schemaHash}`]:{contract,migrationsHash:hash(migrations),protocolVersion:11,requiredCapabilities:[]}}},targets:{'main-runtime-b':{adapter:'main-runtime',services:{}}}}}
function clientFixture({connectError,queryError,result=state}={}){const calls=[];class Client{constructor(config){calls.push(['config',config])}async connect(){calls.push(['connect']);if(connectError)throw connectError}async query(sql){calls.push(['query',sql]);if(queryError)throw queryError;return[{rows:[]},{rows:[{state:JSON.stringify(result)}]},{rows:[]}]}async end(){calls.push(['end'])}}return{calls,loadPg:()=>({Client})}}
test('cached-client uses only fixed read-only SQL, bounded metadata and finally closes the connection',async()=>{
  const f=clientFixture(),actual=await readPgState({env:{DATABASE_URL:url,REMOTE_SQL:'DROP DATABASE forbidden'},loadPg:f.loadPg})
  assert.deepEqual(actual,state);assert.equal(f.calls.filter(call=>call[0]==='query').length,1);assert.equal(f.calls.find(call=>call[0]==='query')[1],STATE_SQL)
  assert.match(STATE_SQL,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(STATE_SQL,/statement_timeout='5s'/);assert.match(STATE_SQL,/COMMIT;$/)
  assert.deepEqual(f.calls.at(-1),['end']);assert.equal(f.calls[0][1].application_name,'lingxi-release-observer')
})
for(const stage of ['connect','query'])test(`observer ${stage} failure closes its client and never emits the connection URL or raw driver message`,async()=>{
  const f=clientFixture({[`${stage}Error`]:Object.assign(Error(`driver ${url} ${secret}`),{code:'42P01'})})
  await assert.rejects(readPgState({env:{DATABASE_URL:url},loadPg:f.loadPg}),error=>{assert.equal(error.code,'PG_CLIENT_FAILED');assert.equal(error.sqlState,'42P01');assert.ok(!error.message.includes(secret));assert.ok(!error.message.includes(url));return true})
  assert.deepEqual(f.calls.at(-1),['end'])
})
test('observer rejects unproven or oversized output without returning it',async()=>{
  for(const result of [{...state,readOnly:false},{...state,runtime:secret.repeat(Math.ceil(MAX_STATE_BYTES/secret.length)+1)}]){
    const f=clientFixture({result});await assert.rejects(readPgState({env:{DATABASE_URL:url},loadPg:f.loadPg}),{code:'PG_CLIENT_FAILED'});assert.deepEqual(f.calls.at(-1),['end'])
  }
})
test('B state/barrier inspect the cached local image then run a restricted one-off, with no Web/Worker exec or registry operation',async()=>{
  const calls=[],run=async(args,options)=>{calls.push({args,options});if(args[0]==='image')return JSON.stringify([{Id:image,Os:'linux',Architecture:'amd64'}]);return JSON.stringify(state)}
  const actual=await databaseEvidence(policy(),run);assert.equal(actual.verified,true)
  const barrier=await localControl(policy(),'barrier',{target:'main-runtime-b'},{run});assert.equal(barrier.drained,true)
  const commands=calls.filter(call=>call.args[0]==='run');assert.equal(commands.length,2)
  for(const{args,options}of commands){assert.equal(args[args.indexOf('--pull')+1],'never');assert.equal(args[args.indexOf('--network')+1],'host');assert.ok(args.includes('--read-only'));assert.equal(args[args.indexOf('--cap-drop')+1],'ALL');assert.equal(args[args.indexOf('--pids-limit')+1],'32');assert.equal(args[args.indexOf('--memory')+1],'128m');assert.equal(args[args.indexOf('--entrypoint')+1],'node');assert.equal(args.at(-2),image);assert.equal(args.at(-1),'/opt/release/pg-client.mjs');assert.match(args[args.indexOf('--mount')+1],/^type=bind,source=\/opt\/lingxi-release\/current\/scripts\/release-host\/pg-client.mjs,target=\/opt\/release\/pg-client.mjs,readonly$/);assert.equal(options.timeout,30000);assert.ok(!JSON.stringify(args).includes(secret));assert.ok(!args.includes(STATE_SQL))}
  assert.equal(calls.some(({args})=>args[0]==='exec'||args.includes('build')||args[0]==='image'&&args[1]==='pull'),false)
})
test('an absent/mismatching client image or unpinned tag cannot start a database client',async()=>{
  const calls=[],run=async args=>{calls.push(args);return JSON.stringify([{Id:`sha256:${'d'.repeat(64)}`,Os:'linux',Architecture:'amd64'}])}
  await assert.rejects(databaseEvidence(policy(),run),{code:'DATABASE_CLIENT_IMAGE_MISMATCH'});assert.equal(calls.some(args=>args[0]==='run'),false)
  const invalid=policy();invalid.database.clientImage='ghcr.io/lingxi-org/lingxiloop-server:latest';await assert.rejects(databaseEvidence(invalid,run),{code:'DATABASE_CLIENT_POLICY_INVALID'})
})
test('A retains fixed local PostgreSQL socket transport',async()=>{
  const local=policy();local.database={...local.database,transport:'local-container',container:'existing-postgres',user:'postgres',database:'lingxiloop'}
  const calls=[],run=async args=>{calls.push(args);return JSON.stringify(state)}
  assert.equal((await databaseEvidence(local,run)).verified,true);assert.equal(calls[0][0],'exec');assert.equal(calls[0][3],'existing-postgres');assert.equal(calls[0].at(-1),STATE_SQL);assert.equal(calls.some(args=>args[0]==='run'),false)
})
