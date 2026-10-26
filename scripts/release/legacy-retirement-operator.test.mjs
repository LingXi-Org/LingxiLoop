import test from'node:test'
import assert from'node:assert/strict'
import{mkdtemp,rm,readFile}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{OPS_SHA,LEGACY_OPS_SHA,LEGACY_RELEASE_ID,INGRESS_SOURCE_SHA,IDS,evidenceHash,validateEvidence,validateLegacyRuntime,qualificationPlan,buildPlan,rollbackBodies,operate}from'./legacy-retirement-operator.mjs'
const rawHash=v=>createHash('sha256').update(v).digest('hex'),secret='fixture-private-environment-never-persist',now=()=>Date.now(),copy=x=>structuredClone(x)
function release(id,status,source=null){
 const contract={nativeSchema:14,productSchema:57,api:'exact-api',worker:'exact-worker',checkpoint:'exact-checkpoint',control:'11',capabilities:['exact-capability']},image={ref:'ghcr.io/fixture/image@sha256:'+'1'.repeat(64),indexDigest:'sha256:'+'1'.repeat(64),platformDigest:'sha256:'+'2'.repeat(64),configDigest:'sha256:'+'3'.repeat(64),diffIds:['sha256:'+'4'.repeat(64)],os:'linux',architecture:'amd64'},images={web:image,worker:image},manifest={version:1,releaseId:id,sourceReleaseId:source,appSha:'a'.repeat(40),opsSha:OPS_SHA,targets:{}}
 for(const side of['a','b']){const configurationHash=evidenceHash(`configuration-${side}`);manifest.targets[`main-runtime-${side}`]={adapter:'main-runtime',hosts:[side],fromReleaseId:source,configuration:{version:configurationHash,secretRefs:[],volumes:{'worker:/homes':`original-homes-${side}`}},contract,verification:{readiness:['readiness'],businessProbe:'business'},hostPlan:{mode:'maintenance',contract,images,configurationHash,source:{images,contract,configurationHash},recovery:{images,contract,configurationHash}}}}
 if(status==='recovered')manifest.targets['main-frontend']={recovery:{artifact:{versionId:'known-accepted-frontend'}}}
 const record={releaseId:id,appSha:manifest.appSha,opsSha:OPS_SHA,status,generation:status==='recovered'?2:1,needsAgent:false,workflowId:id+'-0',targets:{}}
 for(const side of['a','b']){const target=`main-runtime-${side}`;for(const phase of['prepare','drain','apply','verify','undrain',...(status==='recovered'?['recovery-drain','recover','recovery-undrain']:[])])record.targets[`${target}:${side}:${phase}`]={key:`${id}:${target}:${phase}`,operationId:`operation-${id}-${side}-${phase}`,status:'succeeded',releaseId:id,target,phase,generation:phase==='prepare'?0:record.generation,manifestHash:evidenceHash(manifest),result:phase==='verify'?{verified:true,images:{web:image.indexDigest,worker:image.indexDigest}}:phase==='recover'?{applied:true,direction:'recovery',images:{web:image.indexDigest,worker:image.indexDigest}}:{complete:true}};record.targets[`${target}:verification`]={readiness:{status:200},business:{status:200}}}
 if(status==='recovered')record.errors={forward:'BUSINESS_PROBE_FAILED'}
 return{manifest,record}
}
function staged(c,recovery=false){
 const plan=qualificationPlan(recovery,recovery),requests=Object.fromEntries(plan.slice(0,-1).map(s=>[s.key,['batch','claim'].includes(s.kind)?0:1])),completed=plan.slice(0,-1).map((s,index)=>({key:s.key,workflowId:`${c.record.releaseId}-stage-${index}`,requests:requests[s.key]})),deadlines={}
 if(recovery)requests['probe-main-runtime-a']=2
 for(const op of Object.values(c.record.targets))if(op.key)deadlines[`${op.target.at(-1)}:${op.key}`]=Date.now()+60000
 c.record.workflowId=`${c.record.releaseId}-final`
 const cp={protocol:2,plan,index:plan.length-1,serial:completed.length+(recovery?1:0),changed:recovery?['main-frontend','main-runtime-a','main-runtime-b']:['main-runtime-a','main-runtime-b'],mutationSubmitted:true,direction:recovery?'compatible-recovery':'forward',requests,deadlines,completed,previousWorkflowId:completed.at(-1).workflowId,initializedWorkflowId:c.record.workflowId}
 c.record.progress={protocol:2,stage:plan.at(-1).key,completed:copy(completed),requests:copy(requests)}
 return{releaseId:c.record.releaseId,generation:c.record.generation,observations:copy(c.record.targets),checkpoint:cp,verifiedAt:new Date().toISOString()}
}
function seal(c){
 if(c.receipt.recovered){const p=c.receipt.recovered;p.text=JSON.stringify(p.body);p.archive={key:`releases/${c.record.releaseId}/recovered.json`,sha256:'sha256:'+rawHash(p.text),size:Buffer.byteLength(p.text),etag:'actual-r2-etag'}}
 c.receipt.recordHash=evidenceHash(c.record);c.receipt.manifestHash=evidenceHash(c.manifest);c.receiptText=JSON.stringify(c.receipt);c.archive={key:`qualification/${c.record.releaseId}.json`,sha256:'sha256:'+rawHash(c.receiptText),size:Buffer.byteLength(c.receiptText),etag:'private-immutable-etag'}
}
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'retire-operator-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const runtime=release('actual-runtime','accepted'),recovery=release('actual-recovery','recovered',runtime.record.releaseId);runtime.verified=staged(runtime)
 const published=staged(recovery,true)
 recovery.receipt={releaseId:recovery.record.releaseId,opsSha:OPS_SHA,manifestHash:evidenceHash(recovery.manifest),generation:recovery.record.generation,recordHash:evidenceHash(recovery.record),observedAt:new Date().toISOString(),recovered:{body:published},postRecovery:{hosts:{},probes:{'recovery-495-absence':{status:404}},frontend:{versionId:'known-accepted-frontend',percentage:100}}};for(const side of['a','b'])recovery.receipt.postRecovery.hosts[side]={nativeSchema:14,productSchema:57,images:copy(recovery.record.targets[`main-runtime-${side}:${side}:recover`].result.images),volumes:copy(runtime.manifest.targets[`main-runtime-${side}`].configuration.volumes)}
 seal(recovery)
 const text='Trusted user readback: RELEASE_CONTROLLER_ENABLED=true; RELEASE_OPS_SHA='+OPS_SHA,head='b'.repeat(40),jobs=[{name:'changes',status:'completed',conclusion:'success',steps:[{name:'Run node scripts/ci-scope-cumulative.mjs',conclusion:'success'}]},{name:'checks (server)',status:'completed',conclusion:'success'},{name:'publish (main-runtime)',status:'completed',conclusion:'success',steps:[{name:'Record registry index, platform, config and layer identities',conclusion:'success'},{name:'Run actions/upload-artifact@v4',conclusion:'success'}]},...['prepare-static','register-candidate','report-release','update-manifests','deploy','rollout'].map(name=>({name,status:'completed',conclusion:'skipped'}))]
 const evidence={version:1,opsSha:OPS_SHA,runtime,recovery,controller:{userReadback:{source:'parent-trusted-user-readback',messageId:'trusted-user-message',observedAt:new Date().toISOString(),text,sha256:'sha256:'+rawHash(text),values:{RELEASE_CONTROLLER_ENABLED:'true',RELEASE_OPS_SHA:OPS_SHA}},ci:{run:{id:123,event:'workflow_dispatch',head_branch:'main',head_sha:head,status:'completed',conclusion:'success',repository:{full_name:'LingXi-Org/LingxiLoop'}},dispatch:{ref:'main',inputs:{publish_only:true}},baseline:{releaseId:runtime.record.releaseId},jobs:{total_count:jobs.length,jobs:jobs.map(j=>({...j,run_id:123}))},artifacts:{artifacts:[{name:`release-baseline-${head}-1`,expired:false,workflow_run:{id:123}},{name:`release-component-server-${head}-1`,expired:false,workflow_run:{id:123}}]}}},zero:{readOnly:true,observedAt:new Date().toISOString(),submissions:[runtime,recovery].map(c=>({releaseId:c.record.releaseId,manifestHash:evidenceHash(c.manifest),intentSha256:'sha256:'+'f'.repeat(64),record:c.record})),workflows:{success:true,result:[runtime,recovery].map(c=>({id:c.record.workflowId,status:'complete'}))},hosts:Object.fromEntries(['a','b'].map(side=>[side,{readOnly:true,pending:[],reservations:[],ingress:{enabled:true,generation:2}}])),legacyActions:{total_count:0,workflow_runs:[]}},merge:{number:506,merged:true,merge_commit_sha:'c'.repeat(40),base:{ref:'main'}}}
 evidence.zero.workflows.result=[runtime.record.workflowId,recovery.record.workflowId,...runtime.verified.checkpoint.completed.map(r=>r.workflowId),...published.checkpoint.completed.map(r=>r.workflowId)].map(id=>({id,status:'complete'}))
 const sharedSource=await readFile(new URL('../../deploy/komodo/shared-resources.toml',import.meta.url),'utf8'),oldSource=await readFile(new URL('./fixtures/legacy-resources-33e97c9f.toml',import.meta.url),'utf8'),objects=new Map(),stackNames={core:'lingxiloop-core-state',a:'lingxiloop-app-a',b:'lingxiloop-app-b',knowledge:'lingxiloop-knowledge-agent',ingress:'server-b-ingress',landing:'landing',lit:'lingxilit',uptime:'uptime'}
 for(const[key,name]of Object.entries(stackNames))objects.set(IDS[key],{id:IDS[key],name,config:{environment:secret,webhook_enabled:true,poll_for_updates:false,auto_update:false,auto_update_all_services:false,commit:''}})
 for(const[id,name]of[[IDS.procedure,'lingxiloop-production-rollout'],['6aa89b90775d6e01dfed18e2','Backup Core Database'],['6aa89b90775d6e01dfed18e4','Global Auto Update'],['6aa89b90775d6e01dfed18e6','Rotate Server Keys']])objects.set(id,{id,name,config:{schedule_enabled:true,webhook_enabled:true,stages:[{command:secret}]}})
 objects.set(IDS.sync,{id:IDS.sync,name:'lingxiloop-production',config:{managed:false,delete:false,webhook_enabled:true,repo:'',linked_repo:'',files_on_host:false,file_contents:oldSource,resource_path:['deploy/komodo/resources.toml'],privateField:secret},info:{resource_updates:[],pending_deploys:[]}})
 const snapshot={readOnly:true,observedAt:'2026-10-25T23:05:56.429Z',coreVersion:{version:'2.3.3'},stacks:[],procedures:[],syncs:[]};for(const o of objects.values()){const row={id:o.id,name:o.name,configHash:rawHash(JSON.stringify(o.config)),flags:Object.fromEntries(Object.entries(o.config).filter(([k])=>['managed','delete','webhook_enabled','poll_for_updates','auto_update','auto_update_all_services','schedule_enabled'].includes(k)))};if(o.id===IDS.sync){row.fileContentsHash=rawHash(oldSource);row.source={repo:'',branch:'main',commit:'',linked_repo:'',files_on_host:false,resource_path:['deploy/komodo/resources.toml']};snapshot.syncs.push(row)}else if(Object.values(stackNames).includes(o.name))snapshot.stacks.push(row);else snapshot.procedures.push(row)}
 const calls=[],record=id=>[runtime,recovery].find(c=>c.record.releaseId===id)?.record,clients={release:async path=>{calls.push({kind:'release',path});return path==='/v1/accepted'?{releaseId:runtime.record.releaseId}:copy(record(decodeURIComponent(path.split('/').at(-1))))},host:async(side,key)=>{calls.push({kind:'host',side,key});return copy([runtime,recovery].flatMap(c=>Object.values(c.record.targets)).find(op=>op.key===key))},read:async(op,p)=>{calls.push({kind:'read',op,p});if(op==='GetVersion')return{version:'2.3.3'};if(op.endsWith('ActionState'))return{running:false};return copy(objects.get(Object.values(p)[0]))},write:async(op,p)=>{calls.push({kind:'write',op,p});const persisted=JSON.parse(await readFile(join(root,'journal.json'),'utf8'));const key=op==='RefreshResourceSyncPending'?'preview':p.id;assert.equal(persisted.steps[key].status,'intent');if(op==='RefreshResourceSyncPending')return;Object.assign(objects.get(p.id).config,copy(p.config))}}
 const run=()=>operate({evidence,snapshot,sharedSource,oldSource,journalPath:join(root,'journal.json'),clients})
 return{evidence,snapshot,sharedSource,oldSource,objects,calls,clients,run,root}
}
test('missing acceptance/recovery/controllertrue/publish-only/zero evidence is refused before the first production write',async t=>{
 for(const mutate of[e=>delete e.runtime,e=>e.controller.userReadback.values.RELEASE_CONTROLLER_ENABLED='false',e=>e.controller.userReadback.values.RELEASE_OPS_SHA=INGRESS_SOURCE_SHA,e=>e.opsSha=INGRESS_SOURCE_SHA,e=>e.controller.ci.dispatch.inputs.publish_only=false,e=>e.controller.ci.jobs.jobs.find(j=>j.name==='register-candidate').conclusion='success',e=>e.zero.hosts.a.pending.push({key:'uncertain'}),e=>e.zero.workflows.result.push({id:'other',status:'running'}),e=>e.zero.observedAt='2026-01-01T00:00:00Z',e=>e.merge.merged=false]){const f=await fixture(t);mutate(f.evidence);await assert.rejects(f.run());assert.equal(f.calls.filter(c=>c.kind==='write').length,0)}
})
test('actual host phase receipts, immutable recovery body, compatible identities and complete submit inventory are required',async t=>{
 for(const mutate of[e=>delete e.recovery.record.targets['main-runtime-b:b:recover'],e=>e.recovery.receiptText+=' ',e=>e.recovery.manifest.targets['main-runtime-a'].hostPlan.recovery.images.web={configDigest:'wrong'},e=>e.zero.submissions.pop(),e=>e.recovery.receipt.postRecovery.frontend.versionId='wrong']){const f=await fixture(t);mutate(f.evidence);assert.throws(()=>validateEvidence(f.evidence));assert.equal(f.calls.length,0)}
})
test('fixed retirement order commits every local intent first, verifies partial readback and preserves secrets/stages/shared objects',async t=>{
 const f=await fixture(t),before=copy([...f.objects]),result=await f.run();assert.equal(result.status,'verified');assert.deepEqual(f.calls.filter(c=>c.kind==='write').map(c=>[c.op,c.p.id??c.p.sync]),[['UpdateResourceSync',IDS.sync],['UpdateProcedure',IDS.procedure],...[IDS.core,IDS.a,IDS.b,IDS.knowledge].map(id=>['UpdateStack',id]),['UpdateStack',IDS.ingress],['RefreshResourceSyncPending',IDS.sync]])
 assert.equal(result.identity.opsSha,'4de017e61253f39931c4b861d121f1508369de53');assert.notEqual(OPS_SHA,INGRESS_SOURCE_SHA);assert.equal(f.objects.get(IDS.ingress).config.commit,INGRESS_SOURCE_SHA);for(const[id,o]of before)assert.equal(f.objects.get(id).config.environment??f.objects.get(id).config.privateField??f.objects.get(id).config.stages?.[0].command,secret)
 for(const id of[IDS.landing,IDS.lit,IDS.uptime,'6aa89b90775d6e01dfed18e2'])assert.deepEqual(f.objects.get(id),before.find(([key])=>key===id)[1]);assert.equal((await readFile(join(f.root,'journal.json'),'utf8')).includes(secret),false)
 const count=f.calls.filter(c=>c.kind==='write').length;await f.run();assert.equal(f.calls.filter(c=>c.kind==='write').length,count)
})
test('lost write/readback response is resumed by queries and never re-POSTed',async t=>{
 const f=await fixture(t),write=f.clients.write,read=f.clients.read;let readLost=false
 f.clients.write=async(op,p)=>{await write(op,p);if(op==='UpdateResourceSync'){readLost=true;throw Error('lost accepted write reply')}}
 f.clients.read=async(op,p)=>{if(readLost&&op==='GetResourceSync'){readLost=false;throw Error('lost readback')}return read(op,p)}
 await assert.rejects(f.run(),{code:'RETIREMENT_READBACK_UNCERTAIN'});const first=f.calls.filter(c=>c.kind==='write'&&c.op==='UpdateResourceSync').length;f.clients.read=read;f.clients.write=write;await f.run();assert.equal(f.calls.filter(c=>c.kind==='write'&&c.op==='UpdateResourceSync').length,first)
})
test('unknown write that has not appeared in readback stays blocked instead of replaying',async t=>{
 const f=await fixture(t);f.clients.write=async(op,p)=>{f.calls.push({kind:'write',op,p});throw Error('unknown transport')};await assert.rejects(f.run(),{code:'RETIREMENT_READBACK_UNCERTAIN'});await assert.rejects(f.run(),{code:'RETIREMENT_READBACK_UNCERTAIN'});assert.equal(f.calls.filter(c=>c.kind==='write').length,1)
})
test('unowned drift, running legacy actions and stale/moved live controller state fail closed',async t=>{
 for(const mutate of[f=>f.objects.get(IDS.landing).config.environment='changed',f=>{const read=f.clients.read;f.clients.read=(op,p)=>op.endsWith('ActionState')?{running:true}:read(op,p)},f=>{const release=f.clients.release;f.clients.release=path=>path==='/v1/accepted'?{releaseId:'other'}:release(path)}]){const f=await fixture(t);mutate(f);await assert.rejects(f.run());assert.equal(f.calls.filter(c=>c.kind==='write').length,0)}
})
test('unsafe preview never calls RunSync and original source plus preserved ingress pin yields the exact rollback hash',async t=>{
 const f=await fixture(t),plan=buildPlan(f.evidence,f.snapshot,f.sharedSource,f.oldSource);assert.equal(plan.rollback.sourceWithIngressPinSha256,'f92e316937d35ca93ae3c26cbccc7789492f37085731f789f17b9e2596b0e024');const restored=rollbackBodies(plan,f.oldSource);assert.equal(rawHash(restored[0].body.config.file_contents),plan.rollback.sourceWithIngressPinSha256);assert.equal(Object.hasOwn(restored[0].body.config,'file_contents_sha256'),false);assert.equal(restored.find(row=>row.body.id===IDS.ingress).body.config.commit,INGRESS_SOURCE_SHA);assert.equal(f.calls.length,0);const write=f.clients.write;f.clients.write=async(op,p)=>{await write(op,p);if(op==='RefreshResourceSyncPending')f.objects.get(IDS.sync).info={resource_updates:[{target:{type:'Stack',id:IDS.a},data:{type:'Delete'}}]}}
 await assert.rejects(f.run(),{code:'RETIREMENT_READBACK_UNCERTAIN'});assert.equal(f.calls.some(c=>c.op==='RunSync'||c.op==='DeployStack'||c.op==='DeleteStack'),false)
})

