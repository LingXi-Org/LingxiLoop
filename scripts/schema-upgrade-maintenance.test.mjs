import assert from 'node:assert/strict'
import test from 'node:test'
import {sealPlan, assertOrdinarySchema, assertBarrier, recoveryBoundary, runMaintenance, parseMarker, createTransport} from './schema-upgrade-maintenance.mjs'
const sha='a'.repeat(40),targetSha='b'.repeat(40),hash='c'.repeat(64)
const source={sha,productVersion:46,runtime:{runtime:'3.5.6',schema:12,protocol:11,schemaHash:hash},migrations:[]}
const target={sha:targetSha,runtime:'3.6.0',schema:13,protocol:11,schemaHash:hash,productVersion:48,imageDigest:`sha256:${hash}`,migrations:[{version:47,name:'memory_continuity',checksum:hash},{version:48,name:'synthetic',checksum:hash}]}
const plan=sealPlan({format:1,source,target,backup:{source,attempt:'fixture',commandHash:hash},createdAt:'2026-10-20T00:00:00.000Z'})
const snapshot=(active=true)=>['a','b'].flatMap(side=>['lingxiloop','worker'].map(service=>({stack:`lingxiloop-app-${side}`,server:`shanghai-${side}`,service,id:`${side}-${service}`,name:`${side}-${service}`,source:sha,imageId:`sha256:${hash}`,running:active,pid:active?123:0,restarting:false,restartCount:0})))
const state=(schema=12,product=46)=>({schema,product,count:product,installedSchema:schema,runtime:schema===12?'3.5.6':'3.6.0',protocol:11,schemaHash:hash,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,otherClients:0,prepared:0,queued:2,pendingCapture:1,migrations:schema===13?target.migrations:[]})
function fixture(fault={}) {
 const trace=[], events=[];let current=state(),rows=snapshot(),reads=0
 const ops={
  async assertIdle(){trace.push('idle')},
  async inspect(){trace.push('inspect');return structuredClone(rows)},
  async pull(stack){trace.push(`pull:${stack}`);if(fault.pull)throw Error('fixture')},
  async verifyImages(){trace.push('images');if(fault.image)throw Error('fixture')},
  async metadata(){trace.push('metadata');return {...target,...fault.metadata}},
  async state(){trace.push('state');reads++;return {...current,...(fault.busy?{liveSession:1}:{})}},
  async stop(stack,service){trace.push(`stop:${stack}:${service}`);if(fault.stopUnknown)throw Object.assign(Error('fixture'),{uncertain:true});if(!fault.stillRunning)rows=rows.map(x=>x.stack===stack&&x.service===service?{...x,running:false,pid:0}:x)},
  async migrate(){trace.push('migrate');if(fault.migrateUnknown)throw Object.assign(Error('fixture'),{uncertain:true});current=state(13,fault.partial47?47:48);if(fault.partial47)throw Error('failed48')},
  async deploy(stack,service){trace.push(`deploy:${stack}:${service}`)},
  async verifyHealthy(stack,service){trace.push(`healthy:${stack}:${service}`)},
  async wait(){trace.push('wait')},
 }
 const backup=async()=>{trace.push('backup');return {status:'Complete',success:!fault.backup,source,commandHash:hash,isolatedDatabaseRemoved:true,restoreCountsEqual:true,restoreProvenanceEqual:true,dumpSha256:hash}}
 return {ops,trace,events,backup,run:()=>runMaintenance({plan,ops,backup,onProgress:async x=>events.push(x)})}
}
test('ordinary release blocks12→13 and unknown/inconsistent state, leaves13→13 alone',()=>{
 assert.throws(()=>assertOrdinarySchema(state(),{schema:13}),/maintenance/)
 assert.doesNotThrow(()=>assertOrdinarySchema(state(13,48),{schema:13}))
 assert.throws(()=>assertOrdinarySchema({...state(),installedSchema:13},{schema:12}))
 assert.throws(()=>assertOrdinarySchema(state(),{}))
})
test('barrier requires actual read-only/full visibility and every lease/client class zero',()=>{
 assert.doesNotThrow(()=>assertBarrier(state()))
 for(const key of ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','otherClients','prepared'])assert.throws(()=>assertBarrier({...state(),[key]:1}),key)
 for(const key of ['readOnly','fullVisibility'])assert.throws(()=>assertBarrier({...state(),[key]:false}),key)
 assert.throws(()=>assertBarrier({...state(),otherClients:undefined}))
})
test('happy path pulls before stopping, Workers before Web, backup after barrier, one migration then staged recovery',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.status,'complete')
 const t=f.trace;assert.ok(t.indexOf('images')<t.findIndex(x=>x.startsWith('stop:')))
 assert.deepEqual(t.filter(x=>x.startsWith('stop:')),['stop:lingxiloop-app-a:worker','stop:lingxiloop-app-b:worker','stop:lingxiloop-app-a:lingxiloop','stop:lingxiloop-app-b:lingxiloop'])
 assert.ok(t.indexOf('backup')>t.indexOf('wait'));assert.equal(t.filter(x=>x==='migrate').length,1)
 assert.deepEqual(t.filter(x=>x.startsWith('deploy:')),['deploy:lingxiloop-app-a:lingxiloop','deploy:lingxiloop-app-b:lingxiloop','deploy:lingxiloop-app-a:worker','deploy:lingxiloop-app-b:worker'])
 assert.equal(t.some(x=>x.startsWith('start:')),false)
})
test('pull or image mismatch never stops service',async()=>{
 for(const fault of [{pull:true},{image:true},{metadata:{schemaHash:'d'.repeat(64)}}]){const f=fixture(fault);await assert.rejects(f.run());assert.equal(f.trace.some(x=>x.startsWith('stop:')),false)}
})
test('accepted stop, uncertain stop, live leases, failed backup all prohibit migration',async()=>{
 for(const fault of [{stillRunning:true},{stopUnknown:true},{busy:true},{backup:true}]){const f=fixture(fault);await assert.rejects(f.run());assert.equal(f.trace.includes('migrate'),false);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)}
})
test('unknown migration outcome is not retried and never starts/deploys old or new services',async()=>{
 const f=fixture({migrateUnknown:true});await assert.rejects(f.run());assert.equal(f.trace.filter(x=>x==='migrate').length,1);assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false);assert.equal(f.events.at(-1).status,'uncertain')
})
test('47 committed then48 failure reports fix-forward, not rollback',async()=>{
 const f=fixture({partial47:true});await assert.rejects(f.run());assert.equal(f.events.at(-1).recovery,'fix-forward');assert.equal(f.trace.some(x=>x.startsWith('deploy:')),false)
 assert.equal(recoveryBoundary(state(13,48),source),'fix-forward');assert.equal(recoveryBoundary(state(),source),'source-unchanged');assert.equal(recoveryBoundary(null,source),'unknown')
})
test('markers require one exact receipt and successful complete update; raw secret-like logs never enter errors',()=>{
 const update={status:'Complete',success:true,logs:[{stdout:'secret example\nSCHEMA_UPGRADE_STATE={"schema":13}\n'}]}
 assert.deepEqual(parseMarker(update,'STATE'),{schema:13})
 for(const x of [{...update,status:'InProgress'},{...update,success:false},{...update,logs:[{stdout:'SCHEMA_UPGRADE_STATE={}\nSCHEMA_UPGRADE_STATE={}'}]}])assert.throws(()=>parseMarker(x,'STATE'),e=>!e.message.includes('secret example'))
})
test('transport does not retry unknown execute and polls only its returned update id',async()=>{
 let calls=0;const t=createTransport({apiKey:'fixture',apiSecret:'fixture',fetcher:async()=>{calls++;if(calls===1)return new Response(JSON.stringify({_id:{$oid:'d'.repeat(24)}}));throw Error('secret key must not escape')}})
 await assert.rejects(t.execute('PullStack',{stack:'lingxiloop-app-a',services:['worker']}),e=>e.uncertain===true&&!e.message.includes('secret key'));assert.equal(calls,2)
})

