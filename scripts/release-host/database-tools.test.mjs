import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Executor,Journal } from './executor.mjs'
import { ComposeAdapter } from './adapter.mjs'
import { databaseTool } from './database-tools.mjs'
import { hash } from './journal.mjs'
import { policy,manifest,contract,newImage } from './fixtures/fake-host.mjs'
async function setup(t) {
  const directory=await mkdtemp(join(tmpdir(),'release-migrate-')),local=policy(directory),release=manifest(directory),target=release.targets['main-runtime-a'],schemaHash='d'.repeat(64)
  const migrations=[{version:1,name:'first',checksum:'a'.repeat(64)},{version:2,name:'second',checksum:'b'.repeat(64)}]
  target.hostPlan.source=structuredClone(target.hostPlan.recovery);target.hostPlan.source.contract={...contract,productSchema:1}
  target.contract={...contract,productSchema:2};target.hostPlan.contract=target.contract;target.hostPlan.recovery.contract=target.contract;target.hostPlan.recovery.images=target.hostPlan.images
  target.hostPlan.database={strategy:'maintenance',rpo:'zero-committed-writes',from:{nativeSchema:14,productSchema:1},to:{nativeSchema:14,productSchema:2},migrations:migrations.map(({version,checksum})=>({version,checksum}))}
  local.targets['main-runtime-a'].migration={service:'db-migrate',imageService:'web'}
  local.database={container:'postgres-fixed',user:'postgres',database:'fixture',migrationHostname:'postgres',profiles:Object.fromEntries([1,2].map(version=>[`14:${version}:${schemaHash}`,{contract:{...contract,productSchema:version},migrationsHash:hash(migrations.slice(0,version)),protocolVersion:11,requiredCapabilities:contract.capabilities}]))}
  const journal=new Journal(join(directory,'journal.sqlite')),executor=new Executor({journal,adapter:new ComposeAdapter(local)}),manifestHash=hash(release);executor.register(release,manifestHash)
  t.after(async()=>{journal.close();await rm(directory,{recursive:true,force:true})})
  const output=join(directory,release.releaseId,'database');await mkdir(output,{recursive:true});const dump=Buffer.from('synthetic qualified backup'),dumpHash=`sha256:${createHash('sha256').update(dump).digest('hex')}`
  await writeFile(join(output,'backup.dump'),dump);await writeFile(join(output,'backup.json'),JSON.stringify({complete:true,manifestHash,dumpHash}));await writeFile(join(output,'restore-verified.json'),JSON.stringify({complete:true,manifestHash,dumpHash,cleanupErrors:[]}))
  let version=1,exitCode=0,hostname='postgres';const calls=[]
  const run=async args=>{calls.push(args);if(args[0]==='container')return JSON.stringify([{Image:newImage.configDigest,State:{Status:'exited',Running:false,ExitCode:exitCode}}]);if(args.includes('psql'))return JSON.stringify({nativeSchema:14,installedSchema:14,productSchema:version,migrationCount:version,schemaHash,protocolVersion:11,migrations:migrations.slice(0,version),readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:0});if(args.includes('config'))return JSON.stringify({services:{'db-migrate':{image:newImage.ref,pull_policy:'never',restart:'no',command:['npm','run','db:migrate'],environment:{DATABASE_URL:`postgresql://postgres@${hostname}/fixture`}}}});if(args.includes('run')){version=2;return ''}throw Error('Unexpected fixed test argv')}
  return {local,run,calls,op:{releaseId:release.releaseId,target:'main-runtime-a',phase:'migrate',generation:1,manifestHash,parameters:{}},setExitCode:value=>exitCode=value,setHostname:value=>hostname=value}
}
test('fixed offline migration checks exact source prefix and destination, then final container exit and target ledger',async t=>{
  const f=await setup(t),receipt=await databaseTool(f.local,'migrate',f.op,{run:f.run})
  assert.equal(receipt.complete,true);assert.equal(receipt.productSchema,2)
  const runs=f.calls.filter(args=>args.includes('run'));assert.equal(runs.length,1);assert.ok(runs[0].includes('--no-deps'));assert.equal(runs[0][runs[0].indexOf('--pull')+1],'never');assert.ok(runs[0].includes('--name'));assert.ok(!runs[0].includes('--rm'))
  assert.equal((await databaseTool(f.local,'migrateObserve',f.op,{run:f.run})).complete,true)
  assert.equal(f.calls.filter(args=>args.includes('run')).length,1)
})
test('target ledger alone cannot claim completion when migration command ancillary effects failed',async t=>{
  const f=await setup(t);await databaseTool(f.local,'migrate',f.op,{run:f.run});f.setExitCode(1)
  await assert.rejects(databaseTool(f.local,'migrateObserve',f.op,{run:f.run}),{code:'MIGRATION_OUTCOME_UNRESOLVED'})
})
test('migration refuses a Compose environment pointing at a different database host before one-off execution',async t=>{
  const f=await setup(t);f.setHostname('different-postgres')
  await assert.rejects(databaseTool(f.local,'migrate',f.op,{run:f.run}),{code:'MIGRATION_DESTINATION_MISMATCH'})
  assert.equal(f.calls.some(args=>args.includes('run')),false)
})
