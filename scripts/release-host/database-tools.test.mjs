import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Executor,Journal } from './executor.mjs'
import { ComposeAdapter } from './adapter.mjs'
import { databaseTool } from './database-tools.mjs'
import {databaseFixture} from './fixtures/runtime-patch.mjs'
import {runtimePatchPlanHash} from './runtime-patch.mjs'
import { hash } from './journal.mjs'
import { policy,manifest,contract,newImage } from './fixtures/fake-host.mjs'
const archiveProbe=async(policy,op,{dumpHash})=>({complete:true,dumpHash,manifestHash:op.manifestHash,generation:op.generation})
async function setup(t,{patch=false}={}) {
  const directory=await mkdtemp(join(tmpdir(),'release-migrate-')),local=policy(directory),release=manifest(directory),target=release.targets['main-runtime-a'],schemaHash=(patch?'a':'d').repeat(64)
  let migrations=[{version:1,name:'first',checksum:'a'.repeat(64)},{version:2,name:'second',checksum:'b'.repeat(64)}]
  target.hostPlan.source=structuredClone(target.hostPlan.recovery);target.hostPlan.source.contract={...contract,productSchema:1}
  target.contract={...contract,productSchema:2};target.hostPlan.contract=target.contract;target.hostPlan.recovery.contract=target.contract;target.hostPlan.recovery.images=target.hostPlan.images
  target.hostPlan.database={strategy:'maintenance',rpo:'zero-committed-writes',from:{nativeSchema:14,productSchema:1},to:{nativeSchema:14,productSchema:2},migrations:migrations.map(({version,checksum})=>({version,checksum}))}
  if(patch){target.hostPlan.database={...target.hostPlan.database,...databaseFixture()};migrations=target.hostPlan.database.runtimePatch.source.migrations;for(const descriptor of [target.hostPlan.source,target.hostPlan,target.hostPlan.recovery])descriptor.contract={...contract,productSchema:57};target.contract=target.hostPlan.contract}
  local.targets['main-runtime-a'].migration={service:'db-migrate',imageService:'web'}
  local.archive={baseUrl:'https://archive.fixture.invalid',tokenFile:'/fixed/test-token'};local.database={container:'postgres-fixed',user:'postgres',database:'fixture',migrationHostname:'postgres',profiles:Object.fromEntries((patch?[57]:[1,2]).map(version=>[`14:${version}:${schemaHash}`,{contract:{...contract,productSchema:version},migrationsHash:hash(migrations.slice(0,version)),protocolVersion:11,requiredCapabilities:contract.capabilities}]))}
  const journal=new Journal(join(directory,'journal.sqlite')),executor=new Executor({journal,adapter:new ComposeAdapter(local)}),manifestHash=hash(release);executor.register(release,manifestHash)
  t.after(async()=>{journal.close();await rm(directory,{recursive:true,force:true})})
  const output=join(directory,release.releaseId,'database');await mkdir(output,{recursive:true});const dump=Buffer.from('synthetic qualified backup'),dumpHash=`sha256:${createHash('sha256').update(dump).digest('hex')}`
  await writeFile(join(output,'backup.dump'),dump);await writeFile(join(output,'backup.json'),JSON.stringify({complete:true,manifestHash,dumpHash}));await writeFile(join(output,'restore-verified.json'),JSON.stringify({complete:true,manifestHash,dumpHash,cleanupErrors:[]}))
  let version=patch?57:1,exitCode=0,hostname='postgres',runtime='3.8.12';const calls=[]
  const run=async args=>{calls.push(args);if(args[0]==='image')return JSON.stringify([{Id:newImage.configDigest,RepoDigests:[newImage.ref],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:newImage.diffIds}}]);if(args[0]==='container')return JSON.stringify([{Image:newImage.configDigest,State:{Status:'exited',Running:false,ExitCode:exitCode}}]);if(args.includes('psql'))return JSON.stringify({runtime,nativeSchema:14,installedSchema:14,productSchema:version,migrationCount:version,schemaHash,protocolVersion:11,migrations:migrations.slice(0,version),readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:0});if(args.includes('config'))return JSON.stringify({services:{'db-migrate':{image:newImage.configDigest,pull_policy:'never',restart:'no',command:['npm','run','db:migrate'],environment:{DATABASE_URL:`postgresql://postgres@${hostname}/fixture`}}}});if(args.includes('run')){version=patch?57:2;return ''}throw Error('Unexpected fixed test argv')}
  return {local,run,calls,directory,release,patch:target.hostPlan.database.runtimePatch,setRuntime:value=>runtime=value,configurationHash:target.hostPlan.configurationHash,op:{releaseId:release.releaseId,target:'main-runtime-a',phase:'migrate',generation:1,manifestHash,parameters:{}},setExitCode:value=>exitCode=value,setHostname:value=>hostname=value}
}
test('fixed offline migration checks exact source prefix and destination, then final container exit and target ledger',async t=>{
  const f=await setup(t),receipt=await databaseTool(f.local,'migrate',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe})
  assert.equal(receipt.complete,true);assert.equal(receipt.productSchema,2)
  const runs=f.calls.filter(args=>args.includes('run'));assert.equal(runs.length,1);assert.ok(runs[0].includes('--no-deps'));assert.equal(runs[0][runs[0].indexOf('--pull')+1],'never');assert.ok(runs[0].includes('--name'));assert.ok(!runs[0].includes('--rm'))
  assert.equal((await databaseTool(f.local,'migrateObserve',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe})).complete,true)
  assert.equal(f.calls.filter(args=>args.includes('run')).length,1)
})
test('target ledger alone cannot claim completion when migration command ancillary effects failed',async t=>{
  const f=await setup(t);await databaseTool(f.local,'migrate',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe});f.setExitCode(1)
  await assert.rejects(databaseTool(f.local,'migrateObserve',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe}),{code:'MIGRATION_OUTCOME_UNRESOLVED'})
})
test('migration refuses a Compose environment pointing at a different database host before one-off execution',async t=>{
  const f=await setup(t);f.setHostname('different-postgres')
  await assert.rejects(databaseTool(f.local,'migrate',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe}),{code:'MIGRATION_DESTINATION_MISMATCH'})
  assert.equal(f.calls.some(args=>args.includes('run')),false)
})
test('migration cannot progress when the archived exact dump is no longer confirmed',async t=>{
  const f=await setup(t)
  await assert.rejects(databaseTool(f.local,'migrate',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:async()=>{throw Object.assign(Error('Unconfirmed'),{code:'ARCHIVE_NOT_CONFIRMED',uncertain:true})}}),{code:'ARCHIVE_NOT_CONFIRMED'})
  assert.equal(f.calls.some(args=>args.includes('run')),false)
})
test('fixed migration config and one-off both select the approved forward configuration snapshot',async t=>{
 const f=await setup(t),snapshot='/fixed/.env.approved-forward',compose='/fixed/compose.approved-forward.yml';f.local.targets['main-runtime-a'].configurationFiles={[f.configurationHash]:{envFile:snapshot,composeFile:compose}}
 assert.equal((await databaseTool(f.local,'migrate',f.op,{run:f.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe})).complete,true)
 const commands=f.calls.filter(args=>args[0]==='compose');assert.equal(commands.length,2)
 for(const args of commands){assert.equal(args[args.indexOf('--env-file')+1],snapshot);assert.equal(args[args.indexOf('--file')+1],compose)}
})

