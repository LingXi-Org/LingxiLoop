import test from 'node:test';
import assert from 'node:assert/strict';
import{EventEmitter}from'node:events';
import{perform,summarize,cleanupResources,closeBusinessRedis}from'./draft.mjs';
test('eligible across any identity excludes document from isolation reasons',()=>{
 const records=new Map([['one',{type:'learner',eligible:true,migrated:false,reasons:new Set(['ownership_or_audience_not_proven'])}],['two',{type:'course',eligible:false,migrated:false,reasons:new Set(['ownership_or_audience_not_proven'])}]]);
 const r=summarize(records);assert.equal(r.isolatedDistinct,1);assert.equal(r.isolationReasonDistinctDocuments.ownership_or_audience_not_proven,1);
});
test('cleanup is ordered and confirms all resources',async()=>{
 const calls=[],events=[];await cleanupResources({stop:async()=>calls.push('control'),disconnect:async()=>calls.push('redis'),close:async()=>calls.push('postgres'),emit:e=>events.push(e),timeoutMs:50});
 assert.deepEqual(calls,['control','redis','postgres']);assert.equal(events.filter(e=>e.status==='complete').length,3);
});
test('cleanup failure attempts remaining resources and never succeeds',async()=>{
 const calls=[],events=[];await assert.rejects(cleanupResources({stop:async()=>{throw Error('private')},disconnect:async()=>calls.push('redis'),close:async()=>calls.push('postgres'),emit:e=>events.push(e),timeoutMs:50}));
 assert.deepEqual(calls,['redis','postgres']);assert.equal(events.some(e=>e.status==='failed'),true);assert.ok(!JSON.stringify(events).includes('private'));
});
test('cleanup bounded timeout remains failure',async()=>{
 let closed=false;await assert.rejects(cleanupResources({stop:()=>new Promise(()=>{}),close:async()=>{closed=true},emit(){},timeoutMs:10}));assert.equal(closed,true);
});
test('owned Redis connections disconnect and reach end',async()=>{
 class Client extends EventEmitter{status='ready';disconnect(){this.status='end';this.emit('end')}}
 const clients=[new Client(),new Client()];await closeBusinessRedis(clients);assert.ok(clients.every(c=>c.status==='end'));
});
function fixture(mode='execute',identityCount=25){
 let migrated=false;const emitted=[],counts={migrate:0,reindex:0};
 const p={mode,emit:e=>emitted.push(e),checkBudget(){},isDenied:()=>false};
 p.db={async query(sql){if(sql.includes('discovered_total'))return{rows:Array.from({length:identityCount},(_,i)=>({tenant_id:'t',principal_id:'p',run_id:String(i),native_matches:true,binding_matches:true,cancelled:false,discovered_total:identityCount}))};if(sql.includes('documents_without_usable_source'))return{rows:[{documents_without_usable_source:0}]};if(sql.includes('baseline_total'))return{rows:[{baseline_total:0,no_longer_present:0,still_legacy:0,now_stable:0,other_scope:0}]};return{rows:[]}}};
 p.readRunReference=async(_,t,r)=>({tenantId:t,principalId:'p',runId:r});
 p.memory={async scopes(i){return Array.from({length:12},(_,j)=>({tenantId:'t',scopeType:'learner',scopeId:String((Number(i.workId)+j)%31)}))},async migrateLegacy(i,{dryRun}){counts.migrate++;if(!dryRun)migrated=true;return{items:[{id:'private-doc'+i.workId,from:{scopeType:'learner'},outcome:Number(i.workId)<5?(dryRun?'eligible':'migrated'):'isolated',...(Number(i.workId)<5?{}:{reason:'ownership_or_audience_not_proven'})}],nextCursor:null}},async doctor(){return{index:{key:'a'.repeat(64),eligible:1,indexed:0}}},async reindex(){counts.reindex++;return{configured:true,queued:1}}};
 return{p,emitted,counts,get migrated(){return migrated}};
}
test('25 identities31 scopes completes within bounded call budget',async()=>{
 const f=fixture();const r=await perform(f.p);assert.equal(r.coverage.scanComplete,25);assert.equal(r.authorizedIndex.scopes,31);assert.equal(r.migration.migratedDistinct,5);assert.ok(r.apiCalls<=512);assert.equal(f.counts.reindex,31);
});
test('oversized conservative execute plan fails before non-dry mutation',async()=>{
 const f=fixture('execute',64);await assert.rejects(perform(f.p));assert.equal(f.migrated,false);assert.equal(f.counts.reindex,0);
});
