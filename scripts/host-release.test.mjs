const presentationFormat='run-presentation-contract-host-release/v1',presentationMigration={version:54,name:'run_presentation_contract',checksum:'f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2'};
const traceFormat='run-trace-provenance-host-release/v1',traceMigration={version:52,name:'run_trace_provenance',checksum:'2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886'};
import test from 'node:test'
import {continueStoppedRelease} from './host-release-stopped-recovery.mjs'
import {restoreImageSource} from './host-release-image-recovery.mjs'
import {CASE_COVER_PACKAGE,READER_FORMAT,PRODUCER_FORMAT,CONVERSATION_FORMAT,MIGRATION53,MIGRATION51,SCHEMA14} from './public-text-release.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {sealHostPlan,assertSameSchema,assertWorkerBarrier,assertImageIdentity,validateHostPlanShape,runHostRelease,runImagePreparation} from './host-release.mjs'

const sha='a'.repeat(40),next='b'.repeat(40),hash='c'.repeat(64),digest='sha256:'+hash
const migrations=Array.from({length:48},(_,i)=>({version:i+1,name:'migration_'+(i+1),checksum:hash}))
const formal={runtime:'3.5.8',schema:13,protocol:11,schemaHash:hash,integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.5.8/fixture',productVersion:48,migrations}
const migration49={version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}
const formal49={...formal,productVersion:49,migrations:[...migrations,migration49]}

const formal50={...formal49,runtime:'3.6.0',schema:14,productVersion:50,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.6.0/fixture',migrations:[...formal49.migrations,{version:50,name:'native_skill_delivery',checksum:hash}]}
function nativeBackup(){return {format:2,profile:'native13-product49',source:{sha,productVersion:49,runtime:Object.fromEntries(['runtime','schema','protocol','schemaHash','integrity','tarball'].map(k=>[k,formal49[k]])),migrations:formal49.migrations},attempt:'synthetic-native14',nonce:'0123456789abcdef',isolatedDatabase:'memory_verify_'+sha.slice(0,12)+'_0123456789abcdef',backupDir:'/var/lib/postgresql/data/memory-upgrade-backups/'+sha+'/synthetic-native14',migrationRehearsal:'not-performed',command:'synthetic-not-executable',commandHash:'c'.repeat(64)}}
function backupReceipt(){return {...nativeBackup(),status:'Complete',success:true,updateId:'a'.repeat(24),dumpSha256:hash,restoreCountsEqual:true,restoreProvenanceEqual:true,isolatedDatabaseRemoved:true}}

const image={indexDigest:digest,configDigest:'sha256:'+'d'.repeat(64),manifestDigest:'sha256:'+'e'.repeat(64),diffIds:[digest],auditSha256:hash}
const source={sha,...formal,image},target={...source,sha:next}
const apps=['lingxiloop-app-a','lingxiloop-app-b'],core='lingxiloop-core-state'
const sourceRef={commit:sha,branch:'release/source',sha256:hash,autoPull:true,extraArgs:[]}
const targetRef={commit:next,branch:'release/target',sha256:'d'.repeat(64),autoPull:false,extraArgs:['--no-deps','--pull','never']}
const plan=sealHostPlan({format:'same-schema-host-release/v1',createdAt:'2026-10-20T00:00:00Z',source,target,sourceAcceptanceSha256:hash,qualification:{commit:next,conclusion:'success',ciUrl:'https://github.com/LingXi-Org/LingxiLoop/actions/runs/123'},stacks:[...apps,core].map((stack,i)=>({stack,server:i===1?'shanghai-b':'shanghai-a',source:sourceRef,target:i===2?sourceRef:targetRef,...(i!==2?{preparation:{commit:next,sha256:'e'.repeat(64)}}:{})}))})
function state(descriptor=formal){return {...descriptor,installedSchema:13,product:descriptor.productVersion,count:descriptor.productVersion,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:20,queued:12,pendingCapture:4}}
function fixture(fault={}){
 if(fault.cover55||fault.same55)fault={...fault,producerV3:true};
 if(fault.producerV3)fault={...fault,producerV2:true};
 fault={...fault,image54:fault.image54||fault.runtimePatch||fault.producerV2}
 fault={...fault,presentation:fault.presentation||fault.image54,repair:fault.repair||fault.presentation||fault.image54,trace:fault.trace||fault.repair||fault.presentation||fault.image54}
 let releasePlan=sealHostPlan({...plan,...(fault.native14?{format:'native-schema-host-release/v1',backup:nativeBackup()} : fault.upgrade?{format:'product-schema-host-release/v1'}:{}),
  source:{...source,...(fault.sameNative14?formal50:fault.product49||fault.native14?formal49:formal)},target:{...target,...(fault.sameNative14||fault.native14?formal50:fault.upgrade||fault.product49?formal49:formal)}})
 if(fault.reader||fault.producer||fault.trace){
  const source={...releasePlan.source,...formal50,schemaHash:SCHEMA14},target={...releasePlan.target,...formal50,runtime:'3.7.0',schemaHash:SCHEMA14,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.7.0/fixture',productVersion:51,migrations:[...formal50.migrations,MIGRATION51]};
  if(fault.producer||fault.trace)Object.assign(source,{...target,sha});
  const raw=(commit,node)=>JSON.stringify({config:{Env:['NODE_VERSION='+node,'LINGXILOOP_COMMIT_SHA='+commit],Cmd:['node']}}),imageConfigs={source:raw(sha,'22.23.4'),target:raw(next,'22.23.5')};
  source.image={...source.image,configDigest:'sha256:'+createHash('sha256').update(imageConfigs.source).digest('hex')};target.image={...target.image,configDigest:'sha256:'+createHash('sha256').update(imageConfigs.target).digest('hex')};
  if(fault.trace)Object.assign(target,{runtime:'3.8.0',productVersion:52,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.0/fixture',migrations:[...source.migrations,traceMigration]});
  if(fault.repair){Object.assign(source,{runtime:target.runtime,productVersion:target.productVersion,tarball:target.tarball,migrations:target.migrations});Object.assign(target,{runtime:'3.8.2',productVersion:53,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.2/fixture',migrations:[...source.migrations,MIGRATION53]});}
  if(fault.presentation){Object.assign(source,{runtime:target.runtime,productVersion:target.productVersion,tarball:target.tarball,migrations:structuredClone(target.migrations)});Object.assign(target,{productVersion:54,migrations:[...structuredClone(source.migrations),presentationMigration]});}
  releasePlan=sealHostPlan({...releasePlan,format:fault.presentation?presentationFormat:fault.repair?CONVERSATION_FORMAT:fault.trace?traceFormat:fault.reader?READER_FORMAT:PRODUCER_FORMAT,source,target,imageConfigs,publicText:{source:fault.reader?null:{reader:2,producer:fault.trace?'purpose-json-v1':'disabled'},target:{reader:2,producer:fault.reader?'disabled':'purpose-json-v1'},sourceConfigurationSha256:fault.reader?null:hash,targetConfigurationSha256:hash,sourceContainers:fault.producer||fault.trace?['lingxiloop-app-a','lingxiloop-app-b'].flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),imageId:'sha256:'+'c'.repeat(64)}))):null}});
 }
 if(fault.image54){const p=JSON.parse(JSON.stringify(releasePlan));p.format='product54-image-host-release/v1';for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations'])p.source[k]=structuredClone(p.target[k]);for(const row of p.stacks.slice(0,2)){row.source.autoPull=false;row.source.extraArgs=['--no-deps','--pull','never']}releasePlan=sealHostPlan(p)}
 if(fault.runtimePatch||fault.producerV2){const p=structuredClone(releasePlan);p.format='runtime-patch-host-release/v1';p.target.runtime='3.8.3';p.target.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.3/fixture';p.target.integrity='sha512-'+Buffer.alloc(64,1).toString('base64');releasePlan=sealHostPlan(p)}
 if(fault.producerV2){const p=structuredClone(releasePlan);p.source.runtime='3.8.3';p.source.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.3/fixture';p.target.runtime='3.8.5';p.target.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.5/fixture';p.publicText.target.producer='purpose-json-v2';p.publicText.targetConfigurationSha256='d'.repeat(64);releasePlan=sealHostPlan(p)}
 if(fault.producerV3){const p=structuredClone(releasePlan);p.source.runtime='3.8.5';p.source.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.5/fixture';p.target.runtime='3.8.7';p.target.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.7/fixture';p.publicText.source.producer='purpose-json-v2';p.publicText.target={reader:3,producer:'purpose-json-v3'};releasePlan=sealHostPlan(p)}
 if(fault.cover55||fault.same55){
  const p=structuredClone(releasePlan);p.format=fault.same55?'product55-image-host-release/v1':'case-cover55-host-release/v1';
  for(const d of [p.source,p.target])Object.assign(d,CASE_COVER_PACKAGE)
  p.publicText.source=p.publicText.target={reader:3,producer:'purpose-json-v3'};p.publicText.sourceConfigurationSha256=p.publicText.targetConfigurationSha256;
  p.target.productVersion=55;p.target.migrations.push({version:55,name:'case_covers',checksum:'609100abaddceeaba19d363962d6defbfae3276450a2fd660777d7efd4a66160'});
  if(fault.same55){p.source.productVersion=55;p.source.migrations=structuredClone(p.target.migrations)}
  else p.backup={...nativeBackup(),format:2,profile:'native14-product54',source:{sha:p.source.sha,productVersion:54,runtime:Object.fromEntries(['runtime','schema','protocol','schemaHash','integrity','tarball'].map(k=>[k,p.source[k]])),migrations:p.source.migrations}};
  releasePlan=sealHostPlan(p);
 }
 const trace=[],events=[],rows=apps.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,server:i?'shanghai-b':'shanghai-a',service,id:String(i*2+j+1).repeat(64),source:sha,imageId:digest,running:true,restarting:false,restartCount:0,pid:1,healthy:true,policy:{readOnly:service==='worker'}})))
 let staged=0,deployed=0,stops=0,targetInspections=0,stateReads=0,migrated=false
 const ops={
  async assertIdle(){trace.push('idle');if(fault.idle)throw Error('idle')},
  async inspect(){trace.push('inspect');if(fault.replacedTarget&&deployed===1&&++targetInspections===2)rows[0].id='e'+rows[0].id.slice(1);return structuredClone(rows)},
  async state(){trace.push('state');if(++stateReads>fault.stateUnknownAfter||migrated&&fault.migrationStateUnknown)throw Object.assign(Error('unknown state'),{uncertain:true});const s=state(migrated?releasePlan.target:releasePlan.source);s.installedSchema=s.schema;if(fault.native14)s.otherClients=stops===4?0:4;if(fault.otherClients&&stops===4)s.otherClients=1;if(fault.busy&&stops===2)s.liveWork=1;if(fault.schema&&deployed)s.schemaHash='e'.repeat(64);return s},
  async verifyImages(which='target'){trace.push('images:'+which);if(fault.image&&which==='target')throw Error('missing image')},
  async stage(stack){trace.push('stage:'+stack);staged++;if(fault.stage&&staged===2)throw Object.assign(Error('unknown'),{uncertain:true})},
  async metadata(stack){trace.push('metadata:'+stack);return {...releasePlan.target,...((fault.reader||fault.producer||fault.trace)?{publicText:fault.wrongV3Capability?2:releasePlan.publicText.target.reader,deployment:{...releasePlan.publicText.target,...(fault.producerLeak?{producer:'purpose-json-v1'}:{})},configurationSha256:releasePlan.publicText.targetConfigurationSha256,modelOptions:fault.producerV2?{publicTextProtocol:fault.wrongV2Options?'purpose-json-v1':releasePlan.publicText.target.producer}:fault.producer||fault.trace?{publicTextProtocol:'purpose-json-v1'}:{},...(fault.trace?{runTrace:1}:{})}:{}),...(fault.metadata&&stack===apps[1]?{schema:releasePlan.target.schema+1}:{})}},
  async patchPrecheck(){trace.push('patch-precheck');if(fault.bound)throw Error('incompatible old runs');return {incompatibleRuns:0}},
  async patchProvenance(){trace.push('patch');if(fault.patchUnknown)throw Object.assign(Error('unknown patch'),{uncertain:true});if(fault.patchFailed)throw Error('patch failed');migrated=true;if(fault.patchCommittedFailure)throw Error('patch committed before failure')},
  async seedPrecheck(){trace.push('seed');if(fault.seedUnknown)throw Object.assign(Error('unknown seed'),{uncertain:true});if(fault.seed)throw Error('seed drift');return {equal:true}},
  async backup(){trace.push('backup');if(fault.backupUnknown)throw Object.assign(Error('backup unknown'),{uncertain:true});return {...backupReceipt(),...(fault.cover55?{source:releasePlan.backup.source,attempt:releasePlan.backup.attempt,commandHash:releasePlan.backup.commandHash}:{}),...(fault.badBackup?{isolatedDatabaseRemoved:false}:{})}},
  async migrate(){trace.push('migrate');if(fault.migrationUnknown)throw Object.assign(Error('unknown migration'),{uncertain:true});if(fault.migrationFailed)throw Error('migration failed');migrated=true;if(fault.migrationCommittedFailure)throw Error('migration committed before failure')},
  async stop(stack,service){trace.push('stop:'+stack+':'+service);stops++;if(fault.stopUnknown)throw Object.assign(Error('unknown'),{uncertain:true});const row=rows.find(x=>x.stack===stack&&x.service===service);if(!fault.stillRunning){row.running=false;row.pid=0}},
  async deploy(stack,service){trace.push('deploy:'+stack+':'+service);deployed++;if(fault.deployUnknown)throw Object.assign(Error('unknown'),{uncertain:true});const row=rows.find(x=>x.stack===stack&&x.service===service);Object.assign(row,{source:next,id:'f'+row.id.slice(1),running:true,pid:2});if(fault.policy)row.policy.readOnly=!row.policy.readOnly},
  async verifyHealthy(stack,service){trace.push('health:'+stack+':'+service);if(fault.health)throw Error('unhealthy')},
  async wait(){trace.push('wait')},
  async stagePreparation(stack){trace.push('prepare:'+stack)},
  async pullPrepared(stack){trace.push('pull:'+stack);if(fault.pullUnknown)throw Object.assign(Error('unknown'),{uncertain:true})},
  async restoreSource(stack){trace.push('restore:'+stack)},
 }
 return {ops,trace,events,plan:releasePlan,run:()=>runHostRelease({plan:releasePlan,ops,onProgress:async e=>events.push(e)}),prepare:()=>runImagePreparation({plan:releasePlan,ops,onProgress:async e=>events.push(e)})}
}
async function stoppedFixture(fault={}){
 const f=fixture({repair:true,...fault}),original=await f.ops.inspect()
 for(const stack of apps)for(const service of ['lingxiloop','worker'])await f.ops.stop(stack,service)
 f.trace.length=0
 const receipt={planHash:f.plan.planHash,mode:f.plan.format,complete:false,events:[{phase:'preflight',status:'verified',original},...apps.map(stack=>({phase:'host-config',status:'verified',stack,fullConfigReadback:true})),...original.map(({stack,service})=>({phase:'drain',status:'stopped',stack,service})),{phase:'stopped',status:'failed',recovery:'source-unchanged-recovery-requires-review',noAutomaticRetry:true}]}
 f.ops.resumeStoppedBoundary=async()=>f.trace.push('resume-boundary')
 return {...f,run:()=>continueStoppedRelease({plan:f.plan,receipt,ops:f.ops,onProgress:async e=>f.events.push(e)})}
}
test('stopped52 continuation repeats neither staging nor stopping and migrates once before Web then Workers',async()=>{
 const f=await stoppedFixture(),r=await f.run();assert.equal(r.status,'complete')
 assert.equal(f.trace.filter(x=>x==='migrate').length,1)
 assert.equal(f.trace.some(x=>/^(stage|stop|pull|restore):/.test(x)),false)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(service=>apps.map(stack=>'deploy:'+stack+':'+service)))
 assert.equal(f.events.filter(e=>e.status==='zero-leases').slice(0,2).length,2)
})
test('stopped52 continuation refuses live leases, changed provenance and target metadata before migration',async()=>{
 for(const fault of ['leases','provenance','metadata']){
  const f=await stoppedFixture({metadata:fault==='metadata'}),state=f.ops.state
  f.ops.state=async()=>({...await state(),...(fault==='leases'?{liveWork:1}:fault==='provenance'?{runtime:'9.9.9'}:{})})
  await assert.rejects(f.run());assert.equal(f.trace.includes('migrate'),false);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)
 }
})
test('stopped52 continuation never reads or replays after uncertain migration',async()=>{
 const f=await stoppedFixture({migrationUnknown:true});await assert.rejects(f.run())
 assert.equal(f.trace.at(-1),'migrate');assert.equal(f.events.at(-1).status,'uncertain')
})
test('presentation release waits for a naturally expiring post-stop lease before the two zero barriers',async()=>{
 const f=fixture({presentation:true}),state=f.ops.state;let liveReads=0
 f.ops.state=async()=>{const s=await state();if(f.trace.filter(x=>x.startsWith('stop:')).length===4&&!f.trace.includes('migrate')&&liveReads++<2)return {...s,liveWork:1,liveSession:1,liveAttempts:1};return s}
 await f.run();assert.equal(f.events.filter(e=>e.status==='waiting-for-lease-expiry').length,2)
 const migration=f.events.findIndex(e=>e.phase==='migration');assert.equal(f.events.slice(0,migration).filter(e=>e.status==='zero-leases').length,2)
 assert.equal(f.trace.filter(x=>x==='migrate').length,1)
})
test('product54 image-only profile drains all writers, waits naturally, never migrates, and deploys Web before Worker',async()=>{
 const f=fixture({image54:true}),read=f.ops.state;let leases=0
 f.ops.state=async()=>{const s=await read();if(f.trace.filter(x=>x.startsWith('stop:')).length===4&&leases++<2)return {...s,liveWork:1};return s}
 const result=await f.run();assert.equal(result.state.product,54);assert.equal(result.runTrace,1)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)))
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
 assert.equal(f.events.filter(e=>e.status==='waiting-for-lease-expiry').length,2)
 assert.equal(f.trace.some(x=>['migrate','backup','seed'].includes(x)),false)
})
test('product54 image-only rejects changed package, full inventory, reader, source identity and policy',()=>{
 const p=fixture({image54:true}).plan
 assert.doesNotThrow(()=>validateHostPlanShape(p))
 for(const change of [q=>q.source.productVersion=53,q=>q.target.productVersion=55,q=>q.target.runtime='3.8.3',q=>q.target.schema=13,
  q=>q.target.integrity='sha512-'+Buffer.alloc(64,1).toString('base64'),q=>q.target.tarball+='changed',q=>q.target.migrations[0].checksum='0'.repeat(64),
  q=>q.target.migrations[53].checksum='0'.repeat(64),q=>q.publicText.source.producer='disabled',q=>q.publicText.target.producer='disabled',
  q=>q.publicText.targetConfigurationSha256='0'.repeat(64),q=>q.publicText.sourceContainers.pop(),q=>q.stacks[0].source.autoPull=true,
  q=>q.format='same-schema-host-release/v1']){
  const bad=structuredClone(p);change(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)))
 }
})
test('product54 refuses changed accepted containers, drift, live leases and uncertain actions',async()=>{
 for(const fault of ['identity','schema','leases','metadata','unknown']){
  const f=fixture({image54:true,metadata:fault==='metadata',stopUnknown:fault==='unknown'})
  if(fault==='identity'){const read=f.ops.inspect;f.ops.inspect=async()=>{const rows=await read();rows[0].id='e'.repeat(64);return rows}}
  if(fault==='schema'||fault==='leases'){const read=f.ops.state;f.ops.state=async()=>({...await read(),...(fault==='schema'?{product:53}:{liveWork:1})})}
  await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);assert.equal(f.trace.includes('migrate'),false)
 }
})
test('product54 health observation identity must survive final deployment registration',async()=>{
 const f=fixture({image54:true}),inspect=f.ops.inspect;let replaced=false
 f.ops.verifyHealthy=async()=>{replaced=true}
 f.ops.inspect=async()=>{const rows=await inspect();if(replaced)for(const r of rows)if(r.source===f.plan.target.sha&&r.stack===apps[0]&&r.service==='lingxiloop')r.id='9'.repeat(64);return rows}
 await assert.rejects(f.run());assert.equal(f.trace.filter(x=>x.startsWith('deploy:')).length,1)
})
test('same formal package and all48 checksums required; native13 alone is insufficient',()=>{
 assert.doesNotThrow(()=>assertSameSchema(source,target))
 for(const key of ['runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations']){
  const bad=structuredClone(target);bad[key]=key==='migrations'?migrations.slice(1):typeof bad[key]==='number'?bad[key]+1:'different'
  assert.throws(()=>assertSameSchema(source,bad))
 }
})
test('native14 same-schema accepts exact formal3.6.0/product50 and binds every formal key and all50 rows',()=>{
 const {source,target}=fixture({sameNative14:true}).plan
 assert.doesNotThrow(()=>assertSameSchema(source,target))
 assert.doesNotThrow(()=>validateHostPlanShape(fixture({sameNative14:true}).plan))
 for(const key of ['runtime','schema','protocol','schemaHash','integrity','tarball','productVersion']){
  const bad=structuredClone(target);bad[key]=typeof bad[key]==='number'?bad[key]+1:'different'
  assert.throws(()=>assertSameSchema(source,bad),/differs/)
 }
 for(let row=0;row<50;row++)for(const key of ['name','checksum']){
  const bad=structuredClone(target);bad.migrations[row][key]=key==='name'?'different':'e'.repeat(64)
  assert.throws(()=>assertSameSchema(source,bad),/differs/)
 }
 for(const rows of [target.migrations.slice(1),[...target.migrations.slice(0,49),target.migrations[48]]]){
  assert.throws(()=>assertSameSchema({...source,migrations:rows},{...target,migrations:rows}),/inventory/)
 }
})
test('native14 same-schema rejects other profiles and native transitions before any action',async()=>{
 for(const patch of [{runtime:'3.6.1'},{runtime:'3.5.8'},{schema:15},{productVersion:49},{productVersion:51}]){
  const f=fixture({sameNative14:true}),bad=sealHostPlan({...f.plan,source:{...f.plan.source,...patch},target:{...f.plan.target,...patch}})
  await assert.rejects(runHostRelease({plan:bad,ops:f.ops}));assert.deepEqual(f.trace,[])
 }
 const native=fixture({native14:true}).plan,{backup:_,...ordinary}=native
 for(const [source,target] of [[native.source,native.target],[native.target,native.source]]){
  assert.throws(()=>validateHostPlanShape(sealHostPlan({...ordinary,format:'same-schema-host-release/v1',source,target})))
 }
})
test('native14 same-schema retains Worker-only drain and ordered rollout without backup or migration',async()=>{
 const f=fixture({sameNative14:true}),result=await f.run()
 assert.equal(result.status,'complete');assert.equal(result.state.installedSchema,14);assert.equal(result.state.product,50)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),apps.map(s=>'stop:'+s+':worker'))
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
 const firstStop=f.trace.findIndex(x=>x.startsWith('stop:')),firstDeploy=f.events.findIndex(e=>e.phase==='rollout')
 for(const stack of apps)assert.ok(f.trace.indexOf('metadata:'+stack)<firstStop)
 assert.ok(f.events.slice(0,firstDeploy).filter(e=>e.status==='zero-leases').length>=2)
 assert.equal(f.trace.some(x=>/pull|migrate|backup|restore/.test(x)),false)
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
test('known failure followed by uncertain classification oneoff remains finally uncertain',async()=>{
 const f=fixture({metadata:true,stateUnknownAfter:1})
 await assert.rejects(f.run(),e=>e.uncertain===true)
 assert.equal(f.events.at(-1).status,'uncertain');assert.equal(f.events.at(-1).recovery,'unknown')
 assert.equal(f.trace.at(-1),'state');assert.equal(f.trace.filter(x=>x==='state').length,2)
 assert.equal(f.trace.some(x=>x.startsWith('stop:')||x.startsWith('deploy:')),false)
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
test('product-only format permits exact48→49 and same-schema49, never altered history/package or downgrade',()=>{
 const migration=fixture({upgrade:true}).plan,same=fixture({product49:true}).plan
 assert.doesNotThrow(()=>validateHostPlanShape(migration))
 assert.doesNotThrow(()=>validateHostPlanShape(same))
 for(const change of [
  p=>p.target.migrations[0].checksum='e'.repeat(64),
  p=>p.target.migrations[48].checksum='e'.repeat(64),
  p=>p.target.migrations[48].name='different',
  p=>p.target.runtime='3.5.9',p=>p.target.schema=14,
  p=>p.target.protocol=12,p=>p.target.integrity+='x',
  p=>p.format='same-schema-host-release/v1',
  p=>{[p.source,p.target]=[p.target,p.source]},
 ]){
  const bad=JSON.parse(JSON.stringify(migration));change(bad)
  assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)))
 }
})
test('48→49 retains old Web, drains two Workers, migrates once after two barriers and before any deploy',async()=>{
 const f=fixture({upgrade:true}),result=await f.run()
 assert.equal(result.state.product,49)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),apps.map(s=>'stop:'+s+':worker'))
 assert.equal(f.trace.filter(x=>x==='migrate').length,1)
 const migration=f.trace.indexOf('migrate'),firstDeploy=f.trace.findIndex(x=>x.startsWith('deploy:'))
 assert.ok(migration>f.trace.lastIndexOf('wait')&&migration<firstDeploy)
 assert.equal(f.events.filter(e=>e.phase==='drain'&&e.status==='zero-leases'&&e.state.product===48).length,2)
 assert.equal(f.events.find(e=>e.phase==='migration'&&e.status==='migrated').state.count,49)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
 assert.equal(f.trace.some(x=>/backup|restore|pull/.test(x)),false)
})
test('49→49 and48→49 image preparation never execute a migration',async()=>{
 const same=fixture({product49:true});await same.run();assert.equal(same.trace.includes('migrate'),false)
 const preparation=fixture({upgrade:true});await preparation.prepare()
 assert.equal(preparation.trace.some(x=>x==='migrate'||/^(stop|deploy):/.test(x)),false)
})
test('failed migration classifies fresh exact source or committed49 without deploy or retry',async()=>{
 for(const [fault,recovery] of [[{migrationFailed:true},'source-unchanged-recovery-requires-review'],[{migrationCommittedFailure:true},'fix-forward']]){
  const f=fixture({upgrade:true,...fault});await assert.rejects(f.run())
  assert.equal(f.trace.filter(x=>x==='migrate').length,1)
  assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)
  assert.equal(f.events.at(-1).recovery,recovery)
 }
})
test('unknown migration or post-migration state forbids all further requests',async()=>{
 for(const fault of [{migrationUnknown:true},{migrationStateUnknown:true}]){
  const f=fixture({upgrade:true,...fault});await assert.rejects(f.run(),error=>error.uncertain===true)
  assert.equal(f.trace.filter(x=>x==='migrate').length,1)
  assert.equal(f.trace.at(-1),fault.migrationUnknown?'migrate':'state')
  assert.equal(f.events.at(-1).status,'uncertain')
  assert.equal(f.events.at(-1).recovery,'unknown')
  assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)
 }
})

