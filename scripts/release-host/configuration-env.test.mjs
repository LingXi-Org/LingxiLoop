import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fixture,baseConfig,oldImage} from './fixtures/fake-host.mjs'
import {configurationFingerprint,validatePolicy} from './adapter.mjs'
import {hash,fault} from './journal.mjs'
import {createExecutorServer} from './server.mjs'

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
async function partialForward(t){
 const f=await setup(t);await f.run('prepare');await f.run('drain')
 const control=f.adapter.control.bind(f.adapter)
 f.adapter.control=async(local,action,body,method)=>{if(action==='readiness'&&body.direction==='forward')throw fault('READINESS_UNPROVEN','Fixed readiness observation failed');return control(local,action,body,method)}
 const apply=await f.run('apply');assert.equal(apply.status,'failed');assert.deepEqual(apply.steps.map(s=>[s.name,s.status]),[['forward:up:web','completed']]);assert.equal(f.host.data.containers.web.State.Running,true);assert.equal(f.host.data.containers.worker.State.Running,false)
 return f
}
test('partial known forward apply can resume the same untouched recovery-drain operation and restore source env without replaying up',async t=>{
 const f=await partialForward(t),op=f.executor.submit(f.request('recovery-drain')).operation
 f.journal.patch(op.key,{status:'uncertain',errors:{forward:{code:'CONFIGURATION_DIRECTION_UNPROVEN',message:'Original context failed before steps'},recovery:null,cleanup:[]}})
 const before=f.host.data.calls.length,result=await f.executor.run(op.key)
 assert.equal(result.status,'succeeded');assert.equal(result.operationId,op.operationId);assert.equal(result.generation,op.generation);assert.equal(result.errors.forward.code,'CONFIGURATION_DIRECTION_UNPROVEN')
 assert.equal(result.steps.filter(s=>s.name==='stop:web').length,1);assert.equal(result.steps.filter(s=>s.name==='stop:worker').length,1)
 const calls=f.host.data.calls.slice(before),stops=calls.filter(a=>a.includes('stop'))
 assert.deepEqual(stops.map(a=>[a.at(-1),a[a.indexOf('--env-file')+1]]),[['worker',f.sourceFile],['web',f.forwardFile]])
 assert.equal(calls.some(a=>a.includes('up')),false);assert.equal(JSON.stringify(result).includes(privateValue),false)
 assert.equal((await f.run('recover')).status,'succeeded');assert.equal((await f.run('recovery-undrain')).status,'succeeded')
 const ups=f.host.data.calls.filter(a=>a.includes('up'));assert.deepEqual(ups.map(a=>a[a.indexOf('--env-file')+1]),[f.forwardFile,f.sourceFile,f.sourceFile])
})
test('an already stopped maintenance drain only reconciles after every local writer and exact ingress generation are observed',async t=>{
 const f=await setup(t);await f.run('prepare');await f.run('drain')
 const op=f.executor.submit(f.request('recovery-drain')).operation
 f.journal.patch(op.key,{steps:['stop:worker','ingress-disable','stop:web'].map(name=>({name,sideEffect:true,status:'completed'}))})
 f.journal.finish(op.key,'failed',{needsIntervention:true},{forward:{code:'DRAIN_TIMEOUT',message:'Other host not stopped'},recovery:null,cleanup:[]})
 f.host.data.containers.web.State.Running=true;f.host.data.containers.web.State.Pid=123
 const before=f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length
 assert.equal((await f.executor.reconcile(f.journal.get(op.key))).status,'uncertain')
 f.host.data.containers.web.State.Running=false;f.host.data.containers.web.State.Pid=0;f.host.data.ingress.generation=2
 assert.equal((await f.executor.reconcile(f.journal.get(op.key))).status,'uncertain')
 f.host.data.ingress.generation=op.generation;f.host.options.busy=true
 assert.equal((await f.executor.reconcile(f.journal.get(op.key))).status,'uncertain')
 f.host.options.busy=false
 assert.equal((await f.executor.reconcile(f.journal.get(op.key))).status,'succeeded')
 assert.equal(f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length,before)
})