test('the fixed real gen6 legacy proof accepts only its unchanged ten receipts and read-only two-probe checkpoint',async()=>{
 // Non-secret real verified.json fixture: identities/receipts only, no policy,
 // runtime environment, credential, full Compose configuration or business row.
 const verified=JSON.parse(await readFile(new URL('./legacy-retirement-gen6.test.fixture.json',import.meta.url),'utf8'))
 const record={releaseId:LEGACY_RELEASE_ID,appSha:'197e2568d46de349bb3ce0a26aefbadaae8f4723',opsSha:LEGACY_OPS_SHA,generation:6,status:'accepted',needsAgent:false,targets:copy(verified.observations),workflowId:verified.checkpoint.initializedWorkflowId,progress:{protocol:2,stage:'accepted',completed:copy(verified.checkpoint.completed),requests:copy(verified.checkpoint.requests)}}
 assert.equal(validateLegacyRuntime(record,verified).legacyVerificationOnly,true)
 for(const mutate of[(r)=>r.generation=7,(r)=>r.releaseId='different-old-release',(r)=>r.targets['main-runtime-a:a:apply'].operationId='different-operation',(r)=>r.targets['main-runtime-b:b:prepare'].manifestHash='sha256:'+'0'.repeat(64),(_r,v)=>v.checkpoint.legacyVerificationOnly=false,(_r,v)=>v.checkpoint.mutationSubmitted=true,(_r,v)=>v.checkpoint.completed.pop(),(_r,v)=>v.checkpoint.requests['probe-main-runtime-a']=0,(r)=>r.progress.requests['probe-main-runtime-a']=0]){
  const r=copy(record),v=copy(verified);mutate(r,v);assert.throws(()=>validateLegacyRuntime(r,v))
 }
})
test('legacy compatibility is one exact proof, never a blanket old-Ops boolean or alternate source release',async t=>{
 for(const mutate of[e=>{e.runtime.manifest.opsSha=LEGACY_OPS_SHA;e.runtime.record.opsSha=LEGACY_OPS_SHA;e.runtime.verified.checkpoint.legacyVerificationOnly=true},e=>e.recovery.manifest.sourceReleaseId='different-source',e=>e.recovery.manifest.appSha='c'.repeat(40)]){
  const f=await fixture(t);mutate(f.evidence);await assert.rejects(f.run());assert.equal(f.calls.length,0)
 }
})
test('new recovery uses the full R2 semantic checkpoint and retains one failed stage, budgets, ownership, configuration and volumes',async t=>{
 const mutations=[
  e=>e.recovery.receipt.recovered.body.checkpoint.serial++,
  e=>e.recovery.receipt.recovered.body.checkpoint.requests['recover-main-runtime-a']=33,
  e=>e.recovery.receipt.recovered.body.checkpoint.completed.find(r=>r.key==='recover-main-runtime-a').requests=0,
  e=>delete e.recovery.receipt.recovered.body.checkpoint.requests['probe-main-runtime-a'],
  e=>e.recovery.receipt.recovered.body.checkpoint.plan.splice(9,1),
  e=>e.recovery.receipt.recovered.body.checkpoint.deadlines={},
  e=>e.recovery.receipt.recovered.body.checkpoint.direction='source',
  e=>e.recovery.receipt.recovered.body.observations['main-runtime-a:a:recover'].operationId='changed',
  e=>e.recovery.record.progress.requests['recover-main-runtime-a']=0,
  e=>e.recovery.record.errors.forward='OPERATOR_REQUESTED_RECOVERY',
  e=>e.recovery.receipt.postRecovery.hosts.a.volumes['worker:/homes']='replacement-volume',
  e=>e.recovery.manifest.targets['main-runtime-a'].hostPlan.source.configurationHash='sha256:'+'0'.repeat(64),
  e=>e.recovery.manifest.targets['main-runtime-b'].configuration.volumes['worker:/homes']='replacement-volume',
  e=>e.zero.workflows.result.find(r=>r.id===e.recovery.receipt.recovered.body.checkpoint.completed[0].workflowId).status='terminated',
 ]
 for(const mutate of mutations){const f=await fixture(t);mutate(f.evidence);seal(f.evidence.recovery);await assert.rejects(f.run());assert.equal(f.calls.length,0)}
 const f=await fixture(t);assert.equal(f.evidence.recovery.record.targets.recovery,undefined);assert.equal(validateEvidence(f.evidence).opsSha,OPS_SHA)
})
