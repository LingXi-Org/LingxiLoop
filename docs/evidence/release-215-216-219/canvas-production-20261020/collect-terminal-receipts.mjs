import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createTransport,parseMarker,validateStateReceipt} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
import {validateHostPlanShape,assertCompatibleState,metadataKeys} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release.mjs';
import {EXPECTED} from './probe-before-drain.mjs';
export const DIR='/tmp/lingxi-canvas-release-20261020',APPS=['lingxiloop-app-a','lingxiloop-app-b'],CORE='lingxiloop-core-state';
export const hash=b=>createHash('sha256').update(b).digest('hex');
const ID=/^[a-f0-9]{24}$/,HEX=/^[a-f0-9]{64}$/;
const operations={PullStack:'PullStackService',StopStack:'StopStackService',DeployStack:'DeployStackService',RunStackService:'RunStackService',WriteStackFileContents:'WriteStackContents'};
export function expectedUpdates(plan,prep,execution){
 validateHostPlanShape(plan);
 const records=[];
 for(const [name,value] of [['image-preparation.json',prep],['release-execution.json',execution]]){
  assert.equal(value.planHash,plan.planHash);assert.equal(value.complete,true);assert.ok(Array.isArray(value.events)&&value.events.length>0);
  const done=value.events.at(-1);assert.equal(done.phase,'complete');assert.equal(done.status,'complete');assert.equal(done.planHash,plan.planHash);
  assert.equal(value.events.filter(e=>e.phase==='complete').length,1);
  if(name==='image-preparation.json')assert.equal(done.mode,'online-images-only');
  let active;
  for(const [index,e] of value.events.entries()){
   assert.ok(!['failed','uncertain'].includes(e.status),'Failed or unresolved input');
   if(e.phase!=='komodo')continue;
   assert.ok(operations[e.operation]&&[...APPS,CORE].includes(e.stack),'Unexpected operation');
   if(e.status==='submitting'){assert.equal(active,undefined);active={operation:e.operation,stack:e.stack};}
   else if(e.status==='pending'){assert.ok(active&&!active.id&&ID.test(e.updateId));assert.equal(e.operation,active.operation);assert.equal(e.stack,active.stack);active.id=e.updateId;}
   else if(e.status==='complete'){
    assert.ok(active&&active.id===e.updateId);assert.equal(e.operation,active.operation);assert.equal(e.stack,active.stack);
    records.push({input:name,index,id:e.updateId,stack:e.stack,requestOperation:e.operation,operation:operations[e.operation]});active=undefined;
   }else assert.fail('Unexpected progress status');
  }
  assert.equal(active,undefined,'Unresolved final submission');
 }
 assert.equal(new Set(records.map(r=>r.id)).size,records.length,'Duplicate update');
 const selected=name=>records.filter(r=>r.input===name),a=APPS[0],b=APPS[1];
 const tuples=rows=>rows.filter(r=>r.requestOperation!=='RunStackService').map(r=>[r.requestOperation,r.stack]);
 assert.deepEqual(tuples(selected('image-preparation.json')),[['WriteStackFileContents',a],['PullStack',a],['WriteStackFileContents',a],['WriteStackFileContents',b],['PullStack',b],['WriteStackFileContents',b]]);
 assert.deepEqual(tuples(selected('release-execution.json')),[['WriteStackFileContents',a],['WriteStackFileContents',b],['StopStack',a],['StopStack',b],['DeployStack',a],['DeployStack',b],['DeployStack',a],['DeployStack',b]]);
 const used=new Set();
 for(const [phase,status,op,expected] of [['drain','stopped','StopStack',[[a,'worker'],[b,'worker']]],['rollout','healthy','DeployStack',[[a,'lingxiloop'],[b,'lingxiloop'],[a,'worker'],[b,'worker']]]]){
  const markers=execution.events.map((e,index)=>({...e,index})).filter(e=>e.phase===phase&&e.status===status);
  assert.deepEqual(markers.map(e=>[e.stack,e.service]),expected);
  for(const e of markers){const r=selected('release-execution.json').filter(r=>r.index<e.index&&r.requestOperation===op).at(-1);assert.ok(r&&r.requestOperation===op&&r.stack===e.stack&&!used.has(r.id));used.add(r.id);r.service=e.service;
   if(op==='DeployStack'){assert.ok(HEX.test(e.containerId??'')&&/^sha256:[a-f0-9]{64}$/.test(e.imageId??''));r.containerId=e.containerId;r.imageId=e.imageId;}
  }
 }
 const probes=execution.events.map((e,index)=>({...e,index})).filter(e=>e.phase==='candidate-native-probe');
 assert.deepEqual(probes.map(e=>e.stack),APPS);
 const firstStop=execution.events.findIndex(e=>e.phase==='komodo'&&e.status==='submitting'&&e.operation==='StopStack');assert.ok(firstStop>=0);
 for(const e of probes){
  assert.equal(e.status,'verified');assert.equal(e.terminalReadback,true);assert.equal(e.originalContainersUnchanged,true);
  assert.deepEqual(Object.fromEntries(Object.keys(EXPECTED).map(k=>[k,e[k]])),EXPECTED);
  const r=records.find(r=>r.id===e.updateId);assert.ok(r&&r.input==='release-execution.json'&&r.requestOperation==='RunStackService'&&r.stack===e.stack&&r.index<e.index&&e.index<firstStop);r.kind='native-probe';r.service='db-migrate';
 }
 for(const name of ['image-preparation.json','release-execution.json']){
  const rows=selected(name),runs=rows.filter(r=>r.requestOperation==='RunStackService');
  if(name==='image-preparation.json')assert.deepEqual(runs.map(r=>r.stack),[CORE,CORE]);
  else{assert.equal(runs.filter(r=>r.stack===CORE).length,16);for(const stack of APPS){const app=runs.filter(r=>r.stack===stack);assert.equal(app.length,2);assert.equal(app[1].kind,'native-probe');assert.equal(app[0].kind,undefined);app[0].kind='metadata';app[0].service='db-migrate';}}
  for(const r of runs.filter(r=>r.stack===CORE)){r.kind='state';r.service='postgres';}
  for(const r of rows.filter(r=>r.requestOperation==='PullStack'))r.service='db-migrate';
 }
 const release=selected('release-execution.json'),last=release.at(-1);assert.equal(last.kind,'state');assert.equal(last.stack,CORE);last.finalState=true;
 const done=execution.events.at(-1);assertCompatibleState(done.state,plan.target);
 const rollout=release.filter(r=>r.requestOperation==='DeployStack');assert.equal(done.containers?.length,4);
 for(const r of rollout){const rows=done.containers.filter(c=>c.stack===r.stack&&c.service===r.service);assert.equal(rows.length,1);assert.equal(rows[0].id,r.containerId);assert.equal(rows[0].imageId,r.imageId);}
 return records;
}
export function verifyUpdate(u,r,stackIds,plan,execution){
 assert.ok(ID.test(stackIds[r.stack]??''));assert.equal(u?._id?.$oid,r.id);assert.equal(u.operation,r.operation);assert.deepEqual(u.target,{type:'Stack',id:stackIds[r.stack]});
 assert.equal(u.status,'Complete');assert.equal(u.success,true);assert.ok(Number.isFinite(u.start_ts)&&Number.isFinite(u.end_ts)&&u.start_ts>0&&u.end_ts>=u.start_ts);
 const row={...r,target:u.target,status:u.status,success:u.success,startTs:u.start_ts,endTs:u.end_ts,durationMs:u.end_ts-u.start_ts};
 if(r.kind==='native-probe'){
  const prefix='CANDIDATE_NATIVE_PROBE=',lines=(u.logs??[]).flatMap(x=>typeof x.stdout==='string'?x.stdout.split(/\r?\n/):[]).filter(x=>x.startsWith(prefix));
  assert.equal(lines.length,1);assert.ok(lines[0].length<4096);row.probe=JSON.parse(lines[0].slice(prefix.length));assert.deepEqual(row.probe,EXPECTED);
 }else if(r.kind==='metadata'){
  row.metadata=parseMarker(u,'METADATA');assert.deepEqual(row.metadata,Object.fromEntries(metadataKeys.map(k=>[k,plan.target[k]])));
 }else if(r.kind==='state'){
  row.state=validateStateReceipt(parseMarker(u,'STATE'));assertCompatibleState(row.state,plan.target);
  if(r.finalState)assert.deepEqual(row.state,execution.events.at(-1).state);
 }
 return row;
}
export async function collect({plan,prep,execution,read,inputs}){
 const expected=expectedUpdates(plan,prep,execution),stackIds={};
 for(const {stack} of plan.stacks){const s=await read('GetStack',{stack});assert.ok(ID.test(s?._id?.$oid??''));stackIds[stack]=s._id.$oid;}
 assert.equal(new Set(Object.values(stackIds)).size,3);
 const out={startedAt:new Date().toISOString(),planHash:plan.planHash,inputs,stackIds,updates:[],verified:false};
 for(const r of expected)out.updates.push(verifyUpdate(await read('GetUpdate',{id:r.id}),r,stackIds,plan,execution));
 out.verified=true;out.finishedAt=new Date().toISOString();return out;
}
async function main(){
 const names=['plan.json','image-preparation.json','release-execution.json'],raw=await Promise.all(names.map(n=>readFile(DIR+'/'+n))),[plan,prep,execution]=raw.map(b=>JSON.parse(b));
 const path=DIR+'/terminal-receipts.json';await writeFile(path,JSON.stringify({verified:false,status:'reading',planHash:plan.planHash})+'\n',{flag:'wx',mode:0o600});
 try{const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET});const out=await collect({plan,prep,execution,read:t.read,inputs:names.map((name,i)=>({name,sha256:hash(raw[i])}))});await writeFile(path,JSON.stringify(out,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({verified:true,count:out.updates.length}));}
 catch{await writeFile(path,JSON.stringify({verified:false,status:'failed-or-unresolved',planHash:plan.planHash,noAutomaticRetry:true})+'\n',{mode:0o600});throw Error('Terminal evidence not verified');}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Terminal receipt collection failed; no successful acceptance.');process.exitCode=1});