test('native14 explicit profile rejects wrong boundary, altered49 history and missing/fake source backup',()=>{
 const p=fixture({native14:true}).plan;assert.doesNotThrow(()=>validateHostPlanShape(p))
 for(const change of [p=>delete p.backup,p=>p.source.productVersion=48,p=>p.target.schema=15,p=>p.target.runtime='3.6.1',p=>p.target.protocol=12,p=>p.target.migrations[4].checksum='e'.repeat(64),p=>p.backup.source.runtime.schema=12,p=>p.backup.profile='native12-product46',p=>p.format='product-schema-host-release/v1']){
  const bad=JSON.parse(JSON.stringify(p));change(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)))
 }
})
test('native14 stops all4 writers, makes fresh backup between full barriers, migrates once then ordered recovery',async()=>{
 const f=fixture({native14:true}),result=await f.run();assert.equal(result.state.schema,14);assert.equal(result.state.product,50)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)))
 assert.equal(f.trace.filter(x=>x==='backup').length,1);assert.equal(f.trace.filter(x=>x==='migrate').length,1)
 assert.ok(f.trace.indexOf('backup')>f.trace.indexOf('wait')&&f.trace.indexOf('migrate')>f.trace.indexOf('backup'))
 assert.equal(f.events.filter(e=>e.phase==='drain'&&e.status==='zero-leases'&&e.state.product===49).length,4)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
 assert.equal(f.events.find(e=>e.phase==='backup').receipt.commandHash,nativeBackup().commandHash)
})
test('native14 busy Web/invalid restore/unknown backup prevents migration and unknown makes no further request',async()=>{
 for(const fault of [{otherClients:true},{badBackup:true},{backupUnknown:true}]){
  const f=fixture({native14:true,...fault});await assert.rejects(f.run());assert.equal(f.trace.includes('migrate'),false)
  if(fault.backupUnknown){assert.equal(f.trace.at(-1),'backup');assert.equal(f.events.at(-1).status,'uncertain')}
 }
})
test('native14 known failures classify unchanged source13 or target14, uncertainty remains final',async()=>{
 for(const [fault,recovery] of [[{migrationFailed:true},'source-unchanged-recovery-requires-review'],[{migrationCommittedFailure:true},'fix-forward'],[{migrationUnknown:true},'unknown'],[{migrationStateUnknown:true},'unknown']]){
  const f=fixture({native14:true,...fault});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,recovery)
  assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);assert.equal(f.trace.filter(x=>x==='migrate').length,1)
 }
 const f=fixture({native14:true,metadata:true,stateUnknownAfter:1});await assert.rejects(f.run(),e=>e.uncertain===true);assert.equal(f.trace.at(-1),'state')
})
test('native14 image preparation never drains, backs up or migrates',async()=>{
 const f=fixture({native14:true});await f.prepare();assert.equal(f.trace.some(x=>x==='backup'||x==='migrate'||x.startsWith('stop:')),false)
})

