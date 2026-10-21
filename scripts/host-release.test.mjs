const traceFormat='run-trace-provenance-host-release/v1',traceMigration={version:52,name:'run_trace_provenance',checksum:'2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886'};
import test from 'node:test'
import {READER_FORMAT,PRODUCER_FORMAT,MIGRATION51,SCHEMA14} from './public-text-release.mjs'
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
 let releasePlan=sealHostPlan({...plan,...(fault.native14?{format:'native-schema-host-release/v1',backup:nativeBackup()} : fault.upgrade?{format:'product-schema-host-release/v1'}:{}),
  source:{...source,...(fault.sameNative14?formal50:fault.product49||fault.native14?formal49:formal)},target:{...target,...(fault.sameNative14||fault.native14?formal50:fault.upgrade||fault.product49?formal49:formal)}})
 if(fault.reader||fault.producer||fault.trace){
  const source={...releasePlan.source,...formal50,schemaHash:SCHEMA14},target={...releasePlan.target,...formal50,runtime:'3.7.0',schemaHash:SCHEMA14,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.7.0/fixture',productVersion:51,migrations:[...formal50.migrations,MIGRATION51]};
  if(fault.producer||fault.trace)Object.assign(source,{...target,sha});
  const raw=(commit,node)=>JSON.stringify({config:{Env:['NODE_VERSION='+node,'LINGXILOOP_COMMIT_SHA='+commit],Cmd:['node']}}),imageConfigs={source:raw(sha,'22.23.4'),target:raw(next,'22.23.5')};
  source.image={...source.image,configDigest:'sha256:'+createHash('sha256').update(imageConfigs.source).digest('hex')};target.image={...target.image,configDigest:'sha256:'+createHash('sha256').update(imageConfigs.target).digest('hex')};
  if(fault.trace)Object.assign(target,{runtime:'3.8.0',productVersion:52,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.0/fixture',migrations:[...source.migrations,traceMigration]});
  releasePlan=sealHostPlan({...releasePlan,format:fault.trace?traceFormat:fault.reader?READER_FORMAT:PRODUCER_FORMAT,source,target,imageConfigs,publicText:{source:fault.reader?null:{reader:2,producer:fault.trace?'purpose-json-v1':'disabled'},target:{reader:2,producer:fault.reader?'disabled':'purpose-json-v1'},sourceConfigurationSha256:fault.reader?null:hash,targetConfigurationSha256:hash,sourceContainers:fault.producer||fault.trace?['lingxiloop-app-a','lingxiloop-app-b'].flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),imageId:'sha256:'+'c'.repeat(64)}))):null}});
 }
 const trace=[],events=[],rows=apps.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,server:i?'shanghai-b':'shanghai-a',service,id:String(i*2+j+1).repeat(64),source:sha,imageId:digest,running:true,restarting:false,restartCount:0,pid:1,healthy:true,policy:{readOnly:service==='worker'}})))
 let staged=0,deployed=0,stops=0,targetInspections=0,stateReads=0,migrated=false
 const ops={
  async assertIdle(){trace.push('idle');if(fault.idle)throw Error('idle')},
  async inspect(){trace.push('inspect');if(fault.replacedTarget&&deployed===1&&++targetInspections===2)rows[0].id='e'+rows[0].id.slice(1);return structuredClone(rows)},
  async state(){trace.push('state');if(++stateReads>fault.stateUnknownAfter||migrated&&fault.migrationStateUnknown)throw Object.assign(Error('unknown state'),{uncertain:true});const s=state(migrated?releasePlan.target:releasePlan.source);s.installedSchema=s.schema;if(fault.native14)s.otherClients=stops===4?0:4;if(fault.otherClients&&stops===4)s.otherClients=1;if(fault.busy&&stops===2)s.liveWork=1;if(fault.schema&&deployed)s.schemaHash='e'.repeat(64);return s},
  async verifyImages(which='target'){trace.push('images:'+which);if(fault.image&&which==='target')throw Error('missing image')},
  async stage(stack){trace.push('stage:'+stack);staged++;if(fault.stage&&staged===2)throw Object.assign(Error('unknown'),{uncertain:true})},
  async metadata(stack){trace.push('metadata:'+stack);return {...releasePlan.target,...((fault.reader||fault.producer||fault.trace)?{publicText:2,deployment:{...releasePlan.publicText.target,...(fault.producerLeak?{producer:'purpose-json-v1'}:{})},configurationSha256:hash,modelOptions:fault.producer||fault.trace?{publicTextProtocol:'purpose-json-v1'}:{},...(fault.trace?{runTrace:1}:{})}:{}),...(fault.metadata&&stack===apps[1]?{schema:releasePlan.target.schema+1}:{})}},
  async seedPrecheck(){trace.push('seed');if(fault.seedUnknown)throw Object.assign(Error('unknown seed'),{uncertain:true});if(fault.seed)throw Error('seed drift');return {equal:true}},
  async backup(){trace.push('backup');if(fault.backupUnknown)throw Object.assign(Error('backup unknown'),{uncertain:true});return {...backupReceipt(),...(fault.badBackup?{isolatedDatabaseRemoved:false}:{})}},
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
 for(const change of [p=>p.source.runtime='3.6.0',p=>p.target.runtime='3.8.1',p=>p.target.productVersion=51,p=>p.target.schema=15,p=>p.target.protocol=12,p=>p.target.schemaHash='0'.repeat(64),p=>p.target.migrations[3].checksum='0'.repeat(64),p=>p.target.migrations[50].checksum='0'.repeat(64),p=>p.target.migrations[51].checksum='0'.repeat(64),p=>p.publicText.source.producer='disabled',p=>p.publicText.target.producer='disabled',p=>p.publicText.sourceContainers.pop(),p=>p.format=PRODUCER_FORMAT,p=>p.format=READER_FORMAT,p=>p.format='same-schema-host-release/v1']){
  const bad=structuredClone(f.plan);change(bad);assert.throws(()=>validateHostPlanShape(sealHostPlan(bad)));
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
