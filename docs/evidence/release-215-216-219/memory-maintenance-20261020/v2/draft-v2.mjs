// Production execution is delegated solely to root. Default mode is inspect.
// Requires an explicitly reviewed existing full product-environment carrier.
// Current db-migrate lacks that environment and is NOT executable for this draft.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const REASONS=['inactive','unproven_owner_or_source','source_unavailable','source_revised','source_authorization_revoked','ownership_or_audience_not_proven','source_predates_forgetting','path_requires_explicit_merge','destination_unavailable'];
const MAX_IDENTITIES=64,MAX_PAGES=8,MAX_CALLS=512;
const TYPES=['learner','course','session','agent_role','other'];
const BASELINE_SQL=`SELECT tenant_id,id,scope_type,count(*) OVER()::integer AS total
FROM lingxios.agent_memories WHERE starts_with(scope_id,'im-memory:') AND scope_type IN ('learner','course')
 AND origin<>'evolved' AND status='active' AND (valid_until IS NULL OR valid_until>NOW())
ORDER BY tenant_id,id LIMIT 257`;
const BASELINE_AFTER_SQL=`WITH wanted AS (SELECT tenant_id,id FROM jsonb_to_recordset($1::jsonb) AS x(tenant_id text,id text))
SELECT count(*)::integer AS baseline_total,
 count(*) FILTER(WHERE m.id IS NULL)::integer AS no_longer_present,
 count(*) FILTER(WHERE starts_with(m.scope_id,'im-memory:'))::integer AS still_legacy,
 count(*) FILTER(WHERE starts_with(m.scope_id,'stable-memory:'))::integer AS now_stable,
 count(*) FILTER(WHERE m.id IS NOT NULL AND NOT starts_with(m.scope_id,'im-memory:') AND NOT starts_with(m.scope_id,'stable-memory:'))::integer AS other_scope
FROM wanted w LEFT JOIN lingxios.agent_memories m ON m.tenant_id=w.tenant_id AND m.id=w.id`;
export const DISCOVERY_SQL=`WITH docs AS (
 SELECT tenant_id,id,source_refs FROM lingxios.agent_memories
 WHERE origin<>'evolved' AND status='active' AND (valid_until IS NULL OR valid_until>NOW())
), refs AS (
 SELECT DISTINCT m.tenant_id,s.value->>'authorId' AS principal_id,s.value->>'workId' AS run_id
 FROM docs m CROSS JOIN LATERAL jsonb_array_elements(m.source_refs) s(value)
 WHERE jsonb_typeof(s.value->'authorId')='string' AND s.value->>'authorId'<>''
 AND jsonb_typeof(s.value->'workId')='string' AND s.value->>'workId'<>''
)
SELECT r.tenant_id,r.principal_id,r.run_id,
 (w.id IS NOT NULL AND w.principal_id=r.principal_id) AS native_matches,
 COALESCE(w.cancel_requested_at IS NOT NULL,false) AS cancelled,
 EXISTS(SELECT 1 FROM public.agent_run_bindings b WHERE b.company_id=r.tenant_id AND b.run_id=r.run_id
  AND b.principal_id=r.principal_id AND b.agent_id=w.agent_id AND b.session_id=w.session_id
  AND b.thread_id IS NOT DISTINCT FROM w.thread_id AND NOT b.internal) AS binding_matches,
 count(*) OVER()::integer AS discovered_total
FROM refs r LEFT JOIN lingxios.agent_work_items w ON w.tenant_id=r.tenant_id AND w.id=r.run_id
ORDER BY r.tenant_id,r.principal_id,r.run_id LIMIT 65`;
const UNUSABLE_SQL=`SELECT COUNT(*)::integer AS documents_without_usable_source
FROM lingxios.agent_memories m WHERE origin<>'evolved' AND status='active' AND (valid_until IS NULL OR valid_until>NOW())
AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.source_refs) s(value)
 WHERE jsonb_typeof(s.value->'authorId')='string' AND s.value->>'authorId'<>''
 AND jsonb_typeof(s.value->'workId')='string' AND s.value->>'workId'<>'')`;
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const n=x=>{assert.ok(Number.isSafeInteger(x)&&x>=0);return x};
const scopeKey=s=>JSON.stringify([s.tenantId,s.scopeType,s.scopeId]);
const identityKey=i=>JSON.stringify([i.tenantId,i.principalId,i.workId]);
const docKey=(i,item)=>JSON.stringify([i.tenantId,item.id]);
export function summarize(records,only){
 if(only)records=new Map([...records].filter(([key])=>only.has(key)));
 const reasons=Object.fromEntries(REASONS.map(r=>[r,0]));let eligible=0,migrated=0,isolated=0;
 for(const v of records.values()){
  if(v.eligible)eligible++;if(v.migrated)migrated++;if(!v.eligible&&!v.migrated)isolated++;
  if(!v.eligible&&!v.migrated)for(const r of v.reasons)reasons[r]++;
 }
 const byScopeType=Object.fromEntries(TYPES.map(t=>[t,{distinctDocuments:0,eligibleDistinct:0,migratedDistinct:0,isolatedDistinct:0}]));
 for(const v of records.values()){const b=byScopeType[v.type];b.distinctDocuments++;if(v.eligible)b.eligibleDistinct++;if(v.migrated)b.migratedDistinct++;if(!v.eligible&&!v.migrated)b.isolatedDistinct++}
 return {distinctDocuments:records.size,eligibleDistinct:eligible,migratedDistinct:migrated,isolatedDistinct:isolated,isolationReasonDistinctDocuments:reasons,byScopeType};
}
export async function perform({mode,db,memory,readRunReference,isDenied,emit,checkBudget}){
 assert.ok(['inspect','execute','status'].includes(mode));let calls=0,mutationPages=0;
 const denied=error=>error?.maintenanceDenied===true||isDenied(error);
 const call=async(fn,mutating=false)=>{checkBudget();assert.ok(++calls<=MAX_CALLS);try{const value=await fn();return value}catch(error){throw Object.assign(new Error('maintenance-operation-failed'),{maintenanceMutationUncertain:mutating&&!denied(error),maintenanceDenied:denied(error)})}};
 const baseline=mode==='status'?[]:(await db.query(BASELINE_SQL)).rows;assert.ok(baseline.length<=256&&(!baseline.length||Number(baseline[0].total)===baseline.length));
 const originalIds=new Set(baseline.map(r=>JSON.stringify([r.tenant_id,r.id])));
 const discovery=(await db.query(DISCOVERY_SQL)).rows;
 const missing=n(Number((await db.query(UNUSABLE_SQL)).rows[0].documents_without_usable_source));
 const total=discovery.length?n(Number(discovery[0].discovered_total)):0;
 assert.ok(total===discovery.length&&total<=MAX_IDENTITIES);
 const coverage={discovered:total,documentsWithoutUsableSource:missing,nativeUnavailable:0,bindingMissing:0,cancelled:0,revoked:0,authorized:0,scanComplete:0,scanRevoked:0};
 const identities=[],initialScopes=new Set(),eligibleIdentities=[];
 for(const row of discovery){
  if(row.native_matches!==true){coverage.nativeUnavailable++;continue}
  if(row.cancelled===true){coverage.cancelled++;continue}
  if(row.binding_matches!==true){coverage.bindingMissing++;continue}
  const ref=await call(()=>readRunReference(db,row.tenant_id,row.run_id));
  assert.ok(ref&&ref.tenantId===row.tenant_id&&ref.principalId===row.principal_id&&ref.runId===row.run_id);
  const identity={...ref,principalId:row.principal_id,workId:row.run_id};
  try{const scopes=await call(()=>memory.scopes(identity));assert.ok(Array.isArray(scopes)&&scopes.length<=12);for(const scope of scopes){assert.equal(scope.tenantId,identity.tenantId);initialScopes.add(scopeKey(scope))}identities.push(identity);coverage.authorized++}
  catch(error){if(denied(error)){coverage.revoked++;continue}throw error}
 }
 assert.equal(new Set(identities.map(identityKey)).size,identities.length);
 emit({phase:'identity-discovery',complete:true,coverage:{...coverage}});
 async function scan(identity,dryRun,records){
  let cursor,eligible=false;const cursors=new Set();
  for(let page=0;page<MAX_PAGES;page++){
   // dryRun may lock/create scope bookkeeping; regard interrupted calls as uncertain too.
   const result=await call(()=>memory.migrateLegacy(identity,{dryRun,limit:16,...cursor?{cursor}:{}}),true);
   try {
   assert.ok(result&&Array.isArray(result.items)&&result.items.length<=16);
   for(const item of result.items){
    assert.ok(typeof item.id==='string'&&item.id.length>0&&['eligible','migrated','isolated'].includes(item.outcome));
    if(dryRun)assert.notEqual(item.outcome,'migrated');else assert.notEqual(item.outcome,'eligible');
    if(item.outcome==='eligible')eligible=true;
    const key=docKey(identity,item),record=records.get(key)??{eligible:false,migrated:false,reasons:new Set(),type:TYPES.includes(item.from?.scopeType)?item.from.scopeType:'other'};
    if(item.outcome==='isolated'){assert.ok(REASONS.includes(item.reason));record.reasons.add(item.reason)}else record[item.outcome]=true;
    records.set(key,record);
   }
   if(!dryRun)emit({phase:'migration-progress',complete:false,confirmedPages:++mutationPages,result:summarize(records),originalContinuity:summarize(records,originalIds)});
   if(result.nextCursor===null)return eligible;
   assert.ok(typeof result.nextCursor==='string'&&result.nextCursor.length>0&&result.nextCursor.length<=1000&&!cursors.has(result.nextCursor));
   cursors.add(result.nextCursor);cursor=result.nextCursor;
   }catch{throw Object.assign(new Error('unvalidated-migration-receipt'),{maintenanceMutationUncertain:true})}
  }
  throw Error('page-budget');
 }
 const before=new Map(),moved=new Map(),after=new Map();let continuity=null;
 if(mode!=='status'){
 for(const identity of identities){
  try{if(await scan(identity,true,before))eligibleIdentities.push(identity);coverage.scanComplete++}
  catch(error){if(denied(error)){coverage.scanRevoked++;continue}throw error}
 }
 emit({phase:'inspect-before',complete:coverage.scanComplete===identities.length,coverage:{...coverage},result:summarize(before),originalContinuity:summarize(before,originalIds)});
 // An identity revoked during inspection is not silently treated as fully scanned.
 assert.equal(coverage.scanComplete,identities.length);
 const requiredRemainingCalls=eligibleIdentities.length*MAX_PAGES+identities.length*MAX_PAGES+identities.length+initialScopes.size*3;
 const budget={callsUsed:calls,eligibleIdentities:eligibleIdentities.length,authorizedScopes:initialScopes.size,requiredRemainingCalls,remainingCalls:MAX_CALLS-calls,budgetSufficient:requiredRemainingCalls<=MAX_CALLS-calls};
 emit({phase:'execution-budget',complete:true,counts:budget});
 if(mode==='execute'){
  assert.ok(budget.budgetSufficient,'pre-mutation-call-budget');checkBudget();
  for(const identity of eligibleIdentities)await scan(identity,false,moved);
  emit({phase:'migration',complete:true,result:summarize(moved),originalContinuity:summarize(moved,originalIds)});
 }
 if(mode==='execute')for(const identity of identities)await scan(identity,true,after);
 else for(const [key,value]of before)after.set(key,value);
 if(mode==='execute')emit({phase:'inspect-after',complete:true,result:summarize(after),originalContinuity:summarize(after,originalIds)});
 const seen=new Set([...before.keys(),...moved.keys(),...after.keys()]);
 const baselineAfter=(await db.query(BASELINE_AFTER_SQL,[JSON.stringify(baseline.map(r=>({tenant_id:r.tenant_id,id:r.id})))])).rows[0];
 for(const value of Object.values(baselineAfter))n(Number(value));
 assert.equal(baselineAfter.baseline_total,baseline.length);
 continuity={originalCandidates:baseline.length,observedUnique:[...originalIds].filter(k=>seen.has(k)).length,unobservedUnique:[...originalIds].filter(k=>!seen.has(k)).length,eligibleAtLeastOnce:summarize(before,originalIds).eligibleDistinct,migratedUnique:summarize(moved,originalIds).migratedDistinct,after:baselineAfter};
 emit({phase:'original-continuity-accounting',complete:true,counts:continuity});
 }
 const authorizedScopes=new Map();
 for(const identity of identities){
  const scopes=await call(()=>memory.scopes(identity));assert.ok(Array.isArray(scopes)&&scopes.length<=12);
  for(const scope of scopes){assert.equal(scope.tenantId,identity.tenantId);if(!authorizedScopes.has(scopeKey(scope)))authorizedScopes.set(scopeKey(scope),{identity,scope})}
 }
 const doctorSnapshots=new Map();
 async function doctors(){
  const out={scopes:authorizedScopes.size,configuredScopes:0,eligible:0,indexed:0,missing:0};const keys=new Set();
  for(const {identity,scope} of authorizedScopes.values()){
   const result=await call(()=>memory.doctor(identity,scope));doctorSnapshots.set(scopeKey(scope),result);
   if(!own(result,'index'))continue;
   const ix=result.index;assert.ok(ix&&typeof ix.key==='string'&&/^[a-f0-9]{64}$/.test(ix.key));
   keys.add(ix.key);const eligible=n(ix.eligible),indexed=n(ix.indexed);assert.ok(indexed<=eligible);
   out.configuredScopes++;out.eligible+=eligible;out.indexed+=indexed;out.missing+=eligible-indexed;
  }
  assert.ok(keys.size<=1);return out;
 }
 const indexBefore=await doctors();emit({phase:mode==='status'?'authorized-index-status':'authorized-index-before',complete:true,counts:indexBefore});
 const queue={scopesAttempted:0,queued:0,configuredFalse:0,zeroQueuedWithMissing:0};
 if(mode==='execute')for(const {identity,scope} of authorizedScopes.values()){
  const current=doctorSnapshots.get(scopeKey(scope));
  if(!current.index){queue.configuredFalse++;continue}
  if(n(current.index.eligible)===n(current.index.indexed))continue;
  // Native API fetches the real current work/fence; no caller-provided fence.
  const result=await call(async()=>{
   const receipt=await memory.reindex(identity,scope);
   assert.ok(receipt&&typeof receipt.configured==='boolean');
   const queued=n(receipt.queued);n(queue.queued+queued);
   return {configured:receipt.configured,queued};
  },true);
  queue.scopesAttempted++;queue.queued+=result.queued;
  if(!result.configured)queue.configuredFalse++;else if(result.queued===0)queue.zeroQueuedWithMissing++;
  emit({phase:'reindex-progress',complete:false,counts:{...queue}});
 }
 if(mode!=='status')emit({phase:'reindex-queue',complete:true,counts:queue});
 const indexAfter=mode!=='execute'?indexBefore:await doctors();if(mode==='execute')emit({phase:'authorized-index-after',complete:true,counts:indexAfter});
 return {mode,operationsComplete:true,legacyInspectionPerformed:mode!=='status',migrationPerformed:mode==='execute',apiCalls:calls,coverage,continuity,inspect:summarize(after),migration:summarize(moved),authorizedIndex:indexAfter,queue,
  globalCoverageClaimed:false,indexingCompleteForAuthorizedScopes:indexAfter.scopes>0&&indexAfter.configuredScopes===indexAfter.scopes&&indexAfter.missing===0,
  workCompletion:'existing-workers-only',remainingPolicy:'do-not-index-inaccessible-legacy-scopes'};
}
export async function closeBusinessRedis(clients,timeoutMs=5000){
 await Promise.all(clients.map(client=>new Promise((resolve,reject)=>{
  if(client.status==='end'){resolve();return}
  let timer;const done=()=>{clearTimeout(timer);client.removeListener('end',done);resolve()};
  client.once('end',done);
  timer=setTimeout(()=>{client.removeListener('end',done);reject(Error('redis-close-timeout'))},timeoutMs);
  try{client.disconnect();if(client.status==='end')done()}catch{clearTimeout(timer);client.removeListener('end',done);reject(Error('redis-close-failed'))}
 })));
}
export async function cleanupResources({stop,disconnect,close,emit,timeoutMs=10000}){
 let failed=false;
 for(const [resource,dispose]of [['control',stop],['business-redis',disconnect],['database',close]]){
  if(!dispose)continue;
  const started=Date.now();let timer;
  emit({phase:'cleanup-progress',resource,status:'pending',elapsedMs:0});
  try{
   await Promise.race([Promise.resolve().then(dispose),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup-timeout')),timeoutMs)})]);
   emit({phase:'cleanup-progress',resource,status:'complete',elapsedMs:Date.now()-started});
  }catch{failed=true;emit({phase:'cleanup-progress',resource,status:'failed',elapsedMs:Date.now()-started})}
  finally{clearTimeout(timer)}
 }
 if(failed)throw Error('cleanup-failed');
}
export async function main(mode='inspect'){
 assert.ok(['inspect','execute','status'].includes(mode));
 const rawWrite=process.stdout.write.bind(process.stdout);
 const suppress=(_data,encoding,callback)=>{const cb=typeof encoding==='function'?encoding:callback;if(typeof cb==='function')cb();return true};
 process.stdout.write=suppress;process.stderr.write=suppress;
 for(const key of ['log','info','warn','error','debug','trace','dir'])console[key]=()=>{};
 let phase='startup',close,stop,disconnect,result,failed=false;const started=Date.now();
 const emit=value=>{phase=value.phase??phase;rawWrite('ISSUE216_MAINTENANCE='+JSON.stringify(value)+'\n')};
 const checkBudget=()=>assert.ok(Date.now()-started<130000,'deadline');
 try{
  const requiredEnv=['DATABASE_URL','REDIS_URL','OPENAI_API_KEY','OPENAI_EMBEDDING_MODEL','LINGXILOOP_INVITE_BASE_URL','LINGXILOOP_GATEWAY_HMAC_SECRET','LINGXIOS_REALTIME_REDIS_URL','LINGXIOS_R2_BUCKET'];
  if(!requiredEnv.every(k=>typeof process.env[k]==='string'&&process.env[k].trim())||!(process.env.WUKONG_USER_TOKEN_SECRET?.trim()||process.env.WUKONG_WEBHOOK_SECRET?.trim()))throw Object.assign(new Error('missing-existing-product-environment'),{environmentUnavailable:true});
  const native=await import('@lyyzka/lingxios');assert.equal(native.releaseVersions.runtime,'3.5.8');assert.equal(native.releaseVersions.schema,13);
  const storage=await import('/app/server/src/db/pool.ts');close=storage.closeDatabasePools;
  const business=await import('/app/server/src/redis.ts');disconnect=()=>closeBusinessRedis([business.sub,business.redis]);
  const runtime=await import('/app/server/src/agent-runtime/runtime.ts');stop=runtime.stopLingxiOSControl;
  const {ForbiddenError}=await import('/app/server/src/modules/access/public.ts');
  runtime.prepareLingxiOSWorkerContext();const app=await runtime.lingxiOSControl();assert.ok(app.memory);
  result=await perform({mode,db:storage.pool,memory:app.memory,readRunReference:native.readRunReference,
   isDenied:error=>error instanceof ForbiddenError||error instanceof native.NoEffectError&&error.code==='forbidden',emit,checkBudget});
 }catch(error){failed=true;emit({phase:'stopped',status:error?.environmentUnavailable?'blocked':error?.maintenanceMutationUncertain?'uncertain':'failed',lastPhase:phase,code:error?.environmentUnavailable?'EXISTING_PRODUCT_ENVIRONMENT_UNAVAILABLE':error?.maintenanceDenied===true?'CURRENT_AUTHORIZATION_REVOKED':'ISSUE216_MAINTENANCE_STOPPED',noAutomaticRetry:true});process.exitCode=1}
 try{await cleanupResources({stop,disconnect,close,emit})}
 catch{failed=true;emit({phase:'cleanup',status:'failed',code:'ISSUE216_CLEANUP_FAILED'});process.exitCode=1}
 if(!failed)emit({phase:'final',status:'complete',...result,cleanupComplete:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main(process.argv[2]==='--execute'?'execute':process.argv[2]==='--status'?'status':'inspect');