test('unknown up, actual image/env mismatch, stale fencing or a started drain never authorize untouched-drain continuation',async t=>{
 for(const failure of ['unknown-up','image','environment','generation','started-drain','different-error']){
  const f=await partialForward(t),op=f.executor.submit(f.request('recovery-drain')).operation
  f.journal.patch(op.key,{status:'uncertain',errors:{forward:{code:'CONFIGURATION_DIRECTION_UNPROVEN'},recovery:null,cleanup:[]}})
  if(failure==='unknown-up'){const apply=f.journal.get(f.request('apply').releaseId+':main-runtime-a:apply');f.journal.patch(apply.key,{steps:apply.steps.map(s=>({...s,status:'intent'}))})}
  if(failure==='image')f.host.data.containers.web.Image='sha256:'+'0'.repeat(64)
  if(failure==='environment')f.host.data.containers.web.Config.Env.push('UNAPPROVED_FIXTURE=present')
  if(failure==='generation')f.journal.db.prepare('UPDATE fences SET generation=?').run(op.generation+1)
  if(failure==='started-drain')f.journal.patch(op.key,{steps:[{name:'stop:worker',sideEffect:true,status:'intent'}]})
  if(failure==='different-error')f.journal.patch(op.key,{errors:{forward:{code:'CONTROL_REJECTED'},recovery:null,cleanup:[]}})
  const before=f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length
  assert.equal((await f.executor.run(op.key)).status,'uncertain',failure)
  assert.equal(f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length,before,failure)
 }
})
test('authenticated duplicate POST resumes only untouched recovery-drain; GET and startup remain read-only',async t=>{
 const f=await partialForward(t),op=f.executor.submit(f.request('recovery-drain')).operation
 f.journal.patch(op.key,{status:'uncertain',errors:{forward:{code:'CONFIGURATION_DIRECTION_UNPROVEN'},recovery:null,cleanup:[]}})
 const token='fixed-endpoint-fixture-token-495-long',server=createExecutorServer({executor:f.executor,token})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}))
 const base=`http://127.0.0.1:${server.address().port}`,headers={authorization:`Bearer ${token}`,'content-type':'application/json'},before=f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length
 const read=await fetch(base+'/operations?key='+encodeURIComponent(op.key),{headers});assert.equal((await read.json()).status,'uncertain')
 await f.executor.reconcileStartup()
 assert.equal(f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length,before)
 const replies=await Promise.all([1,2,3].map(()=>fetch(base+'/operations',{method:'POST',headers,body:JSON.stringify(f.request('recovery-drain'))})))
 for(const response of replies){assert.equal(response.status,202);assert.equal((await response.json()).operationId,op.operationId)}
 await server.waitForDispatch();const result=f.journal.get(op.key)
 assert.equal(result.status,'succeeded');assert.equal(result.operationId,op.operationId);assert.equal(result.generation,op.generation)
 const stops=f.host.data.calls.filter(a=>a.includes('stop')).slice(-2);assert.deepEqual(stops.map(a=>a.at(-1)),['worker','web'])
 assert.equal(f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length,before+2)
 const again=await fetch(base+'/operations',{method:'POST',headers,body:JSON.stringify(f.request('recovery-drain'))});assert.equal(again.status,202);await again.body.cancel();await server.waitForDispatch()
 assert.equal(f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length,before+2)
})