test('transport rejects receipt identity drift and refuses unlisted mutations',async()=>{
 const id='d'.repeat(24),sid='e'.repeat(24);let calls=0
 const t=createTransport({apiKey:'fixture',apiSecret:'fixture',wait:async()=>{},fetcher:async url=>{
 calls++;return new Response(JSON.stringify(url.includes('GetStack')?{_id:{$oid:sid}}:url.includes('/execute/')?{_id:{$oid:id},operation:'StopStackService',target:{type:'Stack',id:sid},status:'InProgress'}:{_id:{$oid:'f'.repeat(24)},operation:'StopStackService',target:{type:'Stack',id:sid},status:'Complete',success:true}))}})
 await assert.rejects(t.execute('StopStack',{stack:'lingxiloop-app-a',services:['worker'],stop_time:150}),e=>e.uncertain===true);assert.equal(calls,3)
 const before=calls;await assert.rejects(t.execute('StartStack',{stack:'lingxiloop-app-a'}));assert.equal(calls,before)
})
test('ordinary trigger performs schema guard before config writes, historical drain and webhook',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('./trigger-komodo-rollout.mjs',import.meta.url),'utf8')
 const gate=source.indexOf('await preflightOrdinaryRollout(');assert.ok(gate>=0)
 for(const later of ['await syncKomodoConfig(','await prepareForumRollout(','await fetch(url,'])assert.ok(gate<source.indexOf(later))
})
test('maintenance scripts have an owning deployment contract in CI',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8')
 assert.ok(source.includes("- 'scripts/schema-upgrade-*.mjs'"));assert.match(source,/run: node --test [^\n]*scripts\/schema-upgrade-maintenance\.test\.mjs/)
})
test('offline package check rejects a candidate relabelled3.5.6/schema13',async()=>{
 const {assertInstalledTarget}=await import('./schema-upgrade-maintenance.mjs')
 await assert.rejects(assertInstalledTarget({runtime:'3.5.6',schema:13,protocol:11,schemaHash:'f'.repeat(64)}))
})
test('real operations fail closed on a running procedure or retrying migration container',async()=>{
 const {createOperations}=await import('./schema-upgrade-komodo.mjs')
 for(const hazard of ['procedure','migration']){
  let mutations=0;const reads=[]
  const transport={async read(op,p){reads.push(op)
   if(op==='ListServers')return ['a','b'].map(x=>({id:x.repeat(24),name:'shanghai-'+x,info:{state:'Ok'}}))
   if(op==='GetProcedureActionState')return {running:hazard==='procedure'}
   if(op==='GetStackActionState')return Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(k=>[k,false]))
   if(op==='GetStack')return {config:{server_id:p.stack.endsWith('-a')?'a'.repeat(24):'b'.repeat(24),repo:'LingXi-Org/LingxiLoop',branch:'main',run_directory:`deploy/komodo/${p.stack}`,auto_update:false,auto_update_all_services:false,commit:sha}}
   if(op==='ListStackServices')return [{service:'db-migrate',container:{id:'a'.repeat(64)}}]
   if(op==='InspectContainer')return {State:{Running:hazard==='migration',Restarting:false}}
   throw Error('unexpected read')
  },async execute(){mutations++}}
  await assert.rejects(createOperations({plan:{pinCommit:sha},transport}).assertIdle());assert.equal(mutations,0);if(hazard==='migration')assert.ok(reads.includes('InspectContainer'))
 }
})
test('pin and restore payloads contain only the actual stack id and commit',async()=>{
 const {releasePinPayload}=await import('./schema-upgrade-komodo.mjs')
 assert.deepEqual(releasePinPayload('d'.repeat(24),sha),{id:'d'.repeat(24),config:{commit:sha}})
 assert.deepEqual(releasePinPayload('d'.repeat(24),''),{id:'d'.repeat(24),config:{commit:''}})
 assert.throws(()=>releasePinPayload('lingxiloop-app-a',sha));assert.throws(()=>releasePinPayload('d'.repeat(24),'main'))
})
test('SQL state receipts accept only fixed metadata fields and numeric aggregates',async()=>{
 const {validateStateReceipt}=await import('./schema-upgrade-komodo.mjs')
 assert.deepEqual(validateStateReceipt(state()),state())
 for(const value of [{...state(),body:'synthetic memory'}, {...state(),otherClients:'0'}, {...state(),runtime:'secret response text'}, {...state(),migrations:[{version:47,name:'bad text',checksum:hash}]}])assert.throws(()=>validateStateReceipt(value),e=>!e.message.includes('synthetic memory'))
})
test('real App manifests with repeated equal pins reach metadata and preserve same-schema ordinary rollout',async()=>{
 const {readFile}=await import('node:fs/promises')
 const {preflightOrdinaryRollout}=await import('./schema-upgrade-komodo.mjs')
 const source=await readFile(new URL('../deploy/komodo/lingxiloop-app-a/compose.yml',import.meta.url),'utf8')
 const tags=[...source.matchAll(/image: accel\.way2api\.fun\/ghcr\.io\/lingxi-org\/lingxiloop-server:([a-f0-9]{40})/g)].map(x=>x[1])
 assert.equal(tags.length,2);assert.equal(new Set(tags).size,1)
 for(const schema of [12,13]){
  const executes=[]
  const transport={async read(op,p){
   if(op==='GetProcedureActionState')return {running:false}
   if(op==='ListServers')return ['a','b'].map(x=>({id:x.repeat(24),name:'shanghai-'+x,info:{state:'Ok'}}))
   if(op==='GetStackActionState')return Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(k=>[k,false]))
   if(op==='GetStack')return {config:{server_id:p.stack.endsWith('-a')?'a'.repeat(24):'b'.repeat(24),repo:'LingXi-Org/LingxiLoop',branch:'main',run_directory:`deploy/komodo/${p.stack}`,auto_update:false,auto_update_all_services:false,commit:''}}
   if(op==='ListStackServices')return []
   throw Error('unexpected fixture read')
  },async execute(op,p){
   executes.push(op);assert.equal(op,'RunStackService')
   const metadata=p.service==='db-migrate',name=metadata?'METADATA':'STATE'
   return {status:'Complete',success:true,logs:[{stdout:`SCHEMA_UPGRADE_${name}=`+JSON.stringify(metadata?{sha:tags[0],schema:13}:state(schema,schema===12?46:48))}]}
  }}
  if(schema===12)await assert.rejects(preflightOrdinaryRollout({transport}),/maintenance/)
  else assert.deepEqual(await preflightOrdinaryRollout({transport}),{sourceSchema:13,targetSchema:13,targetSha:tags[0]})
  assert.deepEqual(executes,['RunStackService','RunStackService'])
 }
})
test('effective Compose parser accepts actual inherited pins and rejects stale overrides before planning',async()=>{
 const {readFile}=await import('node:fs/promises')
 const {assertEffectiveComposePin}=await import('./schema-upgrade-compose.mjs')
 for(const side of ['a','b']){
  const source=await readFile(new URL(`../deploy/komodo/lingxiloop-app-${side}/compose.yml`,import.meta.url),'utf8')
  const pinned=source.replace(/(image: accel\.way2api\.fun\/ghcr\.io\/lingxi-org\/lingxiloop-server:)[a-f0-9]{40}/g,`$1${targetSha}`)
  assert.equal(assertEffectiveComposePin(pinned,targetSha),targetSha)
  // Change only the anchor: actual Compose resolves Web/migrator new, Worker old.
  const mixed=source.replace(/(image: accel\.way2api\.fun\/ghcr\.io\/lingxi-org\/lingxiloop-server:)[a-f0-9]{40}/,`$1${targetSha}`)
  assert.throws(()=>assertEffectiveComposePin(mixed,targetSha),/pin/)
  assert.throws(()=>assertEffectiveComposePin(pinned,sha),/pin/)
  for(const invalid of [
   pinned.replace('  worker:\n','  other-worker:\n'),
   pinned.replaceAll(targetSha,'latest'),
   pinned.replaceAll(targetSha,'${UNTRUSTED_IMAGE_TAG}'),
   pinned.replace('services:\n','services: [\n'),
  ])assert.throws(()=>assertEffectiveComposePin(invalid),/Compose|pin/)
 }
})
test('ordinary gate and manifest-commit plan use the same effective-service pin validation',async()=>{
 const {readFile}=await import('node:fs/promises')
 const ordinary=await readFile(new URL('./schema-upgrade-komodo.mjs',import.meta.url),'utf8')
 const maintenance=await readFile(new URL('./schema-upgrade-maintenance.mjs',import.meta.url),'utf8')
 assert.match(ordinary,/assertEffectiveComposePin\(source\)/)
 assert.match(maintenance,/assertEffectiveComposePin\(compose,plan\.target\.sha\)/)
})
test('service requests accept only the exact Komodo2.3.3 service operation at acceptance and completion',async()=>{
 const id='d'.repeat(24),sid='e'.repeat(24)
 for(const op of ['PullStack','StopStack','DeployStack']){
  for(const receiptOperation of [op+'Service',op,'RunStackService']){
   let executes=0,polls=0
   const t=createTransport({apiKey:'fixture',apiSecret:'fixture',wait:async()=>{},fetcher:async url=>{
    if(url.includes('GetStack'))return Response.json({_id:{$oid:sid}})
    const submit=url.includes('/execute/');if(submit)executes++;else polls++
    return Response.json({_id:{$oid:id},operation:receiptOperation,target:{type:'Stack',id:sid},status:submit?'InProgress':'Complete',success:!submit?true:undefined})
   }})
   const request={stack:'lingxiloop-app-a',services:['worker'],...(op==='StopStack'?{stop_time:150}:{})}
   if(receiptOperation===op+'Service'){await t.execute(op,request);assert.equal(polls,1)}
   else {await assert.rejects(t.execute(op,request),e=>e.uncertain===true);assert.equal(polls,0)}
   assert.equal(executes,1)
  }
 }
})
test('service receipt mapping keeps stack target and polled operation identity strict; one-off enum unchanged',async()=>{
 const id='d'.repeat(24),sid='e'.repeat(24)
 for(const op of ['PullStack','StopStack','DeployStack','RunStackService']){
  const params=op==='RunStackService'?{stack:'lingxiloop-app-a',service:'db-migrate',no_deps:true,detach:false,service_ports:false,no_tty:true,pull:false}:{stack:'lingxiloop-app-a',services:['worker'],...(op==='StopStack'?{stop_time:150}:{})}
  for(const fault of ['none','target','polled-operation']){
   let executes=0,polls=0
   const t=createTransport({apiKey:'fixture',apiSecret:'fixture',wait:async()=>{},fetcher:async url=>{
    if(url.includes('GetStack'))return Response.json({_id:{$oid:sid}})
    const submit=url.includes('/execute/');if(submit)executes++;else polls++
    return Response.json({_id:{$oid:id},operation:!submit&&fault==='polled-operation'?'StartStackService':op==='RunStackService'?op:op+'Service',target:{type:'Stack',id:fault==='target'?'f'.repeat(24):sid},status:submit?'InProgress':'Complete',success:!submit?true:undefined})
   }})
   if(fault==='none')await t.execute(op,params)
   else await assert.rejects(t.execute(op,params),e=>e.uncertain===true)
   assert.equal(executes,1);assert.equal(polls,fault==='target'?0:1)
  }
 }
})
test('generated metadata inventory escaping accepts SQL names and rejects lookalikes and gaps',async()=>{
 const {METADATA_CODE}=await import('./schema-upgrade-komodo.mjs')
 const expression=METADATA_CODE.match(/if\(names\.some[\s\S]*?throw Error\('inventory'\);/)?.[0];assert.ok(expression)
 const validate=new Function('names',expression)
 assert.doesNotThrow(()=>validate(['0001_baseline.sql','0002_next.sql']))
 for(const names of [['0001_baselinesql'],['0001_baselineXsql'],['0002_baseline.sql'],['0001_baseline.sql.tmp'],['0001_path/evil.sql']])assert.throws(()=>validate(names),/inventory/)
})
