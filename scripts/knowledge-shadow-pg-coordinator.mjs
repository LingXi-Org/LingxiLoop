import {createHash} from 'node:crypto'
import {isDeepStrictEqual as equal} from 'node:util'

export const PG_HELPER_SHA256='2108163b757f6740e2a18a7143e42280a7d1655dffc0258c21e05268087d456b'
const TABLES=['knowledge_source_jobs','knowledge_sources','knowledge_notebook_bindings','organization_case_notebooks','organization_cases','projects'].sort()
const hash=value=>createHash('sha256').update(value).digest('hex'),LOCK_SCOPE=hash(JSON.stringify(TABLES))
const oid=/^[a-f0-9]{24}$/,cid=/^[a-f0-9]{64}$/,image=/^sha256:[a-f0-9]{64}$/,hex=/^[a-f0-9]{64}$/
const FRESH=5000,MIN_INITIAL=45000,MIN_REMAINING=10000
const safeText=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=512&&!/[\x00-\x1f\x7f]/.test(value)
const finiteTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const freeze=value=>{if(value&&typeof value==='object'&&(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype)){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
const INTERNAL=Symbol('fixed coordinator diagnostic')
const fixedError=code=>Object.assign(Error('PG coordinator refused: '+code),{coordinatorCode:code,[INTERNAL]:true})
const denied=error=>[401,403].includes(error?.httpStatus)
const diagnosticCode=(error,phase)=>denied(error)?'operation-denied':error?.[INTERNAL]?error.coordinatorCode:phase==='submit'?'submit-unresolved':phase.startsWith('callback')?'callback-unresolved':'observation-unavailable'
const fail=code=>{throw fixedError(code)}
const check=(value,code)=>{if(!value)fail(code)}
const delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(Error('stopped'));const stop=()=>{clearTimeout(timer);reject(Error('stopped'))},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},ms);signal?.addEventListener('abort',stop,{once:true})})
async function budget(promise,ms,signal){let timer,stop;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fixedError('observation-timeout')),ms);stop=()=>reject(fixedError('observation-stopped'));if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true})})])}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop)}}
const HELD_KEYS=['format','status','sequence','binding_manifest_sha256','rag_inventory_sha256','plan_sha256','verification_sha256','lock_mode','lock_scope_sha256','companies','sources','notebooks','projects','cases','jobs','pg_backend_pid','database_oid','pg_backend_start','pg_transaction_start','observed_at','deadline_at','held_lock_count','relation_lock_count','advisory_lock_count','relation_oids'].sort()
function parseLogs(logs){
  check(Array.isArray(logs)&&logs.length<=100,'log-shape')
  const rows=[];let size=0
  for(const log of logs){
    check(log&&typeof log.stdout==='string','log-shape');size+=Buffer.byteLength(log.stdout);check(size<=512*1024,'log-bound')
    for(const line of log.stdout.split('\n')){
      if(!line.trim().startsWith('{'))continue
      let row;try{row=JSON.parse(line)}catch{fail('log-json')}
      check(row?.format==='rag-shadow-pg-observation/v1'&&['held','rolled-back','failed'].includes(row.status),'unexpected-payload')
      rows.push(row)
    }
  }
  return rows
}
function validateConfig(config){
  const keys=['format','mode','namespace','source_database','company_ids','source_ids','notebook_ids','rag_inventory_sha256','binding_manifest_sha256','plan_sha256','verification_sha256'].sort()
  check(config&&equal(Object.keys(config).sort(),keys)&&config.format==='rag-shadow-pg-config/v1'&&config.mode==='gate','gate-config')
  check([config.namespace,config.source_database].every(v=>typeof v==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(v)),'gate-namespace')
  for(const [key,max,prefix] of [['company_ids',5,''],['source_ids',4,'source:'],['notebook_ids',5,'notebook:']]){
    const values=config[key];check(Array.isArray(values)&&values.length>0&&values.length<=max&&values.every(v=>safeText(v)&&v.startsWith(prefix))&&new Set(values).size===values.length,'gate-scope')
  }
  check(['rag_inventory_sha256','binding_manifest_sha256','plan_sha256','verification_sha256'].every(key=>hex.test(config[key])),'gate-hashes')
}
function validateExpected(expected,operator){
  check(expected&&equal(Object.keys(expected).sort(),['pgImageId','pgEntrypoint','knowledgeImageId','healthcheckSha256','targetDatabase','baseUrl'].sort()),'audit-expectations')
  check(image.test(expected.pgImageId)&&image.test(expected.knowledgeImageId)&&hex.test(expected.healthcheckSha256)&&Array.isArray(expected.pgEntrypoint)&&expected.pgEntrypoint.length<=16&&expected.pgEntrypoint.every(safeText),'audit-identities')
  check(equal(operator.receipt?.pgEntrypoint,expected.pgEntrypoint)&&operator.receipt?.pgImageId===expected.pgImageId,'operator-audit-binding')
  check(typeof expected.targetDatabase==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(expected.targetDatabase),'target-generation')
  let url;try{url=new URL(expected.baseUrl)}catch{fail('generation-endpoint')}
  check(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/internal/open-notebook/v1/shadow','generation-endpoint')
}

/**
 * Root supplies the already audited operator and callbacks. This function never
 * imports credentials, reads arbitrary logs, retries writes or recovers a pointer.
 * Every returned/thrown receipt contains projected aggregate evidence only.
 */
export async function coordinatePgGate({operator,pgCode,config,expected,callbacks}){
  const receipt={format:'rag-shadow-pg-coordinator/v1',startedAt:new Date().toISOString(),complete:false,pgHelperSha256:PG_HELPER_SHA256,observations:[],events:[]}
  let phase='validate',handle,submitted=false,submitStarted,proof,container,containerStarted,nativeStart,last,pgIdentity,monitorPromise,monitoring=false,watchdog,firstFault,abortCalled=false,observationCycle=0,completedCycle=0
  const controller=new AbortController(),monitorStop=new AbortController(),bySequence=new Map()
  let rejectFault;const faultPromise=new Promise((_,reject)=>{rejectFault=reject});faultPromise.catch(()=>{})
  const note=status=>receipt.events.push({phase,status,at:new Date().toISOString()})
  const signalFault=error=>{if(firstFault)return;firstFault=error?.[INTERNAL]?error:fixedError(diagnosticCode(error,phase));if(Number.isSafeInteger(error?.httpStatus))firstFault.httpStatus=error.httpStatus;controller.abort(firstFault);rejectFault(firstFault)}
  const live=()=>{
    if(firstFault)throw firstFault
    check(last,'heartbeat-missing')
    const age=Date.now()-Date.parse(last.observed_at),remaining=Date.parse(last.deadline_at)-Date.now()
    check(age>=-2000&&age<=FRESH,'heartbeat-stale');check(remaining>=MIN_REMAINING,'deadline-window')
    return last
  }
  const nativeIdentity=(u,status,allowFailed=false)=>{
    check(u?._id?.$oid===handle.expected.id&&u.operation==='RunStackService'&&u.target?.type==='Stack'&&u.target.id===handle.expected.stackId&&u.status===status,'native-identity')
    check(Number.isFinite(u.start_ts)&&u.start_ts>0,'native-time')
    if(nativeStart===undefined)nativeStart=u.start_ts
    check(u.start_ts===nativeStart,'native-time-drift')
    if(status==='Complete')check(typeof u.success==='boolean'&&(allowFailed||u.success===true)&&Number.isFinite(u.end_ts)&&u.end_ts>=u.start_ts,'native-complete')
    return u
  }
  const inspectIdentity=(c,id)=>{
    check(c?.Id===id&&c.Image===expected.pgImageId&&c.State?.Running===true&&c.State.Status==='running'&&!c.State.Paused&&!c.State.Restarting&&!c.State.Dead&&!c.State.OOMKilled&&c.RestartCount===0,'container-live-identity')
    check(equal(c.Config?.Cmd,handle.params.command)&&equal(c.Config?.Entrypoint,expected.pgEntrypoint)&&c.Config.Labels?.['com.docker.compose.project']==='lingxiloop-app-a'&&c.Config.Labels['com.docker.compose.service']==='db-migrate'&&c.Config.Labels['com.docker.compose.oneoff']==='True','container-command-identity')
    check(finiteTime(c.Created)&&Date.parse(c.Created)>=submitStarted-2000&&Date.parse(c.Created)<=Date.now()+2000&&finiteTime(c.State.StartedAt)&&Date.parse(c.State.StartedAt)>=Date.parse(c.Created)-2000,'container-time')
    return Date.parse(c.State.StartedAt)
  }
  const held=(row,historical=false)=>{
    check(row?.status==='held'&&equal(Object.keys(row).sort(),HELD_KEYS),'heartbeat-schema')
    check(row.binding_manifest_sha256===config.binding_manifest_sha256&&row.rag_inventory_sha256===config.rag_inventory_sha256&&row.plan_sha256===config.plan_sha256&&row.verification_sha256===config.verification_sha256&&row.lock_scope_sha256===LOCK_SCOPE&&row.lock_mode==='ShareLock','heartbeat-bindings')
    check(Number.isSafeInteger(row.sequence)&&row.sequence>=1&&row.sequence<=100&&row.companies===config.company_ids.length&&row.sources===config.source_ids.length&&row.notebooks===config.notebook_ids.length,'heartbeat-scope-counts')
    check(['projects','cases','jobs'].every(k=>Number.isSafeInteger(row[k])&&row[k]>=0&&row[k]<=128)&&row.relation_lock_count===6&&row.advisory_lock_count===row.projects+row.companies&&row.held_lock_count===6+row.advisory_lock_count,'heartbeat-lock-counts')
    check(Array.isArray(row.relation_oids)&&row.relation_oids.length===6&&row.relation_oids.every(v=>Number.isSafeInteger(v)&&v>0)&&new Set(row.relation_oids).size===6&&equal(row.relation_oids,[...row.relation_oids].sort((a,b)=>a-b)),'heartbeat-relation-oids')
    check(Number.isSafeInteger(row.pg_backend_pid)&&row.pg_backend_pid>0&&Number.isSafeInteger(row.database_oid)&&row.database_oid>0&&['pg_backend_start','pg_transaction_start','observed_at','deadline_at'].every(k=>finiteTime(row[k])),'heartbeat-pg-identity')
    const began=Date.parse(row.pg_transaction_start),observed=Date.parse(row.observed_at)
    check(began>=Date.parse(row.pg_backend_start)&&Date.parse(row.pg_backend_start)>=containerStarted-2000&&observed>=began&&observed<=Date.parse(row.deadline_at)&&Date.parse(row.deadline_at)-began===80000,'heartbeat-pg-time')
    const identity={pg_backend_pid:row.pg_backend_pid,pg_backend_start:row.pg_backend_start,pg_transaction_start:row.pg_transaction_start,database_oid:row.database_oid,deadline_at:row.deadline_at,relation_oids:row.relation_oids,projects:row.projects,companies:row.companies,cases:row.cases,jobs:row.jobs}
    if(!pgIdentity)pgIdentity=freeze(identity)
    check(equal(pgIdentity,identity),'heartbeat-pg-drift')
    if(!historical){const age=Date.now()-observed;check(age>=-2000&&age<=FRESH,'heartbeat-stale');check(!last||row.sequence>=last.sequence,'heartbeat-regression')}
    const existing=bySequence.get(row.sequence);check(!existing||equal(existing,row),'heartbeat-sequence-conflict')
    const copy=existing??freeze(JSON.parse(JSON.stringify(row)))
    if(!existing){bySequence.set(row.sequence,copy);receipt.observations.push(copy)}
    return copy
  }
  const read=(operation,args)=>budget(Promise.resolve().then(()=>operator.read(operation,args)),FRESH,monitorStop.signal)
  async function observe(startup=false){
    const cycle=++observationCycle
    nativeIdentity(await read('GetUpdate',{id:handle.expected.id}),'InProgress')
    const actual=await read('InspectContainer',{server:'shanghai-a',container});check(inspectIdentity(actual,container)===containerStarted,'container-start-drift')
    const log=await read('GetContainerLog',{server:'shanghai-a',container,tail:20,timestamps:false}),rows=parseLogs([log])
    if(startup&&rows.length===0){nativeIdentity(await read('GetUpdate',{id:handle.expected.id}),'InProgress');return null}
    check(rows.length>0&&rows.every(row=>row.status==='held'),'helper-ended')
    for(const row of rows){const copy=held(row,true);check(!last||copy.sequence>=last.sequence||bySequence.has(copy.sequence),'heartbeat-regression')}
    const newest=rows.at(-1);check(rows.every((row,index)=>!index||row.sequence>rows[index-1].sequence),'heartbeat-tail-order')
    const sample=held(newest)
    nativeIdentity(await read('GetUpdate',{id:handle.expected.id}),'InProgress')
    check(Date.now()-Date.parse(sample.observed_at)<=FRESH,'heartbeat-stale')
    last=sample;completedCycle=cycle;return sample
  }
  async function stopMonitor(){monitoring=false;monitorStop.abort();clearInterval(watchdog);if(monitorPromise)await monitorPromise}
  try{
    check(typeof pgCode==='string'&&hash(pgCode)===PG_HELPER_SHA256,'helper-hash')
    check(operator&&['read','submit','wait','registerHeartbeat','idle'].every(key=>typeof operator[key]==='function'),'operator-contract')
    check(callbacks&&['finish','startAndVerify','abort'].every(key=>typeof callbacks[key]==='function'),'callback-contract')
    config=freeze(JSON.parse(JSON.stringify(config)));expected=freeze(JSON.parse(JSON.stringify(expected)))
    validateConfig(config);validateExpected(expected,operator)
    receipt.configSha256=hash(JSON.stringify(config));receipt.expectedSha256=hash(JSON.stringify(expected))
    phase='idle';await operator.idle('lingxiloop-app-a')
    const params=freeze({stack:'lingxiloop-app-a',service:'db-migrate',command:['timeout','-k','5','90','node','--input-type=module','-e',pgCode,JSON.stringify(config)],no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false})
    phase='submit';submitStarted=Date.now();note('submitting');submitted=true
    handle=await operator.submit('RunStackService',params)
    check(handle&&oid.test(handle.expected?.id)&&oid.test(handle.expected?.stackId)&&handle.expected.operation==='RunStackService'&&handle.expected.stack==='lingxiloop-app-a'&&handle.oldContainerIds instanceof Set&&[...handle.oldContainerIds].every(id=>cid.test(id))&&equal(handle.params,params),'native-handle')
    const baseline=new Set(handle.oldContainerIds),seen=new Set(),foreign=new Set(),discoveryEnd=Date.now()+30000
    receipt.native={updateId:handle.expected.id,stackId:handle.expected.stackId,operation:'RunStackService',stack:'lingxiloop-app-a'}
    phase='discover'
    while(!container&&Date.now()<discoveryEnd){
      const update=await read('GetUpdate',{id:handle.expected.id})
      if(update?.status==='Queued'&&nativeStart===undefined){
        check(update._id?.$oid===handle.expected.id&&update.operation==='RunStackService'&&update.target?.type==='Stack'&&update.target.id===handle.expected.stackId,'native-queued-identity')
        await delay(250);continue
      }
      nativeIdentity(update,'InProgress')
      const rows=await read('ListContainers',{server:'shanghai-a'});check(Array.isArray(rows)&&rows.every(row=>cid.test(row?.id)&&typeof row.name==='string'),'container-list')
      const candidates=rows.filter(row=>!baseline.has(row.id)&&/^lingxiloop-app-a-db-migrate-run-[A-Za-z0-9_-]+$/.test(row.name))
      for(const row of candidates)seen.add(row.id)
      check(seen.size<=8,'candidate-bound')
      const matching=[]
      for(const row of candidates){
        if(foreign.has(row.id))continue
        const actual=await read('InspectContainer',{server:'shanghai-a',container:row.id})
        if(actual?.Image!==expected.pgImageId||!equal(actual.Config?.Cmd,params.command)||!equal(actual.Config?.Entrypoint,expected.pgEntrypoint)){foreign.add(row.id);continue}
        const started=inspectIdentity(actual,row.id);matching.push({id:row.id,started})
      }
      check(matching.length<=1,'candidate-ambiguous')
      if(matching.length){container=matching[0].id;containerStarted=matching[0].started}else await delay(250)
    }
    check(container,'container-missing')
    phase='register';const registered=await budget(operator.registerHeartbeat(handle,container),FRESH,monitorStop.signal)
    const commandSha=hash(JSON.stringify({entrypoint:expected.pgEntrypoint,command:params.command}))
    check(registered?.updateId===handle.expected.id&&registered.container===container&&registered.imageId===expected.pgImageId&&registered.commandSha256===commandSha,'registered-proof')
    proof=freeze({updateId:registered.updateId,container:registered.container,imageId:registered.imageId,commandSha256:registered.commandSha256});receipt.identity=proof
    phase='initial-heartbeat';const startupEnd=Date.now()+30000
    while(!last&&Date.now()<startupEnd){await observe(true);if(!last)await delay(250)}
    live();check(Date.parse(last.deadline_at)-Date.now()>=MIN_INITIAL,'initial-window')
    monitoring=true
    watchdog=setInterval(()=>{if(monitoring){try{live()}catch(error){signalFault(error)}}},100)
    monitorPromise=(async()=>{while(monitoring){const began=Date.now();try{await observe()}catch(error){if(monitoring)signalFault(error);break}try{await delay(Math.max(0,1000-(Date.now()-began)),monitorStop.signal)}catch{break}}})()
    const initial=live(),gate=freeze({complete:true,action:'product-lock',result:{format:'rag-shadow-product-lock/v1',plan_sha256:config.plan_sha256,verification_sha256:config.verification_sha256,binding_manifest_sha256:config.binding_manifest_sha256,
      observed_at:initial.observed_at,deadline_at:initial.deadline_at,pg_backend_pid:initial.pg_backend_pid,pg_backend_start:initial.pg_backend_start,pg_transaction_start:initial.pg_transaction_start,held_lock_count:initial.held_lock_count,lock_mode:'ShareLock',lock_scope_sha256:LOCK_SCOPE,
      komodo_update_id:proof.updateId,container_id:proof.container,image_id:proof.imageId,command_sha256:proof.commandSha256}})
    const gateBytes=JSON.stringify(gate),gateSha256=hash(gateBytes),context=freeze({signal:controller.signal,assertLive:live,gateBytes,gateSha256,native:proof})
    receipt.gate=gate;receipt.gateSha256=gateSha256
    phase='callback-finish';note('started');live()
    const finished=await Promise.race([Promise.resolve().then(()=>callbacks.finish(gate,context)),faultPromise]);live()
    const f=finished?.result
    check(finished?.complete===true&&finished.action==='finish'&&f?.phase==='active'&&f.active_database===expected.targetDatabase&&f.verification_sha256===config.verification_sha256&&f.product_gate_sha256===gateSha256&&Number.isSafeInteger(f.revision)&&f.revision>0,'finish-contract')
    receipt.finish={phase:'active',active_database:f.active_database,revision:f.revision,verification_sha256:f.verification_sha256,product_gate_sha256:f.product_gate_sha256};note('completed')
    phase='callback-ready';note('started');live()
    const readyStarted=Date.now(),ready=await Promise.race([Promise.resolve().then(()=>callbacks.startAndVerify(context)),faultPromise]);live()
    const r=ready?.readiness,g=r?.active_generation
    check(ready?.complete===true&&ready.healthy===true&&cid.test(ready.containerId)&&ready.imageId===expected.knowledgeImageId&&ready.healthcheckSha256===expected.healthcheckSha256&&finiteTime(ready.observedAt)&&Date.parse(ready.observedAt)>=readyStarted-2000&&Date.now()-Date.parse(ready.observedAt)>=-2000&&Date.now()-Date.parse(ready.observedAt)<=FRESH,'ready-native-contract')
    check(r?.status==='ready'&&r.profile==='rag'&&r.schema_version===1&&r.embedding_model_id==='Pro/BAAI/bge-m3'&&r.embedding_dimensions===1024&&r.embedding_probe===true&&r.r2_probe===true,'ready-probes')
    check(g?.active_database===expected.targetDatabase&&g.revision===f.revision&&g.plan_sha256===config.plan_sha256&&g.verification_sha256===config.verification_sha256&&g.model==='Pro/BAAI/bge-m3'&&g.base_url===expected.baseUrl&&g.product_gate_sha256===gateSha256,'ready-generation')
    receipt.ready=freeze({containerId:ready.containerId,imageId:ready.imageId,observedAt:ready.observedAt,healthcheckSha256:ready.healthcheckSha256,healthy:true,readiness:{status:r.status,profile:r.profile,schema_version:r.schema_version,embedding_model_id:r.embedding_model_id,embedding_dimensions:r.embedding_dimensions,embedding_probe:true,r2_probe:true,active_generation:{active_database:g.active_database,revision:g.revision,plan_sha256:g.plan_sha256,verification_sha256:g.verification_sha256,product_gate_sha256:g.product_gate_sha256,model:g.model,base_url:g.base_url}}})
    const readyReturned=Date.now(),readyCycle=observationCycle;let barrier
    note('completed');phase='post-ready-heartbeat'
    while(true){
      const sample=live()
      if(!barrier&&completedCycle>readyCycle){barrier={cycle:completedCycle,sequence:sample.sequence};receipt.readyBarrier=sample}
      else if(barrier&&completedCycle>barrier.cycle&&sample.sequence>barrier.sequence&&Date.parse(sample.observed_at)>=Math.max(readyReturned,Date.parse(ready.observedAt))){receipt.postReady=sample;break}
      await Promise.race([delay(50,controller.signal),faultPromise])
    }
    live();await stopMonitor();note('continuous-lock-proved')
    phase='native-final';const remaining=Date.parse(last.deadline_at)-Date.now()+15000
    let terminal,waitError
    try{terminal=await budget(operator.wait(handle,Math.max(1,remaining)),Math.max(1,remaining))}
    catch(error){
      if(denied(error)||error?.[INTERNAL])throw error
      waitError=error
      // Same owned update only. The heartbeat monitor is stopped; do not use its aborted signal.
      terminal=await budget(operator.read('GetUpdate',{id:handle.expected.id}),FRESH)
    }
    nativeIdentity(terminal,'Complete',true)
    const fresh=await budget(operator.read('GetUpdate',{id:handle.expected.id}),FRESH);nativeIdentity(fresh,'Complete',true)
    check(fresh.end_ts===terminal.end_ts&&fresh.success===terminal.success,'native-final-drift')
    if(fresh.success===false){receipt.native={...receipt.native,status:'Complete',success:false,startTs:fresh.start_ts,endTs:fresh.end_ts};fail('native-failed')}
    if(waitError)throw waitError
    const finalRows=parseLogs(fresh.logs),finals=finalRows.filter(row=>row.status!=='held')
    check(finals.length===1,'final-helper-receipt')
    const final=finals[0],finalKeys=['format','status','reason','pg_backend_pid','pg_backend_start','pg_transaction_start','database_oid','released','held_lock_operation'].sort()
    check(equal(Object.keys(final).sort(),finalKeys)&&final.status==='rolled-back'&&final.reason==='deadline'&&final.released===true&&final.held_lock_operation===true&&['pg_backend_pid','pg_backend_start','pg_transaction_start','database_oid'].every(key=>final[key]===pgIdentity[key]),'final-helper-release')
    const history=finalRows.filter(row=>row.status==='held');check(history.length>=2,'final-history-missing')
    for(const row of history)held(row,true)
    const ordered=[...bySequence.values()].sort((a,b)=>a.sequence-b.sequence)
    check(ordered[0].sequence===1&&ordered.every((row,index)=>!index||row.sequence===ordered[index-1].sequence+1&&Date.parse(row.observed_at)>=Date.parse(ordered[index-1].observed_at)&&Date.parse(row.observed_at)-Date.parse(ordered[index-1].observed_at)<=10000),'final-history-gap')
    check(history.some(row=>equal(row,receipt.postReady))&&Date.parse(ordered.at(-1).deadline_at)-Date.parse(ordered.at(-1).observed_at)<=10000,'final-history-coverage')
    receipt.observations=ordered;receipt.final=freeze({...final});receipt.native={...receipt.native,status:'Complete',success:true,startTs:fresh.start_ts,endTs:fresh.end_ts};receipt.complete=true;receipt.completedAt=new Date().toISOString();note('complete')
    return receipt
  }catch(error){
    signalFault(error);await stopMonitor();controller.abort(firstFault)
    const code=diagnosticCode(error,phase)
    receipt.failure={phase,code,...Number.isSafeInteger(error?.httpStatus)?{httpStatus:error.httpStatus}:{},noAutomaticRetry:submitted};note('failed')
    if(submitted&&typeof callbacks?.abort==='function'&&!abortCalled){abortCalled=true;try{await budget(Promise.resolve().then(()=>callbacks.abort({phase,code,signal:controller.signal,native:proof??receipt.native,receipt})),2000);receipt.abortAcknowledged=true}catch{receipt.abortAcknowledged=false}}
    const result=Object.assign(Error('PG coordinator failed: '+code),{name:'PgCoordinatorError',phase,code,...Number.isSafeInteger(error?.httpStatus)?{httpStatus:error.httpStatus}:{},noAutomaticRetry:submitted,uncertain:submitted&&code!=='native-failed',receipt})
    throw result
  }finally{await stopMonitor()}
}