test('reader provenance release disables producer, drains four originals, migrates once, then both Web before Workers',async()=>{
 const f=fixture({reader:true}),result=await f.run();assert.equal(result.state.product,51);assert.equal(result.state.runtime,'3.7.0');
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)));
 assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.ok(f.trace.indexOf('seed')<f.trace.findIndex(x=>x.startsWith('stop:')));assert.ok(f.trace.indexOf('migrate')>f.trace.indexOf('wait'));
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));
 assert.equal(f.trace.includes('backup'),false);assert.deepEqual(result.publicText,{reader:2,producer:'disabled'});
});
test('reader producer leak/seed drift aborts before stop; unknown migration makes no further calls',async()=>{
 for(const fault of [{producerLeak:true},{seed:true},{seedUnknown:true}]){const f=fixture({reader:true,...fault});await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('stop:')),false);}
 const f=fixture({reader:true,migrationUnknown:true});await assert.rejects(f.run(),e=>e.uncertain);assert.equal(f.trace.at(-1),'migrate');assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);
});
test('reader transaction failed before or after commit is classified without repeat',async()=>{
 for(const [fault,recovery] of [[{migrationFailed:true},'source-unchanged-recovery-requires-review'],[{migrationCommittedFailure:true},'fix-forward']]){const f=fixture({reader:true,...fault});await assert.rejects(f.run());assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.equal(f.events.at(-1).recovery,recovery);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);}
});
test('separate producer phase keeps capable readers, worker-only drain, no migration or seed',async()=>{
 const f=fixture({producer:true}),r=await f.run();assert.equal(r.publicText.producer,'purpose-json-v1');assert.equal(f.trace.some(x=>['seed','migrate','backup'].includes(x)),false);assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),apps.map(a=>'stop:'+a+':worker'));
});

