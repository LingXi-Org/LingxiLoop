// Pure validators. They never fetch, execute SQL, or print native replies.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {BINDINGS} from './bindings.mjs';
export {BINDINGS};
export const MARKER='NATIVE14_SEED_CHECK=';
export const FORMAT='native14-seed-precheck-receipt/v1';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=/^[a-f0-9]{64}$/,sha=/^[a-f0-9]{40}$/,id=/^[a-f0-9]{24}$/;
const stacks=['lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state'];
const check=(v,code)=>{if(!v)throw Error('Seed prerequisite: '+code)};
const keys=(value,expected)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===expected.toSorted().join(),'object shape');
const equal=(a,b)=>check(isDeepStrictEqual(a,b),'evidence mismatch');
function markerValue(value){
 keys(value,['readOnly','fullVisibility','canonicalSha256','counts','equal']);
 check(value.readOnly===true&&value.fullVisibility===true,'read-only visibility');
 check(value.canonicalSha256===BINDINGS.canonicalSha256,'canonical digest');
 keys(value.counts,['missing','mismatched','plans','entitlements','planEntitlements']);
 const c=value.counts;
 check(Object.values(c).every(n=>Number.isSafeInteger(n)&&n>=0),'count type');
 check(c.plans<=1&&c.entitlements<=8&&c.planEntitlements<=8,'count range');
 const found=c.plans+c.entitlements+c.planEntitlements;
 check(c.missing===17-found&&c.mismatched<=found,'count consistency');
 check(typeof value.equal==='boolean'&&value.equal===(c.missing===0&&c.mismatched===0),'equality');
 return structuredClone(value);
}
function nativeValue(native,{expectedId,coreStackId}){
 keys(native,['id','operation','target','status','success','startTs','endTs']);
 keys(native.target,['type','id']);
 check(id.test(expectedId??'')&&id.test(coreStackId??'')&&native.id===expectedId&&native.target.id===coreStackId,'native identity');
 check(native.operation==='RunStackService'&&native.target.type==='Stack'&&native.status==='Complete'&&native.success===true,'native terminal');
 check(Number.isSafeInteger(native.startTs)&&Number.isSafeInteger(native.endTs)&&native.startTs>0&&native.endTs>=native.startTs,'native timestamps');
 return structuredClone(native);
}
export function parseSeedUpdate(update,{expectedId,coreStackId}){
 const native=nativeValue({id:update?._id?.$oid,operation:update?.operation,target:update?.target,status:update?.status,success:update?.success,startTs:update?.start_ts,endTs:update?.end_ts},{expectedId,coreStackId});
 check(Array.isArray(update.logs),'native logs missing');
 let bytes=0;const lines=[];
 for(const log of update.logs){
  if(typeof log?.stdout!=='string')continue;
  bytes+=Buffer.byteLength(log.stdout);check(bytes<=1024*1024,'native output bound');
  for(const line of log.stdout.split(/\r?\n/))if(line.startsWith(MARKER))lines.push(line);
 }
 check(lines.length===1&&Buffer.byteLength(lines[0])<=4096,'unique marker');
 let value;try{value=JSON.parse(lines[0].slice(MARKER.length))}catch{throw Error('Seed prerequisite: marker JSON')}
 return {...markerValue(value),native};
}
export function assertFreshSeedUpdate(previous,fresh,options){
 const a=parseSeedUpdate(previous,options),b=parseSeedUpdate(fresh,options);
 equal(a,b);return b;
}
export function validateSeedReceipt({plan,planRaw,receipt,executionStartedAt,coreStackId}){
 keys(receipt,['format','verified','outcome','planHash','planSha256','source','target','reviewedTarget','driverCommit','sqlSha256','canonicalSha256','provenanceSha256','sourceAcceptanceSha256','sourceProductionSha256','startedAt','finishedAt','readOnly','fullVisibility','counts','equal','native','guards','events']);
 check(receipt.format===FORMAT&&receipt.verified===true&&receipt.outcome==='complete','successful receipt');
 for(const k of ['source','reviewedTarget','driverCommit','sqlSha256','canonicalSha256','provenanceSha256'])check(receipt[k]===BINDINGS[k],'fixed artifact binding');
 check(plan?.source?.sha===BINDINGS.source&&sha.test(plan?.target?.sha??'')&&receipt.target===plan.target.sha,'release source target');
 check(hex.test(plan.planHash??'')&&receipt.planHash===plan.planHash&&receipt.planSha256===hash(planRaw),'sealed plan bytes');
 check(hex.test(plan.sourceAcceptanceSha256??'')&&receipt.sourceAcceptanceSha256===plan.sourceAcceptanceSha256&&hex.test(receipt.sourceProductionSha256??''),'accepted source hashes');
 const parsed=markerValue(Object.fromEntries(['readOnly','fullVisibility','canonicalSha256','counts','equal'].map(k=>[k,receipt[k]])));
 check(parsed.equal===true,'canonical drift');
 nativeValue(receipt.native,{expectedId:receipt.native?.id,coreStackId});
 const start=Date.parse(receipt.startedAt),finish=Date.parse(receipt.finishedAt),execution=Date.parse(executionStartedAt);
 check([start,finish,execution].every(Number.isFinite)&&start<=finish&&finish<=execution&&execution-finish<=30*60*1000,'fresh before execution');
 check(receipt.native.startTs>=start&&receipt.native.endTs<=finish,'native within receipt');
 keys(receipt.guards,['before','after','unchanged']);check(receipt.guards.unchanged===true,'guard equality');
 for(const guard of [receipt.guards.before,receipt.guards.after]){
  keys(guard,['configHashes','containersSha256']);keys(guard.configHashes,stacks);
  check(hex.test(guard.containersSha256??'')&&Object.values(guard.configHashes).every(v=>hex.test(v)),'guard hash');
 }
 equal(receipt.guards.before,receipt.guards.after);
 check(Array.isArray(receipt.events)&&receipt.events.length<=100,'event bound');
 for(const event of receipt.events){
  check(event&&typeof event==='object'&&!Array.isArray(event)&&Object.keys(event).every(k=>['phase','status','operation','stack','updateId','observedAt'].includes(k)),'event fields');
  check(Number.isFinite(Date.parse(event.observedAt)),'event time');
  check(['guard','komodo','seed'].includes(event.phase),'event phase');
  check(['submitting','pending','complete','verified','uncertain','failed'].includes(event.status),'event status');
  if(event.updateId!==undefined)check(id.test(event.updateId),'event update id');
  if(event.stack!==undefined)check(stacks.includes(event.stack),'event stack');
  if(event.operation!==undefined)check(event.operation==='RunStackService','event operation');
 }
 check(receipt.events.every(e=>!['failed','uncertain'].includes(e.status)),'unresolved earlier event');
 const nativeEvents=receipt.events.filter(e=>e.phase==='komodo');
 equal(nativeEvents.map(e=>e.status),['submitting','pending','complete']);
 check(nativeEvents.every(e=>e.stack==='lingxiloop-core-state'&&e.operation==='RunStackService'),'native event target');
 check(nativeEvents[0].updateId===undefined&&nativeEvents.slice(1).every(e=>e.updateId===receipt.native.id),'native event identity');
 const guards=receipt.events.filter(e=>e.phase==='guard'),completed=receipt.events.filter(e=>e.phase==='seed');
 check(guards.length===2&&guards.every(e=>e.status==='verified')&&completed.length===1&&completed[0].status==='complete','successful event sequence');
 equal(receipt.events.map(e=>e.phase),['guard','komodo','komodo','komodo','guard','seed']);
 const times=receipt.events.map(e=>Date.parse(e.observedAt));
 check(times.every((time,i)=>time>=start&&time<=finish&&(i===0||time>=times[i-1])),'event order');
 return true;
}
