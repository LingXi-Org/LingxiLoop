import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fixture,baseConfig,oldImage} from './fixtures/fake-host.mjs'
import {configurationFingerprint,validatePolicy} from './adapter.mjs'
import {hash,fault} from './journal.mjs'

const privateValue='private-env-fixture-do-not-log',vision='Qwen/Qwen3-VL-32B-Instruct'
const values=text=>Object.fromEntries(text.trim().split('\n').map(row=>{const at=row.indexOf('=');return[row.slice(0,at),row.slice(at+1)]}))
function config(environment){const value=baseConfig();for(const spec of Object.values(value.services))spec.environment={...environment};return value}
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'release-config-env-')),f=fixture(directory)
 t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})})
 const local=f.local.targets['main-runtime-a'],oldText=`PRIVATE_FIXTURE=${privateValue}\n`,nextText=oldText+`OPENAI_VISION_MODEL=${vision}\n`,sourceFile=join(directory,'.env.accepted'),forwardFile=join(directory,'.env.vision'),sourceCompose=join(directory,'compose.accepted.yml'),forwardCompose=join(directory,'compose.vision.yml')
 local.composeFile=join(directory,'compose.yml');await writeFile(local.composeFile,'# source compose fixture\n');await writeFile(sourceCompose,'# accepted compose fixture\n');await writeFile(forwardCompose,'# forward compose fixture declares OPENAI_VISION_MODEL\n')
 local.envFile=join(directory,'.env');await writeFile(local.envFile,oldText,{mode:0o600});await writeFile(sourceFile,oldText,{mode:0o600});await writeFile(forwardFile,nextText,{mode:0o600})
 const oldHash=configurationFingerprint(config(values(oldText)),local),nextHash=configurationFingerprint(config(values(nextText)),local)
 local.configurationFiles={[oldHash]:{envFile:sourceFile,composeFile:sourceCompose},[nextHash]:{envFile:forwardFile,composeFile:forwardCompose}}
 const release=structuredClone(f.release);release.releaseId='versioned-env';const plan=release.targets['main-runtime-a'].hostPlan
 plan.images={web:oldImage,worker:oldImage};plan.configurationHash=nextHash;plan.recovery.configurationHash=oldHash;plan.source=structuredClone(plan.recovery)
 const manifestHash=hash(release);f.executor.register(release,manifestHash)
 const baked=JSON.parse(Buffer.from(oldImage.ociProof.config,'base64')).config.Env
 for(const container of Object.values(f.host.data.containers))container.Config={Env:[...baked,...Object.entries(values(oldText)).map(([k,v])=>`${k}=${v}`)]}
 const original=f.host.run.bind(f.host)
 f.host.run=async args=>{
  const output=await original(args)
  if(args[0]!=='compose')return output
  const environment=values(await readFile(args[args.indexOf('--env-file')+1],'utf8'))
  if(!(await readFile(args[args.indexOf('--file')+1],'utf8')).includes('OPENAI_VISION_MODEL'))delete environment.OPENAI_VISION_MODEL
  if(args.includes('config')){const value=JSON.parse(output);for(const spec of Object.values(value.services))spec.environment={...environment};return JSON.stringify(value)}
  if(args.includes('up'))f.host.data.containers[args.at(-1)].Config={Env:[...baked,...Object.entries(environment).map(([k,v])=>`${k}=${v}`)]}
  return output
 }
 const request=(phase,changes={})=>f.request(phase,phase==='prepare'?0:1,{releaseId:release.releaseId,manifestHash,...changes}),run=async phase=>{const op=f.executor.submit(request(phase)).operation;return f.executor.run(op.key)}
 return{...f,directory,local,plan,release,manifestHash,request,run,sourceFile,forwardFile,sourceCompose,forwardCompose,oldText,oldHash,nextHash}
}
test('forward-only env change prepares and applies its approved snapshot, while source/recovery retain their exact environment',async t=>{
 const f=await setup(t)
 for(const phase of ['prepare','drain','apply','verify','undrain','recovery-drain','recover','recovery-undrain'])assert.equal((await f.run(phase)).status,'succeeded',phase)
 const updates=f.host.data.calls.filter(a=>a.includes('up'));assert.deepEqual(updates.map(a=>a[a.indexOf('--env-file')+1]),[f.forwardFile,f.forwardFile,f.sourceFile,f.sourceFile])
 assert.deepEqual(updates.map(a=>a[a.indexOf('--file')+1]),[f.forwardCompose,f.forwardCompose,f.sourceCompose,f.sourceCompose])
 const stops=f.host.data.calls.filter(a=>a.includes('stop'));assert.deepEqual(stops.map(a=>a[a.indexOf('--env-file')+1]),[f.sourceFile,f.sourceFile,f.forwardFile,f.forwardFile])
 assert.equal(await readFile(f.sourceFile,'utf8'),f.oldText);assert.equal(f.host.data.containers.worker.Mounts[0].Name,'original-homes')
 assert.equal(JSON.stringify(f.journal.get(f.request('recover').releaseId+':main-runtime-a:recover')).includes(privateValue),false)
})
test('same-image apply uncertainty cannot be mis-observed as new-env success and never replays the intent',async t=>{
 const f=await setup(t)
 for(const [direction,descriptor]of [['source',f.plan.source],['forward',f.plan],['recovery',f.plan.recovery]])await f.adapter.overlay(f.request('prepare'),descriptor.images,direction,await f.adapter.resolveImages(descriptor.images,f.local))
 const op=f.executor.submit(f.request('apply')).operation;f.journal.patch(op.key,{status:'uncertain'})
 const observed=await f.executor.reconcile(f.journal.get(op.key))
 assert.equal(observed.status,'uncertain');assert.equal(observed.result.observationError.code,'CONFIGURATION_ENV_MISMATCH')
 assert.equal(f.host.data.calls.some(a=>a.includes('stop')||a.includes('up')),false)
 assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,2)
 assert.equal((await f.adapter.observe({...f.request('recover')},f.plan)).verified,true)
})
test('unapproved configuration hashes and malformed snapshot paths are rejected before a writer stop',async t=>{
 const f=await setup(t),release=structuredClone(f.release);release.releaseId='unapproved-config';release.targets['main-runtime-a'].hostPlan.configurationHash=hash('not-approved')
 assert.throws(()=>f.executor.register(release,hash(release)),{code:'CONFIGURATION_FILES_NOT_APPROVED'})
 for(const mapping of [{bad:{envFile:f.sourceFile,composeFile:f.sourceCompose}},{[f.oldHash]:{envFile:'/outside/.env',composeFile:f.sourceCompose}},{[f.oldHash]:{envFile:'relative.env',composeFile:f.sourceCompose}},{[f.oldHash]:{envFile:f.sourceFile,composeFile:'/outside/compose.yml'}},{[f.oldHash]:{envFile:f.sourceFile}},{[f.oldHash]:{envFile:f.sourceFile,composeFile:f.sourceCompose,command:'forbidden'}},{}]){
  const policy=structuredClone(f.adapter.policy);policy.targets['main-runtime-a'].configurationFiles=mapping
  assert.throws(()=>validatePolicy(policy),{code:'INVALID_CONFIGURATION_FILES_POLICY'})
 }
 assert.equal(f.host.data.calls.some(a=>a.includes('stop')||a.includes('up')),false)
})
test('candidate-supplied paths or env payloads cannot override trusted hash selection, while absent mapping keeps legacy behavior',async t=>{
 const f=await setup(t);f.plan.envFile='/remote/forbidden';f.plan.configurationFiles={[f.nextHash]:'/remote/forbidden'};f.plan.environment={PRIVATE_FIXTURE:'remote-value'}
 const args=await f.adapter.composeArgs(f.request('prepare'),'forward',f.plan);assert.equal(args[args.indexOf('--env-file')+1],f.forwardFile)
 assert.equal(args[args.indexOf('--file')+1],f.forwardCompose)
 delete f.local.configurationFiles
 for(const direction of ['source','forward','recovery']){const argv=await f.adapter.composeArgs(f.request('prepare'),direction,f.plan);assert.equal(argv[argv.indexOf('--env-file')+1],f.local.envFile)}
})
test('a different-release NodeState never selects new forward env and attempted up uncertainty never grants a guessed direction',async t=>{
 const f=await setup(t);assert.equal((await f.run('prepare')).status,'succeeded')
 f.journal.setState('main-runtime-a',{...f.journal.state('main-runtime-a'),appliedHash:hash('other-release'),appliedDirection:'forward'})
 const drain=f.executor.submit(f.request('drain')).operation,context=await f.executor.context(drain)
 assert.equal(context.currentDirection,'source');assert.equal(context.compose[context.compose.indexOf('--env-file')+1],f.sourceFile)
 f.journal.finish(drain.key,'succeeded',{drained:true})
 const apply=f.executor.submit(f.request('apply')).operation;f.journal.patch(apply.key,{status:'uncertain',steps:[{name:'forward:up:web',sideEffect:true,status:'intent'}]})
 await assert.rejects(f.executor.context(f.journal.get(apply.key)),{code:'CONFIGURATION_DIRECTION_UNPROVEN'})
 assert.equal(f.host.data.calls.some(a=>a.includes('stop')||a.includes('up')),false)
})
test('read-only same-image observation proves the new environment and retains a configuration witness for subsequent drain',async t=>{
 const f=await setup(t)
 for(const [direction,descriptor]of [['source',f.plan.source],['forward',f.plan],['recovery',f.plan.recovery]])await f.adapter.overlay(f.request('prepare'),descriptor.images,direction,await f.adapter.resolveImages(descriptor.images,f.local))
 // Simulate a lost completion receipt, with the actual target environment
 // already present. Observation must prove it, without replaying any up.
 for(const container of Object.values(f.host.data.containers))container.Config.Env.push(`OPENAI_VISION_MODEL=${vision}`)
 const op=f.executor.submit(f.request('apply')).operation;f.journal.patch(op.key,{status:'uncertain'})
 const observed=await f.executor.reconcile(f.journal.get(op.key));assert.equal(observed.status,'succeeded');assert.equal(observed.result.configurationHash,f.nextHash)
 const drain=f.executor.submit(f.request('recovery-drain')).operation,context=await f.executor.context(drain)
 assert.equal(context.currentDirection,'forward');assert.equal(context.compose[context.compose.indexOf('--env-file')+1],f.forwardFile)
 await assert.rejects(f.adapter.observe(f.request('recover'),f.plan),{code:'CONFIGURATION_ENV_MISMATCH'})
 assert.equal(f.host.data.calls.some(a=>a.includes('stop')||a.includes('up')),false)
})
test('a changed approved snapshot still fails its fingerprint before any writer stop and never exposes environment values',async t=>{
 const f=await setup(t);await writeFile(f.forwardFile,f.oldText,{mode:0o600})
 const result=await f.run('prepare');assert.equal(result.status,'failed');assert.equal(result.errors.forward.code,'CONFIGURATION_MISMATCH')
 assert.equal(JSON.stringify(result).includes(privateValue),false);assert.equal(f.host.data.calls.some(a=>a.includes('stop')||a.includes('up')),false)
})
test('a new env file paired with the old Compose cannot falsely qualify the missing vision binding',async t=>{
 const f=await setup(t);f.local.configurationFiles[f.nextHash].composeFile=f.sourceCompose
 const result=await f.run('prepare');assert.equal(result.status,'failed');assert.equal(result.errors.forward.code,'CONFIGURATION_MISMATCH')
 assert.equal(f.host.data.calls.some(a=>a.includes('stop')||a.includes('up')),false)
})
test('known apply health failure proves each completed forward/source environment before automatic compatible recovery',async t=>{
 const f=await setup(t);assert.equal((await f.run('prepare')).status,'succeeded');assert.equal((await f.run('drain')).status,'succeeded')
 const healthy=f.adapter.waitHealthy.bind(f.adapter);let first=true
 f.adapter.waitHealthy=async(...args)=>{if(first){first=false;throw Object.assign(fault('STARTUP_TIMEOUT','Known target startup failure'),{knownApplied:true})}return healthy(...args)}
 const result=await f.run('apply');assert.equal(result.status,'failed');assert.equal(result.result.recovered,true);assert.equal(result.errors.forward.code,'STARTUP_TIMEOUT');assert.equal(result.errors.recovery,null)
 const updates=f.host.data.calls.filter(a=>a.includes('up'));assert.deepEqual(updates.map(a=>[a.at(-1),a[a.indexOf('--env-file')+1]]),[['web',f.forwardFile],['web',f.sourceFile],['worker',f.sourceFile]])
 const next=f.executor.submit(f.request('recovery-drain')).operation;assert.equal((await f.executor.context(next)).currentDirection,'recovery')
})
test('knownApplied cannot bypass an unknown up receipt or an unrecognized actual environment',async t=>{
 for(const failure of ['intent','environment']){
  const f=await setup(t);await f.run('prepare');await f.run('drain')
  if(failure==='intent')f.executor.afterSideEffect=name=>{if(name==='forward:up:web')throw Object.assign(fault('STARTUP_TIMEOUT','Lost up receipt'),{knownApplied:true})}
  else f.adapter.waitHealthy=async()=>{f.host.data.containers.web.Config.Env.push('UNAPPROVED_FIXTURE=present');throw Object.assign(fault('STARTUP_TIMEOUT','Known health failure'),{knownApplied:true})}
  const result=await f.run('apply');assert.equal(result.status,'uncertain');assert.equal(f.host.data.calls.filter(a=>a.includes('up')).length,1);assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,2)
 }
})