test('producer source container replacement refuses staging and stopping',async()=>{const f=fixture({producer:true});f.plan.publicText.sourceContainers[0].id='0'.repeat(64);f.plan=sealHostPlan(f.plan);await assert.rejects(runHostRelease({plan:f.plan,ops:f.ops}));assert.equal(f.trace.some(x=>x.startsWith('stage:')||x.startsWith('stop:')),false);});

test('explicit trace profile accepts only enabled3.7 full51 to3.8 full52 and retains old profile rejection',()=>{
 const f=fixture({trace:true});assert.doesNotThrow(()=>validateHostPlanShape(f.plan));
 for(const change of [p=>p.source.runtime='3.6.0',p=>p.target.runtime='3.8.2',p=>p.target.productVersion=51,p=>p.target.schema=15,p=>p.target.protocol=12,p=>p.target.schemaHash='0'.repeat(64),p=>p.target.migrations[3].checksum='0'.repeat(64),p=>p.target.migrations[50].checksum='0'.repeat(64),p=>p.target.migrations[51].checksum='0'.repeat(64),p=>p.publicText.source.producer='disabled',p=>p.publicText.target.producer='disabled',p=>p.publicText.sourceContainers.pop(),p=>p.format=PRODUCER_FORMAT,p=>p.format=READER_FORMAT,p=>p.format='same-schema-host-release/v1']){
  const bad=JSON.parse(JSON.stringify(f.plan));change(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)));
 }
});
test('trace provenance drains all4 once after seed, migrates once, and deploys both Web before Worker',async()=>{
 const f=fixture({trace:true}),result=await f.run();assert.equal(result.state.runtime,'3.8.0');assert.equal(result.state.product,52);assert.equal(result.runTrace,1);assert.deepEqual(result.publicText,{reader:2,producer:'purpose-json-v1'});
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)));
 assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.ok(f.trace.indexOf('seed')<f.trace.findIndex(x=>x.startsWith('stop:')));assert.ok(f.trace.indexOf('migrate')>f.trace.indexOf('wait'));
 assert.equal(f.events.filter(e=>e.status==='zero-leases'&&e.state.product===51).length,2);assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));assert.equal(f.trace.includes('backup'),false);
 const replaced=fixture({trace:true});replaced.plan.publicText.sourceContainers[0].id='0'.repeat(64);await assert.rejects(runHostRelease({plan:sealHostPlan(replaced.plan),ops:replaced.ops}));assert.equal(replaced.trace.some(x=>x.startsWith('stage:')||x.startsWith('stop:')),false);
});
test('trace unknown results stop all calls; committed52 is fix-forward without a second migration',async()=>{
 for(const [fault,last]of [[{seedUnknown:true},'seed'],[{migrationUnknown:true},'migrate'],[{migrationStateUnknown:true},'state']]){const f=fixture({trace:true,...fault});await assert.rejects(f.run(),e=>e.uncertain);assert.equal(f.trace.at(-1),last);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);assert.equal(f.events.at(-1).recovery,'unknown');}
 for(const [fault,recovery]of [[{migrationFailed:true},'source-unchanged-recovery-requires-review'],[{migrationCommittedFailure:true},'fix-forward']]){const f=fixture({trace:true,...fault});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,recovery);assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);}
});

