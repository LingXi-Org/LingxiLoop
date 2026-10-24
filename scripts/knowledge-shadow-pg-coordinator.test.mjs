import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import test from 'node:test'
const code=readFileSync(new URL('knowledge-shadow-pg-gate.mjs',import.meta.url),'utf8')
const hash=v=>createHash('sha256').update(v).digest('hex')
const ids={update:'a'.repeat(24),stack:'b'.repeat(24),own:'c'.repeat(64),old:'d'.repeat(64),foreign:'e'.repeat(64),knowledge:'f'.repeat(64)}
const expected={pgImageId:'sha256:'+'1'.repeat(64),pgEntrypoint:['docker-entrypoint.sh'],knowledgeImageId:'sha256:'+'2'.repeat(64),healthcheckSha256:'3'.repeat(64),targetDatabase:'synthetic_pro_generation',baseUrl:'http://synthetic-web/internal/open-notebook/v1/shadow'}
const config={format:'rag-shadow-pg-config/v1',mode:'gate',namespace:'open_notebook',source_database:'open_notebook',company_ids:['private-company'],source_ids:['source:private'],notebook_ids:['notebook:private'],rag_inventory_sha256:'4'.repeat(64),binding_manifest_sha256:'5'.repeat(64),plan_sha256:'6'.repeat(64),verification_sha256:'7'.repeat(64)}
const lockScope=hash(JSON.stringify(['knowledge_source_jobs','knowledge_sources','knowledge_notebook_bindings','organization_case_notebooks','organization_cases','projects'].sort()))
const pause=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('synthetic-aborted'))},{once:true})})
function fixture(scenario){
  const start=Date.now(),offset=scenario==='buffered-ready'?2000:0,deadline=start+80000+offset,calls={submit:0,finish:0,start:0,abort:0,logs:[],reads:[],registered:[]};let params,finishedWait=false,readyTime
  const stamp=n=>new Date(n).toISOString()
  const pgIdentity={pg_backend_pid:101,pg_backend_start:stamp(start+offset-100),pg_transaction_start:stamp(start+offset),database_oid:5}
  function heartbeat(sequence){
    const observed=start+(sequence-1)*1000+offset
    return {format:'rag-shadow-pg-observation/v1',status:'held',sequence,binding_manifest_sha256:config.binding_manifest_sha256,rag_inventory_sha256:config.rag_inventory_sha256,plan_sha256:config.plan_sha256,verification_sha256:config.verification_sha256,lock_mode:'ShareLock',lock_scope_sha256:lockScope,companies:1,sources:1,notebooks:1,projects:1,cases:0,jobs:1,...pgIdentity,
      ...(scenario==='changed-backend'&&sequence>=3?{pg_backend_pid:999}:{}),observed_at:stamp(observed),deadline_at:stamp(deadline),held_lock_count:8,relation_lock_count:6,advisory_lock_count:2,relation_oids:[101,102,103,104,105,106]}
  }
  const final=()=>({format:'rag-shadow-pg-observation/v1',status:'rolled-back',reason:'deadline',...pgIdentity,released:scenario!=='bad-final',held_lock_operation:true})
  function native(){
    const ended=Date.now()>=deadline||(scenario==='ended'&&Date.now()>=start+2500)
    return {_id:{$oid:ids.update},operation:'RunStackService',target:{type:'Stack',id:scenario==='fresh-final-drift'&&finishedWait?'0'.repeat(24):ids.stack},status:ended?'Complete':scenario==='queued'&&Date.now()<start+800?'Queued':'InProgress',success:ended?!['native-known-failed','native-return-failed','native-denied'].includes(scenario):undefined,start_ts:start,...ended?{end_ts:deadline,logs:[{stdout:Array.from({length:80},(_,i)=>JSON.stringify(heartbeat(i+1))).concat(JSON.stringify(final())).join('\n'),stderr:''}]}:{}}
  }
  function inspect(container){return {Id:container,Image:container===ids.foreign?'sha256:'+'9'.repeat(64):expected.pgImageId,Created:stamp(start),RestartCount:0,State:{Running:true,Paused:false,Restarting:false,Dead:false,OOMKilled:false,Status:'running',StartedAt:stamp(start)},Config:{Cmd:params.command,Entrypoint:expected.pgEntrypoint,Env:['PRIVATE_COORDINATOR_SENTINEL'],Labels:{'com.docker.compose.project':'lingxiloop-app-a','com.docker.compose.service':'db-migrate','com.docker.compose.oneoff':'True'}}}}
  const operator={receipt:{startedAt:stamp(start),pgImageId:expected.pgImageId,pgEntrypoint:expected.pgEntrypoint},
    async idle(){},
    async submit(operation,p){calls.submit++;assert.equal(operation,'RunStackService');params=p;if(scenario==='initial-window')await pause(36000);return {update:native(),expected:{id:ids.update,operation,stack:'lingxiloop-app-a',stackId:ids.stack},params:p,oldContainerIds:new Set([ids.old]),submittedAt:Date.now()}},
    async registerHeartbeat(handle,container){calls.registered.push(container);assert.equal(container,ids.own);return {updateId:ids.update,container,imageId:expected.pgImageId,commandSha256:hash(JSON.stringify({entrypoint:expected.pgEntrypoint,command:params.command}))}},
    async read(operation,args){calls.reads.push(operation)
      if(operation==='GetUpdate'){if(finishedWait)calls.finalReads=(calls.finalReads??0)+1;return native()}
      if(operation==='ListContainers')return scenario==='too-many'?Array.from({length:9},(_,i)=>({id:hash('candidate'+i),name:'lingxiloop-app-a-db-migrate-run-'+i})):[{id:ids.old,name:'lingxiloop-app-a-db-migrate-run-old'},{id:ids.foreign,name:'lingxiloop-app-a-db-migrate-run-foreign'},{id:ids.own,name:'lingxiloop-app-a-db-migrate-run-own'}]
      if(operation==='InspectContainer')return inspect(args.container)
      if(operation==='GetContainerLog'){
        calls.logs.push(args.container);assert.equal(args.container,ids.own,'foreign log read forbidden')
        if(scenario==='starting'&&Date.now()<start+800)return {stdout:'',stderr:''}
        let sequence=Math.min(80,Math.floor((Date.now()-start)/1000)+1)
        if(scenario==='stale')sequence=1
        if(scenario==='no-post-ready'&&readyTime)sequence=Math.floor((readyTime-start)/1000)+1
        if(scenario==='buffered-ready'){
          if(!readyTime)sequence=Math.min(3,sequence)
          else if(Date.now()<readyTime+1500)sequence=4
          if(readyTime&&calls.postReadyFirstLogSeq===undefined)calls.postReadyFirstLogSeq=sequence
        }
        return {stdout:JSON.stringify(heartbeat(sequence))+'\n',stderr:''}
      }
      throw Error('Unexpected synthetic read')
    },
    async wait(handle,timeout){assert.ok(timeout>0&&timeout<=100000);while(Date.now()<deadline)await pause(100);const result=native();finishedWait=true;if(scenario==='native-known-failed'||scenario==='native-threw-success')throw Error('PRIVATE_COORDINATOR_SENTINEL');if(scenario==='native-denied')throw Object.assign(Error('PRIVATE_COORDINATOR_SENTINEL'),{httpStatus:403});return result}
  }
  const callbacks={
    async finish(gate,context){calls.finish++;assert.equal(gate.complete,true);assert.equal(gate.action,'product-lock');assert.equal(gate.result.komodo_update_id,ids.update);assert.equal(context.gateSha256,hash(context.gateBytes));assert.equal(context.gateBytes,JSON.stringify(gate));context.assertLive();await pause(['stale','ended','changed-backend'].includes(scenario)?10000:1500,context.signal);context.assertLive();if(scenario==='unknown-finish')throw Object.assign(Error('PRIVATE_COORDINATOR_SENTINEL'),{uncertain:true,coordinatorCode:'PRIVATE_COORDINATOR_SENTINEL'});return {complete:true,action:'finish',result:{phase:'active',revision:2,product_gate_sha256:context.gateSha256,verification_sha256:config.verification_sha256,active_database:expected.targetDatabase}}},
    async startAndVerify(context){calls.start++;context.assertLive();await pause(2000,context.signal);readyTime=Date.now();return {complete:true,healthy:true,containerId:ids.knowledge,imageId:expected.knowledgeImageId,observedAt:stamp(readyTime),healthcheckSha256:expected.healthcheckSha256,readiness:{status:'ready',profile:'rag',schema_version:1,embedding_model_id:'Pro/BAAI/bge-m3',embedding_dimensions:1024,embedding_probe:true,r2_probe:true,active_generation:{active_database:expected.targetDatabase,revision:scenario==='wrong-ready'?99:2,plan_sha256:config.plan_sha256,verification_sha256:config.verification_sha256,model:'Pro/BAAI/bge-m3',base_url:expected.baseUrl,product_gate_sha256:context.gateSha256}}}},
    async abort(){calls.abort++}
  }
  return {operator,callbacks,calls,pgCode:code,config,expected}
}
async function exercise(t,scenario='ok',change){
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:new Date('2026-10-22T00:00:00Z')})
  const module=await import('./knowledge-shadow-pg-coordinator.mjs'),input=fixture(scenario)
  if(change)change(input)
  let settled=false,result,error
  const promise=module.coordinatePgGate(input).then(r=>{result=r;settled=true},e=>{error=e;settled=true})
  for(let tick=0;tick<1200&&!settled;tick++){t.mock.timers.tick(100);await new Promise(setImmediate)}
  assert.equal(settled,true,'coordinator did not terminate within bounded synthetic time');await promise
  if(error)assert.doesNotMatch(error.message+JSON.stringify(error.receipt),/PRIVATE_COORDINATOR_SENTINEL|source:private|notebook:private|private-company/)
  return {...input,result,error}
}
test('same-handle success proves exact gate, existing KB identity, post-ready same-transaction heartbeat and fresh native release',async t=>{
  const r=await exercise(t)
  assert.ifError(r.error);assert.equal(r.result.complete,true);assert.equal(r.calls.submit,1);assert.equal(r.calls.finish,1);assert.equal(r.calls.start,1);assert.equal(r.calls.abort,0)
  assert.ok(r.calls.logs.every(id=>id===ids.own));assert.ok(r.result.observations.length>=75)
  assert.equal(r.result.ready.containerId,ids.knowledge);assert.ok(Date.parse(r.result.postReady.observed_at)>=Date.parse(r.result.ready.observedAt))
  assert.equal(r.result.final.released,true);assert.equal(r.result.native.success,true)
})
test('a known new one-off may finish bounded startup before its first held heartbeat',async t=>{const r=await exercise(t,'starting');assert.ifError(r.error);assert.equal(r.result.complete,true);assert.equal(r.calls.submit,1)})
test('queued native startup is observed read-only before registration and callbacks',async t=>{const r=await exercise(t,'queued');assert.ifError(r.error);assert.equal(r.result.complete,true);assert.equal(r.calls.submit,1)})
test('positive PG clock skew and buffered post-ready log require a later causal sequence',async t=>{const r=await exercise(t,'buffered-ready');assert.ifError(r.error);assert.equal(r.result.complete,true);assert.ok(r.result.postReady.sequence>r.calls.postReadyFirstLogSeq)})
for(const [name,change] of [['helper hash',r=>{r.pgCode+='\n'}],['extra gate config',r=>{r.config={...r.config,private_export:'canonical-base64/v1'}}],['wrong audit image',r=>{r.expected={...r.expected,pgImageId:'sha256:'+'8'.repeat(64)}}]])test(`invalid ${name} submits nothing`,async t=>{
  const r=await exercise(t,'ok',change);assert.ok(r.error);assert.equal(r.calls.submit,0);assert.equal(r.calls.finish,0)
})
for(const scenario of ['stale','ended','changed-backend'])test(`${scenario} while finish pending aborts callbacks without restart or replay`,async t=>{
  const r=await exercise(t,scenario);assert.ok(r.error);assert.equal(r.calls.submit,1);assert.equal(r.calls.finish,1);assert.equal(r.calls.start,0);assert.equal(r.calls.abort,1);assert.equal(r.error.noAutomaticRetry,true)
})
for(const scenario of ['too-many','initial-window','wrong-ready','no-post-ready','unknown-finish','bad-final','fresh-final-drift'])test(`${scenario} cannot produce completed cutover`,async t=>{
  const r=await exercise(t,scenario);assert.ok(r.error);assert.equal(r.calls.submit,1);assert.equal(r.calls.abort,1);assert.equal(r.error.noAutomaticRetry,true)
  if(scenario==='too-many')assert.equal(r.calls.logs.length,0)
})

for(const scenario of ['native-known-failed','native-return-failed'])test(`${scenario} retains a confirmed failed native outcome without treating it as missing observation`,async t=>{
 const r=await exercise(t,scenario);assert.ok(r.error);assert.equal(r.error.code,'native-failed');assert.equal(r.error.uncertain,false);assert.equal(r.error.noAutomaticRetry,true);assert.equal(r.error.receipt.native.success,false);assert.equal(r.calls.submit,1);assert.equal(r.calls.abort,1)
})
test('403 from final wait remains denied and does not trigger a terminal-read fallback',async t=>{
 const r=await exercise(t,'native-denied');assert.ok(r.error);assert.equal(r.error.httpStatus,403);assert.equal(r.error.code,'operation-denied');assert.equal(r.error.receipt.failure.httpStatus,403);assert.equal(r.calls.finalReads??0,0);assert.equal(r.error.noAutomaticRetry,true);assert.equal(r.calls.submit,1)
})

test('an unclassified wait error cannot be converted into success by reading a true terminal',async t=>{
 const r=await exercise(t,'native-threw-success');assert.ok(r.error);assert.equal(r.error.code,'observation-unavailable');assert.equal(r.error.uncertain,true);assert.equal(r.calls.submit,1)
})
