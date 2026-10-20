import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSeedUpdate,assertFreshSeedUpdate,validateSeedReceipt,hash,BINDINGS} from './seed-contract.mjs';
const id='a'.repeat(24),core='b'.repeat(24),at=Date.parse('2026-10-21T00:00:00.000Z');
const marker={readOnly:true,fullVisibility:true,canonicalSha256:BINDINGS.canonicalSha256,counts:{missing:0,mismatched:0,plans:1,entitlements:8,planEntitlements:8},equal:true};
function update(value=marker){return {_id:{$oid:id},operation:'RunStackService',target:{type:'Stack',id:core},status:'Complete',success:true,start_ts:at+100,end_ts:at+200,logs:[{stdout:'NATIVE14_SEED_CHECK='+JSON.stringify(value)+'\n'}]};}
const options={expectedId:id,coreStackId:core};
test('one exact terminal accepts only the canonical aggregate',()=>{const p=parseSeedUpdate(update(),options);assert.deepEqual(p.counts,marker.counts);assertFreshSeedUpdate(update(),structuredClone(update()),options)});
test('wrong identity, duplicate marker and extra output field fail closed',()=>{
 for(const edit of [u=>u.target.id='c'.repeat(24),u=>u.operation='DeployStackService',u=>u.logs.push(u.logs[0]),u=>u.success=false,u=>u.status='InProgress']){
  const u=update();edit(u);assert.throws(()=>parseSeedUpdate(u,options));
 }
 assert.throws(()=>parseSeedUpdate(update({...marker,secret:'do not log'}),options));
});
test('known drift is parsed but not declared equal; inconsistent aggregates fail',()=>{
 const d={...marker,equal:false,counts:{missing:1,mismatched:0,plans:0,entitlements:8,planEntitlements:8}};
 assert.equal(parseSeedUpdate(update(d),options).equal,false);
 assert.throws(()=>parseSeedUpdate(update({...d,equal:true}),options));
 assert.throws(()=>parseSeedUpdate(update({...marker,counts:{...marker.counts,mismatched:18}}),options));
});
test('fresh terminal must preserve success, identity, times and aggregate',()=>{
 for(const edit of [u=>u.end_ts++,u=>u.start_ts++,u=>u._id.$oid='d'.repeat(24),u=>u.logs[0].stdout=u.logs[0].stdout.replace('"mismatched":0','"mismatched":1')]){
  const fresh=update();edit(fresh);assert.throws(()=>assertFreshSeedUpdate(update(),fresh,options));
 }
});
function fixture(){
 const plan={source:{sha:BINDINGS.source},target:{sha:'e'.repeat(40)},planHash:'1'.repeat(64),sourceAcceptanceSha256:'2'.repeat(64)},planRaw=JSON.stringify(plan);
 const g={configHashes:Object.fromEntries(['lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state'].map(s=>[s,'3'.repeat(64)])),containersSha256:'4'.repeat(64)};
 const events=[{phase:'guard',status:'verified'},...['submitting','pending','complete'].map((status,i)=>({phase:'komodo',status,stack:'lingxiloop-core-state',operation:'RunStackService',...(i?{updateId:id}:{})})),{phase:'guard',status:'verified'},{phase:'seed',status:'complete'}].map((e,i)=>({...e,observedAt:new Date(at+i*50).toISOString()}));
 return {plan,planRaw,receipt:{format:'native14-seed-precheck-receipt/v1',verified:true,outcome:'complete',planHash:plan.planHash,planSha256:hash(planRaw),source:BINDINGS.source,target:plan.target.sha,reviewedTarget:BINDINGS.reviewedTarget,driverCommit:BINDINGS.driverCommit,sqlSha256:BINDINGS.sqlSha256,canonicalSha256:BINDINGS.canonicalSha256,provenanceSha256:BINDINGS.provenanceSha256,sourceAcceptanceSha256:plan.sourceAcceptanceSha256,sourceProductionSha256:'5'.repeat(64),startedAt:new Date(at).toISOString(),finishedAt:new Date(at+300).toISOString(),...parseSeedUpdate(update(),options),guards:{before:g,after:structuredClone(g),unchanged:true},events},executionStartedAt:new Date(at+1000).toISOString(),coreStackId:core};
}
test('actual receipt validator positive and boundary counterexamples',()=>{
 const f=fixture();assert.equal(validateSeedReceipt(f),true);
 for(const edit of [x=>x.receipt.verified=false,x=>x.receipt.planSha256='6'.repeat(64),x=>x.receipt.guards.after.containersSha256='7'.repeat(64),x=>x.receipt.target='f'.repeat(40),x=>x.coreStackId='c'.repeat(24),x=>x.executionStartedAt=new Date(at+1800301).toISOString(),x=>x.executionStartedAt=new Date(at+299).toISOString(),x=>x.receipt.events=[],x=>x.receipt.events[2].status='uncertain',x=>x.receipt.events[3].updateId='c'.repeat(24)]){
  const bad=structuredClone(f);edit(bad);assert.throws(()=>validateSeedReceipt(bad));
 }
});
test('SQL is bounded read-only and contains no write or call statement',()=>{
 const sql=readFileSync(new URL('./seed-check.sql',import.meta.url),'utf8');
 assert.equal(hash(sql),BINDINGS.sqlSha256);
 assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
 assert.match(sql,/SET LOCAL row_security=off;/);
 assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|CALL|GRANT|REVOKE)\b/i);
});