test('explicit conversation repair profile accepts only enabled3.8 full52 to3.8.2 full53 and retains old profile rejection',()=>{
 const f=fixture({repair:true});assert.doesNotThrow(()=>validateHostPlanShape(f.plan));
 for(const change of [p=>p.source.runtime='3.6.0',p=>p.target.runtime='3.8.0',p=>p.target.productVersion=51,p=>p.target.schema=15,p=>p.target.protocol=12,p=>p.target.schemaHash='0'.repeat(64),p=>p.target.migrations[3].checksum='0'.repeat(64),p=>p.target.migrations[50].checksum='0'.repeat(64),p=>p.target.migrations[51].checksum='0'.repeat(64),p=>p.target.migrations[52].checksum='0'.repeat(64),p=>p.publicText.source.producer='disabled',p=>p.publicText.target.producer='disabled',p=>p.publicText.sourceContainers.pop(),p=>p.format=PRODUCER_FORMAT,p=>p.format=READER_FORMAT,p=>p.format='same-schema-host-release/v1']){
  const bad=JSON.parse(JSON.stringify(f.plan));change(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)));
 }
});
test('conversation repair provenance drains all4 once after seed, migrates once, and deploys both Web before Worker',async()=>{
 const f=fixture({repair:true}),result=await f.run();assert.equal(result.state.runtime,'3.8.2');assert.equal(result.state.product,53);assert.equal(result.runTrace,1);assert.deepEqual(result.publicText,{reader:2,producer:'purpose-json-v1'});
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)));
 assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.ok(f.trace.indexOf('seed')<f.trace.findIndex(x=>x.startsWith('stop:')));assert.ok(f.trace.indexOf('migrate')>f.trace.indexOf('wait'));
 assert.equal(f.events.filter(e=>e.status==='zero-leases'&&e.state.product===52).length,2);assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));assert.equal(f.trace.includes('backup'),false);
 const replaced=fixture({repair:true});replaced.plan.publicText.sourceContainers[0].id='0'.repeat(64);await assert.rejects(runHostRelease({plan:sealHostPlan(replaced.plan),ops:replaced.ops}));assert.equal(replaced.trace.some(x=>x.startsWith('stage:')||x.startsWith('stop:')),false);
});
test('conversation repair unknown results stop all calls; committed53 is fix-forward without a second migration',async()=>{
 for(const [fault,last]of [[{seedUnknown:true},'seed'],[{migrationUnknown:true},'migrate'],[{migrationStateUnknown:true},'state']]){const f=fixture({repair:true,...fault});await assert.rejects(f.run(),e=>e.uncertain);assert.equal(f.trace.at(-1),last);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);assert.equal(f.events.at(-1).recovery,'unknown');}
 for(const [fault,recovery]of [[{migrationFailed:true},'source-unchanged-recovery-requires-review'],[{migrationCommittedFailure:true},'fix-forward']]){const f=fixture({repair:true,...fault});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,recovery);assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);}
});