test('authenticated GET observes a completed-stop DRAIN_TIMEOUT without replay; unknown or missing steps are never resumed',async t=>{
 const f=await setup(t);await f.run('prepare');await f.run('drain')
 const op=f.executor.submit(f.request('recovery-drain')).operation,steps=['stop:worker','ingress-disable','stop:web'].map(name=>({name,sideEffect:true,status:'completed'}))
 f.journal.patch(op.key,{steps});f.journal.finish(op.key,'failed',{needsIntervention:true},{forward:{code:'DRAIN_TIMEOUT',message:'Original global barrier timeout'},recovery:null,cleanup:[]})
 const token='fixed-get-fixture-token-495-long-value',server=createExecutorServer({executor:f.executor,token})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}))
 const url=`http://127.0.0.1:${server.address().port}/operations?key=${encodeURIComponent(op.key)}`,headers={authorization:`Bearer ${token}`},before=f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length
 for(const invalid of [steps.slice(0,-1),steps.map((s,i)=>i===0?{...s,status:'intent'}:s)]){
  f.journal.patch(op.key,{steps:invalid});assert.equal(f.executor.canObserveStoppedRecoveryDrain(f.journal.get(op.key)),false)
  const response=await fetch(url,{headers});assert.equal((await response.json()).status,'failed')
 }
 f.journal.patch(op.key,{steps});f.host.options.busy=true
 const pending=await fetch(url,{headers});assert.equal((await pending.json()).status,'uncertain')
 f.host.options.busy=false
 const response=await fetch(url,{headers}),result=await response.json()
 assert.equal(result.status,'succeeded');assert.equal(result.operationId,op.operationId);assert.equal(result.generation,op.generation);assert.equal(result.errors.forward.code,'DRAIN_TIMEOUT')
 assert.deepEqual(result.steps,steps);assert.equal(f.host.data.calls.filter(a=>a.includes('up')||a.includes('stop')).length,before)
})
async function failedIngressReadRecover(t){
 const f=await setup(t);for(const phase of ['prepare','drain','recovery-drain'])assert.equal((await f.run(phase)).status,'succeeded')
 const control=f.adapter.control.bind(f.adapter);let unavailable=true
 f.adapter.control=async(local,action,body,method)=>{if(unavailable&&action==='ingressState'&&body.phase==='recover')throw Object.assign(fault('CONTROL_UNAVAILABLE','Independent ingressState control is unavailable'),{uncertain:false});return control(local,action,body,method)}
 const failed=await f.run('recover');assert.equal(failed.status,'failed');assert.equal(failed.errors.recovery.code,'CONTROL_UNAVAILABLE');assert.deepEqual(failed.steps,[]);assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,0)
 unavailable=false;return {...f,failed}
}
test('same-body recover POST atomically reclaims only its original free resources after a zero-effect ingress read failure',async t=>{
 const f=await failedIngressReadRecover(t),before=f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length
 const submission=f.executor.submit(f.request('recover'))
 assert.equal(submission.resumed,true);assert.equal(submission.created,false);assert.equal(submission.operation.status,'intent');assert.equal(submission.operation.operationId,f.failed.operationId);assert.equal(submission.operation.generation,f.failed.generation)
 assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations WHERE operation_key=?').get(f.failed.key).n,2)
 const duplicate=f.executor.submit(f.request('recover'));assert.notEqual(duplicate.resumed,true)
 const result=await f.executor.run(f.failed.key);assert.equal(result.status,'succeeded');assert.equal(result.errors.recovery.code,'CONTROL_UNAVAILABLE')
 assert.equal(f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length,before+2)
})
test('authenticated GET never resumes failed recover; duplicate POST dispatches one original recovery after reacquisition',async t=>{
 const f=await failedIngressReadRecover(t),before=f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length,token='fixed-recover-fixture-long-token-value',server=createExecutorServer({executor:f.executor,token})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}))
 const base=`http://127.0.0.1:${server.address().port}`,headers={authorization:`Bearer ${token}`,'content-type':'application/json'}
 const read=await fetch(base+'/operations?key='+encodeURIComponent(f.failed.key),{headers});assert.equal((await read.json()).status,'failed');await f.executor.reconcileStartup()
 assert.equal(f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length,before)
 const replies=await Promise.all([1,2,3].map(()=>fetch(base+'/operations',{method:'POST',headers,body:JSON.stringify(f.request('recover'))})))
 for(const response of replies){assert.equal(response.status,202);assert.equal((await response.json()).operationId,f.failed.operationId)}
 await server.waitForDispatch();assert.equal(f.journal.get(f.failed.key).status,'succeeded');assert.equal(f.host.data.calls.filter(a=>a.includes('stop')||a.includes('up')).length,before+2)
})
test('zero-effect recover cannot reclaim another owner or stale fence and leaves every reservation unchanged',async t=>{
 for(const stale of [false,true]){
  const f=await failedIngressReadRecover(t),resources=f.adapter.resources(f.failed.target,'recover'),generation=stale?f.failed.generation+1:f.failed.generation
  const owner=f.journal.accept(f.request('verify',{generation}),[resources.at(-1)]).operation,before=f.host.data.calls.length
  assert.throws(()=>f.executor.submit(f.request('recover')),{code:stale?'STALE_GENERATION':'RESOURCE_BUSY'})
  assert.equal(f.journal.get(f.failed.key).status,'failed');assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,1);assert.equal(f.journal.db.prepare('SELECT operation_key FROM reservations').get().operation_key,owner.key)
  assert.equal(f.host.data.calls.length,before)
 }
})
test('started steps, unknown outcomes, other errors and changed request identity never reopen failed recover',async t=>{
 for(const failure of ['intent','completed','uncertain','authorization','body']){
  const f=await failedIngressReadRecover(t)
  if(['intent','completed'].includes(failure))f.journal.patch(f.failed.key,{steps:[{name:'recovery:up:web',sideEffect:true,status:failure}]})
  if(failure==='uncertain')f.journal.patch(f.failed.key,{status:'uncertain'})
  if(failure==='authorization')f.journal.patch(f.failed.key,{errors:{forward:null,recovery:{code:'CONTROL_REJECTED'},cleanup:[]}})
  if(failure==='body')assert.throws(()=>f.executor.submit(f.request('recover',{generation:f.failed.generation+1})),{code:'OPERATION_CONFLICT'})
  else assert.notEqual(f.executor.submit(f.request('recover')).resumed,true)
  assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,0)
 }
})
test('recovery continuation keeps the original control failure even if a later read is explicitly rejected',async t=>{
 const f=await failedIngressReadRecover(t),original=structuredClone(f.failed.errors.recovery),control=f.adapter.control.bind(f.adapter)
 f.executor.submit(f.request('recover'))
 f.adapter.control=async(local,action,body,method)=>{if(action==='ingressState'&&body.phase==='recover')throw Object.assign(fault('CONTROL_REJECTED','Independent ingressState rejected the request'),{uncertain:false});return control(local,action,body,method)}
 const result=await f.executor.run(f.failed.key)
 assert.equal(result.status,'failed');assert.equal(result.errors.recovery.code,'CONTROL_REJECTED');assert.deepEqual(result.errors.originalRecoveryFailure,original);assert.deepEqual(result.steps,[])
 assert.notEqual(f.executor.submit(f.request('recover')).resumed,true)
})
test('lost prepared/drain evidence cannot reacquire zero-effect recovery resources',async t=>{
 for(const change of [{drainedHash:hash('other-manifest')},{drainedGeneration:2},{preparedHashes:{}}]){
  const f=await failedIngressReadRecover(t);f.journal.setState(f.failed.target,{...f.journal.state(f.failed.target),...change})
  assert.throws(()=>f.executor.submit(f.request('recover')),{code:'DRAIN_REQUIRED'})
  assert.equal(f.journal.get(f.failed.key).status,'failed');assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,0)
 }
})