function patchHelper(f,{lost=false,commit=true}={}){
 const calls=[];let state='source'
 return {calls,setState:value=>state=value,run:async(argv,body)=>{
  const action=argv.at(-1);calls.push({argv,body:structuredClone(body)})
  assert.deepEqual(body,f.patch);assert.equal(argv[0],'/usr/bin/docker');assert.ok(argv.includes('--no-deps'));assert.equal(argv[argv.indexOf('--pull')+1],'never');assert.ok(argv.includes('--interactive'));assert.ok(argv.includes('--no-TTY'));assert.ok(argv.includes('--rm'));assert.equal(argv[argv.indexOf('--entrypoint')+1],'node');assert.deepEqual(argv.slice(-4),['--import','tsx','server/src/runtime-patch-bin.ts',action]);assert.ok(!argv.some(a=>a.includes('postgresql:')))
  const base={action,source:'3.8.12',target:'3.8.13',schema:14,product:57,planHash:runtimePatchPlanHash(f.patch)}
  if(action==='apply'){assert.ok(argv.includes('LINGXIOS_SCHEMA_UPGRADE_DRAINED=true'));if(commit){state='target';f.setRuntime('3.8.13')}if(lost)throw Error('Simulated lost COMMIT response');return {...base,complete:true,updated:1}}
  assert.ok(!argv.includes('LINGXIOS_SCHEMA_UPGRADE_DRAINED=true'));return {...base,complete:state==='target',state,observationOnly:true}
 }}
}
const patchOptions=(f,h)=>({run:f.run,helper:h.run,archiveUpload:archiveProbe,archiveObserve:archiveProbe})
test('product57 CAS uses only registered descriptors and qualified offline image before original migration',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f),opts=patchOptions(f,h)
 const result=await databaseTool(f.local,'migrate',f.op,opts)
 assert.equal(result.complete,true);assert.equal(result.migrationExecution,'retained-oneoff-exit-zero');assert.equal(result.runtimePatch.state,'target')
 assert.equal(h.calls.filter(c=>c.argv.at(-1)==='apply').length,1);assert.equal(f.calls.filter(args=>args.includes('run')).length,1)
 await databaseTool(f.local,'migrate',f.op,opts)
 assert.equal(h.calls.filter(c=>c.argv.at(-1)==='apply').length,1);assert.equal(f.calls.filter(args=>args.includes('run')).length,1)
})
test('lost CAS reply after commit resumes via readonly equivalent postcondition without dispatching migration',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f,{lost:true}),opts=patchOptions(f,h)
 await assert.rejects(databaseTool(f.local,'migrate',f.op,opts),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED',uncertain:true})
 assert.equal(f.calls.some(args=>args.includes('run')),false)
 const result=await databaseTool(f.local,'migrateObserve',f.op,opts)
 assert.equal(result.complete,true);assert.equal(result.migrationExecution,'not-attempted');assert.equal(result.equivalentPostcondition,'unchanged-product57-exact-target-provenance')
 await databaseTool(f.local,'migrate',f.op,opts)
 assert.equal(h.calls.filter(c=>c.argv.at(-1)==='apply').length,1);assert.equal(f.calls.some(args=>args.includes('run')),false)
})
test('uncertain CAS observed at source never authorizes CAS or migration replay',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f,{lost:true,commit:false}),opts=patchOptions(f,h)
 await assert.rejects(databaseTool(f.local,'migrate',f.op,opts),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED'})
 for(const action of ['migrateObserve','migrate'])await assert.rejects(databaseTool(f.local,action,f.op,opts),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED'})
 assert.equal(h.calls.filter(c=>c.argv.at(-1)==='apply').length,1);assert.equal(f.calls.some(args=>args.includes('run')),false)
})
test('runtime patch cannot bypass archive, verified restore, exact destination or independent target runtime',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f,{lost:true}),opts=patchOptions(f,h)
 await assert.rejects(databaseTool(f.local,'migrate',f.op,{...opts,archiveObserve:async()=>{throw Object.assign(Error('absent'),{code:'ARCHIVE_NOT_CONFIRMED'})}}),{code:'ARCHIVE_NOT_CONFIRMED'});assert.equal(h.calls.length,0)
 await rm(join(f.directory,f.op.releaseId,'database','restore-verified.json'))
 await assert.rejects(databaseTool(f.local,'migrate',f.op,opts),{code:'ENOENT'});assert.equal(h.calls.length,0)
})
test('CAS observer target boolean alone cannot substitute exact independent runtime provenance or exit evidence',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f),opts=patchOptions(f,h)
 await databaseTool(f.local,'migrate',f.op,opts)
 f.setRuntime('3.8.12');await assert.rejects(databaseTool(f.local,'migrateObserve',f.op,opts),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED'})
 f.setRuntime('3.8.13');f.setExitCode(137);await assert.rejects(databaseTool(f.local,'migrateObserve',f.op,opts),{code:'MIGRATION_OUTCOME_UNRESOLVED'})
 assert.equal(h.calls.filter(c=>c.argv.at(-1)==='apply').length,1)
})
test('lost migration subprocess reply after CAS only observes its retained one-off, never replays either write',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f),opts=patchOptions(f,h)
 opts.run=async(args,options)=>{const result=await f.run(args,options);if(args.includes('run'))throw Object.assign(Error('lost subprocess reply'),{uncertain:true});return result}
 await assert.rejects(databaseTool(f.local,'migrate',f.op,opts),{uncertain:true})
 const result=await databaseTool(f.local,'migrateObserve',f.op,opts)
 assert.equal(result.complete,true);assert.equal(result.migrationExecution,'retained-oneoff-exit-zero')
 assert.equal(h.calls.filter(c=>c.argv.at(-1)==='apply').length,1);assert.equal(f.calls.filter(args=>args.includes('run')).length,1)
})
test('runtime patch action rejects remote parameters and non-owner before helper or Docker side effects',async t=>{
 const f=await setup(t,{patch:true}),h=patchHelper(f),opts=patchOptions(f,h)
 await assert.rejects(databaseTool(f.local,'migrate',{...f.op,parameters:{source:f.patch.source}},opts),{code:'INVALID_DATABASE_PARAMETERS'})
 f.local.targets['main-runtime-a'].databaseOwner=false
 await assert.rejects(databaseTool(f.local,'migrate',f.op,opts),{code:'DATABASE_OWNER_REQUIRED'})
 assert.equal(h.calls.length,0);assert.equal(f.calls.length,0)
})
