import test from 'node:test'
import assert from 'node:assert/strict'
import {sealHostPlan,assertSameSchema,assertWorkerBarrier,assertImageIdentity,validateHostPlanShape,runHostRelease,runImagePreparation} from './host-release.mjs'

const sha='a'.repeat(40),next='b'.repeat(40),hash='c'.repeat(64),digest='sha256:'+hash
const migrations=Array.from({length:48},(_,i)=>({version:i+1,name:'migration_'+(i+1),checksum:hash}))
const formal={runtime:'3.5.8',schema:13,protocol:11,schemaHash:hash,integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.5.8/fixture',productVersion:48,migrations}
const image={indexDigest:digest,configDigest:'sha256:'+'d'.repeat(64),manifestDigest:'sha256:'+'e'.repeat(64),diffIds:[digest],auditSha256:hash}
const source={sha,...formal,image},target={...source,sha:next}
const apps=['lingxiloop-app-a','lingxiloop-app-b'],core='lingxiloop-core-state'
const sourceRef={commit:sha,branch:'release/source',sha256:hash,autoPull:true,extraArgs:[]}
const targetRef={commit:next,branch:'release/target',sha256:'d'.repeat(64),autoPull:false,extraArgs:['--no-deps','--pull','never']}
const plan=sealHostPlan({format:'same-schema-host-release/v1',createdAt:'2026-10-20T00:00:00Z',source,target,sourceAcceptanceSha256:hash,qualification:{commit:next,conclusion:'success',ciUrl:'https://github.com/LingXi-Org/LingxiLoop/actions/runs/123'},stacks:[...apps,core].map((stack,i)=>({stack,server:i===1?'shanghai-b':'shanghai-a',source:sourceRef,target:i===2?sourceRef:targetRef,...(i!==2?{preparation:{commit:next,sha256:'e'.repeat(64)}}:{})}))})
function state(){return {...formal,installedSchema:13,product:48,count:48,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:20,queued:12,pendingCapture:4}}
function fixture(fault={}){
 const trace=[],events=[],rows=apps.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,server:i?'shanghai-b':'shanghai-a',service,id:String(i*2+j+1).repeat(64),source:sha,imageId:digest,running:true,restarting:false,restartCount:0,pid:1,healthy:true,policy:{readOnly:service==='worker'}})))
 let staged=0,deployed=0,stops=0,targetInspections=0
 const ops={
  async assertIdle(){trace.push('idle');if(fault.idle)throw Error('idle')},
  async inspect(){trace.push('inspect');if(fault.replacedTarget&&deployed===1&&++targetInspections===2)rows[0].id='e'+rows[0].id.slice(1);return structuredClone(rows)},
  async state(){trace.push('state');const s=state();if(fault.busy&&stops===2)s.liveWork=1;if(fault.schema&&deployed)s.schemaHash='e'.repeat(64);return s},
  async verifyImages(which='target'){trace.push('images:'+which);if(fault.image&&which==='target')throw Error('missing image')},
  async stage(stack){trace.push('stage:'+stack);staged++;if(fault.stage&&staged===2)throw Object.assign(Error('unknown'),{uncertain:true})},
  async metadata(stack){trace.push('metadata:'+stack);return {...target,...(fault.metadata&&stack===apps[1]?{schema:14}:{})}},
  async stop(stack,service){trace.push('stop:'+stack+':'+service);stops++;if(fault.stopUnknown)throw Object.assign(Error('unknown'),{uncertain:true});const row=rows.find(x=>x.stack===stack&&x.service===service);if(!fault.stillRunning){row.running=false;row.pid=0}},
  async deploy(stack,service){trace.push('deploy:'+stack+':'+service);deployed++;if(fault.deployUnknown)throw Object.assign(Error('unknown'),{uncertain:true});const row=rows.find(x=>x.stack===stack&&x.service===service);Object.assign(row,{source:next,id:'f'+row.id.slice(1),running:true,pid:2});if(fault.policy)row.policy.readOnly=!row.policy.readOnly},
  async verifyHealthy(stack,service){trace.push('health:'+stack+':'+service);if(fault.health)throw Error('unhealthy')},
  async wait(){trace.push('wait')},
  async stagePreparation(stack){trace.push('prepare:'+stack)},
  async pullPrepared(stack){trace.push('pull:'+stack);if(fault.pullUnknown)throw Object.assign(Error('unknown'),{uncertain:true})},
  async restoreSource(stack){trace.push('restore:'+stack)},
 }
 return {ops,trace,events,run:()=>runHostRelease({plan,ops,onProgress:async e=>events.push(e)}),prepare:()=>runImagePreparation({plan,ops,onProgress:async e=>events.push(e)})}
}
test('same formal package and all48 checksums required; native13 alone is insufficient',()=>{
 assert.doesNotThrow(()=>assertSameSchema(source,target))
 for(const key of ['runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations']){
  const bad=structuredClone(target);bad[key]=key==='migrations'?migrations.slice(1):typeof bad[key]==='number'?bad[key]+1:'different'
  assert.throws(()=>assertSameSchema(source,bad))
 }
})
test('distinct format and sealed per-stack core identity; exact app policy only',()=>{
 assert.doesNotThrow(()=>validateHostPlanShape(plan))
 for(const mutate of [p=>p.format=2,p=>p.stacks[2].target.commit=next,p=>p.stacks[0].target.extraArgs=['--no-deps'],p=>p.stacks[0].target.autoPull=true,p=>p.target.migrations[1].checksum='d'.repeat(64)]){
  const bad=JSON.parse(JSON.stringify(plan));mutate(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)))
 }
 const bad=structuredClone(plan);bad.createdAt='later';assert.throws(()=>validateHostPlanShape(bad))
})
test('worker barrier allows Web clients and queue but rejects every live lease and prepared transaction',()=>{
 assert.doesNotThrow(()=>assertWorkerBarrier(state()))
 for(const key of ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','prepared'])assert.throws(()=>assertWorkerBarrier({...state(),[key]:1}))
 for(const key of ['readOnly','fullVisibility'])assert.throws(()=>assertWorkerBarrier({...state(),[key]:false}))
})
test('actual per-host image ID is not inferred from config digest',()=>{
 const actual={Id:'sha256:'+'f'.repeat(64),RepoDigests:['accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server@'+digest],Architecture:'amd64',Os:'linux',RootFS:{Type:'layers',Layers:[digest]}}
 assert.equal(assertImageIdentity(actual,image),actual.Id)
 for(const patch of [{Architecture:'arm64'},{RepoDigests:[]},{RootFS:{Type:'layers',Layers:[]}}])assert.throws(()=>assertImageIdentity({...actual,...patch},image))
})
test('online qualification precedes stop; only both Workers stop; WebA/B then WorkerA/B',async()=>{
 const f=fixture();const result=await f.run();assert.equal(result.status,'complete')
 const stop=f.trace.findIndex(x=>x.startsWith('stop:'))
 for(const stack of apps)assert.ok(f.trace.indexOf('metadata:'+stack)<stop)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),apps.map(s=>'stop:'+s+':worker'))
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
 assert.equal(f.trace.some(x=>/pull|migrate|backup|restore/.test(x)),false)
})
test('missing image never stages; partial unknown stage never stops or makes further requests',async()=>{
 const a=fixture({image:true});await assert.rejects(a.run());assert.equal(a.trace.some(x=>x.startsWith('stage:')||x.startsWith('stop:')),false)
 const b=fixture({stage:true});await assert.rejects(b.run());assert.equal(b.trace.some(x=>x.startsWith('stop:')),false);assert.equal(b.trace.at(-1),'stage:'+apps[1]);assert.equal(b.events.at(-1).status,'uncertain')
})
test('metadata mismatch leaves all services running',async()=>{
 const f=fixture({metadata:true});await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('stop:')),false)
})
test('live leases, ineffective stop and unknown stop prevent new Web',async()=>{
 for(const fault of [{busy:true},{stillRunning:true},{stopUnknown:true}]){const f=fixture(fault);await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)}
})
test('unknown deploy stops immediately; health/policy/schema failure prevents remaining rollout',async()=>{
 for(const fault of [{deployUnknown:true},{health:true},{policy:true},{schema:true},{replacedTarget:true}]){
  const f=fixture(fault);await assert.rejects(f.run());assert.equal(f.trace.filter(x=>x.startsWith('deploy:')).length,1)
  if(fault.deployUnknown)assert.equal(f.trace.at(-1),'deploy:'+apps[0]+':lingxiloop')
 }
})
test('explicit image preparation restores accepted host source and never stops/deploys',async()=>{
 const f=fixture();await f.prepare()
 assert.deepEqual(f.trace.filter(x=>/^(prepare|pull|restore):/.test(x)),apps.flatMap(s=>['prepare:'+s,'pull:'+s,'restore:'+s]))
 assert.equal(f.trace.some(x=>/^(stop|deploy|metadata):/.test(x)),false)
 const bad=fixture({pullUnknown:true});await assert.rejects(bad.prepare());assert.equal(bad.trace.at(-1),'pull:'+apps[0]);assert.equal(bad.trace.some(x=>x.startsWith('restore:')),false)
})
