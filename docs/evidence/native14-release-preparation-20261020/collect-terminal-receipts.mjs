// Parent-run read-only collector. Synthetic parser tests never produce this output.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {createTransport,parseMarker,validateStateReceipt} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/schema-upgrade-komodo.mjs';
import {validateHostPlanShape,assertCompatibleState,assertNativeBackupReceipt,assertWorkerBarrier,metadataKeys,hash,NATIVE_SCHEMA_FORMAT} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release.mjs';
import {assertBarrier} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/schema-upgrade-maintenance.mjs';
import {parseMemoryBackupReceipt} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/verify-memory-backup.mjs';
import {DIR,SOURCE,loadInputs} from './inputs.mjs';
import {assertSeedProof,confirmSeedUpdate} from './seed-evidence.mjs';
export {DIR,hash};export const APPS=['lingxiloop-app-a','lingxiloop-app-b'],CORE='lingxiloop-core-state';
const ID=/^[a-f0-9]{24}$/,HEX=/^[a-f0-9]{64}$/;
const operations={PullStack:'PullStackService',StopStack:'StopStackService',DeployStack:'DeployStackService',RunStackService:'RunStackService',WriteStackFileContents:'WriteStackContents'};
const op=(requestOperation,stack,service,kind,descriptor)=>({requestOperation,operation:operations[requestOperation],stack,...(service?{service}:{}),...(kind?{kind}:{}),...(descriptor?{descriptor}: {})});
const state=which=>op('RunStackService',CORE,'postgres','state',which),metadata=stack=>op('RunStackService',stack,'db-migrate','metadata','target');
export function recipe(mode){
 const [a,b]=APPS,w=stack=>op('WriteStackFileContents',stack),pull=stack=>op('PullStack',stack,'db-migrate');
 if(mode==='prep')return [state('source'),w(a),pull(a),w(a),w(b),pull(b),w(b),state('source')];
 assert.equal(mode,'release');
 const rows=[state('source'),w(a),w(b),metadata(a),metadata(b),state('source')];
 for(const service of ['worker','lingxiloop'])for(const stack of APPS)rows.push(op('StopStack',stack,service));
 rows.push(state('source'),state('source'),op('RunStackService',CORE,'postgres','backup','source'),state('source'),metadata(a),metadata(b),state('source'),op('RunStackService',a,'db-migrate','migration','target'),state('target'));
 for(const service of ['lingxiloop','worker'])for(const stack of APPS){rows.push(state('target'));if(service==='lingxiloop'||stack===a)rows.push(state('target'));rows.push(op('DeployStack',stack,service),state('target'));}
 rows.push(state('target'));return rows;
}
export function scanNativeEvents(events,{allowBackup=false}={}){
 assert.ok(Array.isArray(events)&&events.length);let active,backup;const rows=[];
 for(const [index,e] of events.entries()){
  assert.ok(!['failed','uncertain','not-submitted'].includes(e.status)&&e.phase!=='stopped','Failed/unknown execution cannot qualify');
  if(e.phase==='backup-native'){
   assert.ok(allowBackup&&!active&&e.status==='pending');
   if(!backup){assert.equal(e.updateId,undefined);backup={first:index};}
   else{assert.equal(backup.id,undefined);assert.ok(ID.test(e.updateId??''));backup.id=e.updateId;backup.pending=index;}
  }else if(e.phase==='backup'){
   assert.ok(allowBackup&&!active&&backup?.id&&e.status==='verified');assert.equal(e.receipt?.updateId,backup.id);
   rows.push({index,id:backup.id,requestOperation:'RunStackService',operation:'RunStackService',stack:CORE,kind:'backup',backupPending:backup.pending,backupFirst:backup.first});backup=undefined;
  }else if(e.phase==='komodo'){
   assert.equal(backup,undefined);assert.ok(operations[e.operation]&&[...APPS,CORE].includes(e.stack));
   if(e.status==='submitting'){assert.equal(active,undefined);active={operation:e.operation,stack:e.stack};}
   else if(e.status==='pending'){assert.ok(active&&!active.id&&ID.test(e.updateId??''));assert.equal(e.operation,active.operation);assert.equal(e.stack,active.stack);active.id=e.updateId;}
   else if(e.status==='complete'){assert.ok(active?.id&&active.id===e.updateId);assert.equal(e.operation,active.operation);assert.equal(e.stack,active.stack);rows.push({index,id:e.updateId,requestOperation:e.operation,operation:operations[e.operation],stack:e.stack});active=undefined;}
   else assert.fail('Unknown native progress');
  }
 }
 assert.equal(active,undefined);assert.equal(backup,undefined);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);return rows;
}
export function expectedUpdates(plan,prep,execution){
 validateHostPlanShape(plan);assert.equal(plan.format,NATIVE_SCHEMA_FORMAT);assert.equal(plan.source.sha,SOURCE);assert.equal(prep.mode,'online-images-only');assert.equal(execution.mode,'native-schema-maintenance');
 const records=[];
 for(const [name,value,mode] of [['image-preparation.json',prep,'prep'],['release-execution.json',execution,'release']]){
  assert.equal(value.planHash,plan.planHash);assert.equal(value.complete,true);const done=value.events?.at(-1);assert.equal(done?.phase,'complete');assert.equal(done.status,'complete');assert.equal(done.planHash,plan.planHash);assert.equal(value.events.filter(e=>e.phase==='complete').length,1);
  const rows=scanNativeEvents(value.events,{allowBackup:mode==='release'}),expected=recipe(mode);assert.equal(rows.length,expected.length);
  rows.forEach((r,i)=>{for(const k of ['requestOperation','operation','stack'])assert.equal(r[k],expected[i][k]);if(r.kind==='backup')assert.equal(expected[i].kind,'backup');else assert.notEqual(expected[i].kind,'backup');Object.assign(r,expected[i],{input:name});});
  records.push(...rows);
 }
 assert.equal(records.length,43);assert.equal(new Set(records.map(r=>r.id)).size,43);
 const release=records.filter(r=>r.input==='release-execution.json'),events=execution.events;
 for(const [phase,status,operation] of [['drain','stopped','StopStack'],['rollout','healthy','DeployStack']]){
  const markers=events.map((e,index)=>({...e,index})).filter(e=>e.phase===phase&&e.status===status),rows=release.filter(r=>r.requestOperation===operation);assert.equal(markers.length,4);
  markers.forEach((e,i)=>{const r=rows[i];assert.equal(e.stack,r.stack);assert.equal(e.service,r.service);assert.ok(r.index<e.index&&(i===3||e.index<rows[i+1].index));if(operation==='DeployStack'){assert.ok(HEX.test(e.containerId??'')&&/^sha256:[a-f0-9]{64}$/.test(e.imageId??''));r.containerId=e.containerId;r.imageId=e.imageId;}});
 }
 const barriers=events.map((e,index)=>({...e,index})).filter(e=>e.phase==='drain'&&e.status==='zero-leases');assert.equal(barriers.length,7);
 for(const [i,e] of barriers.entries()){const r=release.filter(r=>r.kind==='state'&&r.index<e.index).at(-1);assert.ok(r&&!r.barrier);r.barrier=i<4?'all-writers':'workers';r.barrierEventIndex=e.index;assert.equal(r.descriptor,i<4?'source':'target');}
 const b=release.find(r=>r.kind==='backup'),receipt=events[b.index].receipt;assertNativeBackupReceipt(plan,receipt);
 for(const index of [b.backupFirst,b.backupPending]){const e=events[index];assert.equal(e.sourceSha,plan.source.sha);assert.equal(e.attempt,plan.backup.attempt);assert.equal(e.commandHash,plan.backup.commandHash);assert.equal(e.isolatedDatabase,plan.backup.isolatedDatabase);}
 const migration=release.find(r=>r.kind==='migration'),ms=events.map((e,index)=>({...e,index})).filter(e=>e.phase==='migration');assert.deepEqual(ms.map(e=>e.status),['submitting','migrated']);assert.ok(b.index<ms[0].index&&ms[0].index<migration.index&&migration.index<ms[1].index);assert.equal(ms[1].recovery,'fix-forward');assertCompatibleState(ms[1].state,plan.target);migration.migratedEventIndex=ms[1].index;
 assert.ok(barriers[1].index<b.backupFirst&&b.index<barriers[2].index&&barriers[3].index<ms[0].index);assert.ok(Date.parse(barriers[1].observedAt)-Date.parse(barriers[0].observedAt)>=2000);
 const last=release.at(-1);assert.equal(last.kind,'state');assert.equal(last.descriptor,'target');last.finalState=true;assertCompatibleState(events.at(-1).state,plan.target);
 const done=events.at(-1);assert.equal(done.containers?.length,4);assert.equal(new Set(done.containers.map(c=>c.id)).size,4);for(const r of release.filter(r=>r.requestOperation==='DeployStack')){const rows=done.containers.filter(c=>c.stack===r.stack&&c.service===r.service);assert.equal(rows.length,1);assert.equal(rows[0].id,r.containerId);assert.equal(rows[0].imageId,r.imageId);}
 return records;
}
const withoutVerificationTime=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='verifiedAt'));
export function assertParsedRow(row,r,stackIds,plan,execution){
 for(const k of Object.keys(r))assert.deepEqual(row[k],r[k]);assert.deepEqual(row.target,{type:'Stack',id:stackIds[r.stack]});assert.equal(row.status,'Complete');assert.equal(row.success,true);assert.ok(Number.isFinite(row.startTs)&&row.startTs>0&&Number.isFinite(row.endTs)&&row.endTs>=row.startTs);assert.equal(row.durationMs,row.endTs-row.startTs);
 if(r.kind==='metadata')assert.deepEqual(row.metadata,Object.fromEntries(metadataKeys.map(k=>[k,plan.target[k]])));
 if(r.kind==='state'){validateStateReceipt(row.state);assertCompatibleState(row.state,plan[r.descriptor]);if(r.barrier){assert.deepEqual(row.state,execution.events[r.barrierEventIndex].state);(r.barrier==='all-writers'?assertBarrier:assertWorkerBarrier)(row.state);}if(r.finalState)assert.deepEqual(row.state,execution.events.at(-1).state);}
 if(r.kind==='migration')assert.deepEqual(row.migration,{sha:plan.target.sha,schema:14,product:50});
 if(r.kind==='backup'){assertNativeBackupReceipt(plan,row.backup);assert.equal(row.backup.updateId,r.id);assert.deepEqual(withoutVerificationTime(row.backup),withoutVerificationTime(execution.events[r.index].receipt));}
}
export function verifyUpdate(u,r,stackIds,plan,execution){
 assert.ok(ID.test(stackIds[r.stack]??''));assert.equal(u?._id?.$oid,r.id);assert.equal(u.operation,r.operation);assert.deepEqual(u.target,{type:'Stack',id:stackIds[r.stack]});assert.equal(u.status,'Complete');assert.equal(u.success,true);
 const row={...r,target:u.target,status:u.status,success:u.success,startTs:u.start_ts,endTs:u.end_ts,durationMs:u.end_ts-u.start_ts};
 if(r.kind==='metadata')row.metadata=parseMarker(u,'METADATA');if(r.kind==='state')row.state=validateStateReceipt(parseMarker(u,'STATE'));if(r.kind==='migration')row.migration=parseMarker(u,'MIGRATED');if(r.kind==='backup')row.backup=parseMemoryBackupReceipt(plan.backup,u);
 assertParsedRow(row,r,stackIds,plan,execution);return row;
}
export function assertTimeline(rows){for(let i=1;i<rows.length;i++)assert.ok(rows[i].startTs>=rows[i-1].endTs,'Native operations overlap or an earlier receipt was reused');}
export async function collect({plan,planRaw,prep,execution,read,inputs,input,seedRaw,sourceProductionRaw,onPartial=async()=>{}}){
 const expected=expectedUpdates(plan,prep,execution),stackIds={};for(const {stack} of plan.stacks){const s=await read('GetStack',{stack});assert.ok(ID.test(s?._id?.$oid??''));stackIds[stack]=s._id.$oid;}assert.equal(new Set(Object.values(stackIds)).size,3);
 const seed=assertSeedProof({plan,planRaw,execution,seedRaw,input,sourceProductionRaw,coreStackId:stackIds[CORE]});assert.ok(!expected.some(r=>r.id===seed.native.id),'Seed update must be separate from43');
 const out={format:'native14-terminal-receipts/v1',startedAt:new Date().toISOString(),planHash:plan.planHash,inputs,stackIds,updates:[],verified:false};await onPartial(out);
 for(const r of expected){out.updates.push(verifyUpdate(await read('GetUpdate',{id:r.id}),r,stackIds,plan,execution));await onPartial(out);}
 assertTimeline(out.updates);out.seed={receiptSha256:hash(seedRaw),...confirmSeedUpdate(await read('GetUpdate',{id:seed.native.id}),seed,stackIds[CORE])};out.seedNativeReceiptCount=1;out.verified=true;out.finishedAt=new Date().toISOString();await onPartial(out);return out;
}
async function main(){
 const {plan,planRaw,inputRaw,input,evidence}=await loadInputs(),names=['image-preparation.json','release-execution.json'],raw=await Promise.all(names.map(n=>readFile(DIR+'/'+n))),[prep,execution]=raw.map(b=>JSON.parse(b));expectedUpdates(plan,prep,execution);
 const path=DIR+'/terminal-receipts.json',out={verified:false,status:'reading',planHash:plan.planHash};await writeFile(path,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600});let last=out;
 try{const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET});const result=await collect({plan,planRaw,prep,execution,read:t.read,input,seedRaw:evidence.canonicalSeedPrecheck,sourceProductionRaw:evidence.sourceProduction,inputs:[{name:'inputs.json',sha256:hash(inputRaw)},{name:'plan.json',sha256:hash(planRaw)},...names.map((name,i)=>({name,sha256:hash(raw[i])}))],onPartial:async value=>{last=value;await writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600})}});console.log(JSON.stringify({verified:result.verified,count:result.updates.length}));}
 catch{await writeFile(path,JSON.stringify({...last,verified:false,status:'failed-or-unresolved',noAutomaticRetry:true},null,2)+'\n',{mode:0o600});throw Error('Native evidence unresolved');}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Native14 receipt collection unavailable/failed; no successful acceptance.');process.exitCode=1});