test('presentation profile rejects skipped53, package drift, historical drift and every legacy format',()=>{
 const f=fixture({presentation:true});assert.doesNotThrow(()=>validateHostPlanShape(f.plan));
 for(const change of [p=>p.source.productVersion=52,p=>p.source.migrations.pop(),p=>p.target.runtime='3.8.3',p=>p.target.integrity='sha512-'+Buffer.alloc(64,1).toString('base64'),p=>p.target.tarball+='-changed',p=>p.target.migrations[52].checksum='0'.repeat(64),p=>p.target.migrations[53].checksum='0'.repeat(64),p=>p.target.migrations[0].checksum='0'.repeat(64),p=>p.publicText.sourceContainers.pop(),p=>p.format=CONVERSATION_FORMAT,p=>p.format=PRODUCER_FORMAT,p=>p.format=READER_FORMAT,p=>p.format='same-schema-host-release/v1']){
  const bad=structuredClone(f.plan);change(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)),String(change));
 }
});
test('presentation upgrade drains four exact53 readers, migrates once and starts both Webs before Workers',async()=>{
 const f=fixture({presentation:true}),result=await f.run();assert.equal(result.state.runtime,'3.8.2');assert.equal(result.state.schema,14);assert.equal(result.state.product,54);assert.equal(result.runTrace,1);
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)));
 assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.ok(f.trace.indexOf('seed')<f.trace.findIndex(x=>x.startsWith('stop:')));assert.ok(f.trace.indexOf('migrate')>f.trace.indexOf('wait'));
 assert.equal(f.events.filter(e=>e.status==='zero-leases'&&e.state.product===53).length,2);
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));
 f.trace.length=0;await assert.rejects(f.run());assert.equal(f.trace.includes('migrate'),false);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);
 const replaced=fixture({presentation:true});replaced.plan.publicText.sourceContainers[0].id='0'.repeat(64);
 await assert.rejects(runHostRelease({plan:sealHostPlan(replaced.plan),ops:replaced.ops}));assert.equal(replaced.trace.some(x=>x.startsWith('stage:')||x.startsWith('stop:')),false);
});
test('presentation unknown outcomes stop calls; committed54 only records fix-forward without retry',async()=>{
 for(const [fault,last]of [[{seedUnknown:true},'seed'],[{migrationUnknown:true},'migrate'],[{migrationStateUnknown:true},'state']]){
  const f=fixture({presentation:true,...fault});await assert.rejects(f.run(),e=>e.uncertain);assert.equal(f.trace.at(-1),last);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);assert.equal(f.events.at(-1).recovery,'unknown');
 }
 for(const [fault,recovery]of [[{migrationFailed:true},'source-unchanged-recovery-requires-review'],[{migrationCommittedFailure:true},'fix-forward']]){
  const f=fixture({presentation:true,...fault});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,recovery);assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);
 }
});


test('runtime patch preserves full54 while CAS runs once after four stops and two barriers',async()=>{
 const f=fixture({runtimePatch:true});const result=await f.run();assert.equal(result.state.runtime,'3.8.3');assert.equal(result.state.product,54)
 assert.equal(f.trace.filter(x=>x==='patch').length,1);assert.equal(f.trace.includes('migrate'),false);assert.equal(f.trace.includes('seed'),false)
 assert.ok(f.trace.indexOf('patch-precheck')<f.trace.findIndex(x=>x.startsWith('stop:')))
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)))
 assert.equal(f.events.filter(e=>e.status==='zero-leases'&&e.state.runtime==='3.8.2').length,2)
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
})
test('runtime patch rejects mismatched profiles and old bound work before stopping',async()=>{
 const f=fixture({runtimePatch:true});
 for(const change of [p=>p.target.runtime='3.9.0',p=>p.target.runtime='3.8.2',p=>p.target.schema=15,p=>p.target.migrations[0].checksum='0'.repeat(64),p=>p.target.productVersion=55,p=>p.publicText.targetConfigurationSha256='0'.repeat(64)]){
  const p=structuredClone(f.plan);change(p);assert.throws(()=>validateHostPlanShape(sealHostPlan(p)))
 }
 const bound=fixture({runtimePatch:true,bound:true});await assert.rejects(bound.run());assert.equal(bound.trace.some(x=>x.startsWith('stop:')),false)
})
test('runtime patch unknown stops without read/replay; known outcomes distinguish source and target',async()=>{
 const f=fixture({runtimePatch:true,patchUnknown:true});await assert.rejects(f.run(),e=>e.uncertain);assert.equal(f.trace.at(-1),'patch');assert.equal(f.events.at(-1).recovery,'unknown')
 for(const [fault,recovery] of [[{patchFailed:true},'source-unchanged-recovery-requires-review'],[{patchCommittedFailure:true},'fix-forward']]){
  const f=fixture({runtimePatch:true,...fault});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,recovery);assert.equal(f.trace.filter(x=>x==='patch').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)
 }
})
test('known failed runtime CAS restores all four original services only while source provenance remains exact',async()=>{
 const f=fixture({runtimePatch:true,patchFailed:true}),inspect=f.ops.inspect
 f.ops.inspect=async()=>{const rows=await inspect();for(const r of rows)r.policy.configurationSha256=hash;return rows}
 await assert.rejects(f.run());const rows=await f.ops.inspect()
 const receipt={mode:f.plan.format,planHash:f.plan.planHash,complete:false,events:f.events},trace=[],events=[]
 const ops={
  async prepareSourceRestoration(){trace.push('prepare')},async assertIdle(){},
  async inspect(){return structuredClone(rows)},state:f.ops.state,
  async verifyImages(){return Object.fromEntries(apps.map(a=>[a,digest]))},
  async stop(){throw Error('Already stopped source must not be stopped again')},async wait(){},
  async restoreAcceptedSource(stack){trace.push('restore:'+stack)},
  async metadata(){return {...await f.ops.metadata(apps[0]),...f.plan.source}},
  async deploy(stack,service){trace.push('deploy:'+stack+':'+service);const r=rows.find(r=>r.stack===stack&&r.service===service);Object.assign(r,{id:'9'+r.id.slice(1),running:true,pid:2})},
  async verifyHealthy(stack,service,identity){const r=rows.find(r=>r.stack===stack&&r.service===service);assert.deepEqual(identity,{id:r.id,imageId:r.imageId})},
 }
 const result=await restoreImageSource({plan:f.plan,receipt,ops,onProgress:async e=>events.push(e)})
 assert.equal(result.status,'complete');assert.equal(result.state.runtime,'3.8.2')
 assert.equal(result.containers.filter(r=>r.running&&r.healthy).length,4)
 assert.deepEqual(trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)))
 assert.equal(events.filter(e=>e.phase==='rollout'&&e.status==='healthy').length,4)
 trace.length=0
 await assert.rejects(restoreImageSource({plan:f.plan,receipt,ops:{...ops,state:async()=>({...await f.ops.state(),runtime:'3.8.3'})}}))
 assert.deepEqual(trace,['prepare'])
})

test('v1 to v2 runtime patch retains precheck, four drains, two barriers and exactly one non-DDL CAS',async()=>{
 const f=fixture({producerV2:true});await f.prepare();assert.equal(f.trace.some(x=>x.startsWith('stop:')),false);f.trace.length=0;f.events.length=0;
 const result=await f.run();assert.equal(result.state.runtime,'3.8.5');assert.deepEqual(result.publicText,{reader:2,producer:'purpose-json-v2'});
 assert.ok(f.trace.indexOf('patch-precheck')<f.trace.findIndex(x=>x.startsWith('stop:')));assert.equal(f.trace.filter(x=>x==='patch').length,1);
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)));
 assert.equal(f.events.filter(e=>e.status==='zero-leases'&&e.state.runtime==='3.8.3').length,2);
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));
 assert.equal(f.trace.some(x=>['migrate','backup','seed'].includes(x)),false);
});
test('v2 runtime patch fails before stopping on actual v1 options or old bound work and never replays unknown CAS',async()=>{
 for(const fault of [{wrongV2Options:true},{bound:true}]){const f=fixture({producerV2:true,...fault});await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('stop:')),false);}
 const f=fixture({producerV2:true,patchUnknown:true});await assert.rejects(f.run(),e=>e.uncertain);assert.equal(f.trace.at(-1),'patch');assert.equal(f.trace.filter(x=>x==='patch').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);
});
test('v3 runtime patch drains old bindings and brings both compatible Web readers up before writers',async()=>{
 const f=fixture({producerV3:true});await f.prepare();assert.equal(f.trace.some(x=>x.startsWith('stop:')),false);f.trace.length=0;f.events.length=0;
 const result=await f.run();assert.equal(result.state.runtime,'3.8.7');assert.equal(result.state.product,54);assert.deepEqual(result.publicText,{reader:3,producer:'purpose-json-v3'});
 assert.ok(f.trace.indexOf('patch-precheck')<f.trace.findIndex(x=>x.startsWith('stop:')));assert.equal(f.trace.filter(x=>x==='patch').length,1);
 assert.equal(f.events.filter(e=>e.status==='zero-leases'&&e.state.runtime==='3.8.5').length,2);
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));
 assert.ok(f.trace.indexOf('health:'+apps[1]+':lingxiloop')<f.trace.indexOf('deploy:'+apps[0]+':worker'));
 assert.equal(f.trace.some(x=>['migrate','backup','seed'].includes(x)),false);
});
test('v3 release refuses stale capability/binding before downtime and retains unknown/fix-forward CAS outcomes',async()=>{
 for(const fault of [{wrongV3Capability:true},{wrongV2Options:true},{bound:true}]){const f=fixture({producerV3:true,...fault});await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('stop:')),false);}
 for(const [fault,recovery] of [[{patchUnknown:true},'unknown'],[{patchFailed:true},'source-unchanged-recovery-requires-review'],[{patchCommittedFailure:true},'fix-forward']]){
  const f=fixture({producerV3:true,...fault});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,recovery);
  assert.equal(f.trace.filter(x=>x==='patch').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);
  if(fault.patchUnknown)assert.equal(f.trace.at(-1),'patch');
 }
 const replaced=fixture({producerV3:true,replacedTarget:true});await assert.rejects(replaced.run());assert.equal(replaced.trace.filter(x=>x.startsWith('deploy:')).length,1);
});


test('cover55 upgrade requires the actual55 checksum, exact54 prefix/package, v3 and fresh source backup',()=>{
 const p=fixture({cover55:true}).plan;assert.doesNotThrow(()=>validateHostPlanShape(p));
 for(const change of [q=>q.target.runtime='3.8.13',q=>q.target.migrations[54].checksum='0'.repeat(64),q=>q.target.migrations[0].checksum='0'.repeat(64),q=>q.target.productVersion=54,q=>q.target.migrations.pop(),q=>q.target.schema=15,q=>q.target.protocol=12,q=>q.target.integrity+='a',q=>q.publicText.target.reader=2,q=>q.publicText.source.producer='purpose-json-v2',q=>q.publicText.targetConfigurationSha256='0'.repeat(64),q=>q.backup.profile='native13-product49',q=>q.backup.source.productVersion=53,q=>q.format='product54-image-host-release/v1']){const q=structuredClone(p);change(q);assert.throws(()=>validateHostPlanShape(sealHostPlan(q)),String(change))}
});
test('cover55 upgrade prepares online, expires leases, backs up once, migrates once then both Webs before Workers',async()=>{
 const f=fixture({cover55:true}),read=f.ops.state;let leases=0;
 f.ops.state=async()=>{const s=await read();return f.trace.filter(x=>x.startsWith('stop:')).length===4&&!f.trace.includes('backup')&&leases++<2?{...s,liveWork:1}:s};
 await f.prepare();assert.equal(f.trace.some(x=>x.startsWith('stop:')),false);f.trace.length=0;f.events.length=0;
 const result=await f.run();assert.equal(result.state.product,55);assert.equal(result.state.runtime,'3.8.12');assert.equal(result.runTrace,1);
 assert.equal(f.trace.filter(x=>x==='backup').length,1);assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.equal(f.trace.includes('seed'),false);
 assert.ok(f.trace.indexOf('backup')<f.trace.indexOf('migrate'));assert.equal(f.events.filter(e=>e.status==='waiting-for-lease-expiry').length,2);
 const backup=f.events.findIndex(e=>e.phase==='backup');assert.equal(f.events.slice(0,backup).filter(e=>e.status==='zero-leases').length,2);
 assert.deepEqual(f.trace.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(s=>apps.map(a=>'stop:'+a+':'+s)));
 assert.deepEqual(f.trace.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(s=>apps.map(a=>'deploy:'+a+':'+s)));
 assert.equal(f.events.filter(e=>e.status==='observed').length,4);
});
test('cover55 backup/unknown failures never migrate or replay; committed55 is fix-forward and refuses54 retry',async()=>{
 for(const fault of [{badBackup:true},{backupUnknown:true},{migrationUnknown:true},{migrationCommittedFailure:true}]){
  const f=fixture({cover55:true,...fault});await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);
  if(fault.badBackup||fault.backupUnknown)assert.equal(f.trace.includes('migrate'),false);
  if(fault.migrationUnknown){assert.equal(f.trace.at(-1),'migrate');assert.equal(f.events.at(-1).recovery,'unknown')}
  if(fault.migrationCommittedFailure){assert.equal(f.events.at(-1).recovery,'fix-forward');f.trace.length=0;await assert.rejects(restoreImageSource({plan:f.plan,receipt:{mode:f.plan.format,planHash:f.plan.planHash,complete:false,events:f.events},ops:f.ops}));assert.deepEqual(f.trace,[]);await assert.rejects(f.run());assert.equal(f.trace.includes('migrate'),false)}
 }
});
test('same55 followup retains full inventory and observed first identities without migration or backup',async()=>{
 const f=fixture({same55:true});await f.run();assert.equal(f.trace.some(x=>['migrate','backup','patch','seed'].includes(x)),false);assert.equal(f.events.filter(e=>e.status==='observed').length,4);
 const bad=structuredClone(f.plan);bad.target.migrations[54].checksum='0'.repeat(64);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)));
 const replaced=fixture({same55:true,replacedTarget:true});await assert.rejects(replaced.run());assert.equal(replaced.trace.filter(x=>x.startsWith('deploy:')).length,1);
});
