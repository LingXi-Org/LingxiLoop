// Local synthetic verification only; never import product startup or contact production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {perform} from './draft.mjs';
function fixture(mode='execute'){
 const emitted=[],counts={migrate:0,reindex:0,doctor:0},p={mode,emit:e=>emitted.push(structuredClone(e)),checkBudget(){},isDenied:e=>e?.code==='forbidden'};
 p.db={async query(sql){
  if(sql.includes('discovered_total'))return {rows:[{tenant_id:'synthetic-tenant',principal_id:'synthetic-owner',run_id:'synthetic-run',native_matches:true,binding_matches:true,cancelled:false,discovered_total:1}]};
  if(sql.includes('documents_without_usable_source'))return {rows:[{documents_without_usable_source:0}]};
  if(sql.includes('baseline_total'))return {rows:[{baseline_total:1,no_longer_present:0,still_legacy:mode==='execute'?0:1,now_stable:mode==='execute'?1:0,other_scope:0}]};
  return {rows:[{tenant_id:'synthetic-tenant',id:'synthetic-doc',scope_type:'learner',total:1}]};
 }};
 p.readRunReference=async()=>({tenantId:'synthetic-tenant',principalId:'synthetic-owner',runId:'synthetic-run',agentId:'synthetic-agent',sessionId:'synthetic-session',threadId:'synthetic-thread'});
 p.memory={
  async scopes(){return ['first','second'].map(scopeId=>({tenantId:'synthetic-tenant',scopeType:'learner',scopeId}))},
  async migrateLegacy(_i,{dryRun}){counts.migrate++;return {items:[{id:'synthetic-doc',from:{scopeType:'learner'},outcome:dryRun?'eligible':'migrated'}],nextCursor:null}},
  async doctor(){counts.doctor++;return {index:{key:'a'.repeat(64),eligible:1,indexed:0},diagnostics:{secret:'MUST_NOT_OUTPUT'}}},
  async reindex(){counts.reindex++;return {configured:true,queued:1}}
 };
 return {p,emitted,counts};
}
test('status performs no migration/reindex and does not confuse empty authorization with indexing completion',async()=>{
 const f=fixture('status');f.p.memory.scopes=async()=>[];
 const r=await perform(f.p);assert.equal(f.counts.migrate,0);assert.equal(f.counts.reindex,0);assert.equal(r.indexingCompleteForAuthorizedScopes,false);assert.equal(r.legacyInspectionPerformed,false);
});
test('current permission denial yields no migration or reindex and no fabricated identity',async()=>{
 const f=fixture();f.p.memory.scopes=async()=>{throw {code:'forbidden'}};
 const r=await perform(f.p);assert.equal(r.coverage.revoked,1);assert.equal(r.coverage.authorized,0);assert.equal(f.counts.migrate,0);assert.equal(f.counts.reindex,0);assert.equal(r.globalCoverageClaimed,false);
});
test('malformed reindex acknowledgement is uncertain',async()=>{
 const f=fixture();f.p.memory.reindex=async()=>({configured:true,queued:'1'});
 await assert.rejects(perform(f.p),e=>e.maintenanceMutationUncertain===true);
});
test('confirmed first reindex scope remains in aggregate progress after later unknown result',async()=>{
 const f=fixture();let n=0;f.p.memory.reindex=async()=>{if(++n===2)throw Error('SYNTHETIC_PROVIDER_SECRET');return {configured:true,queued:1}};
 await assert.rejects(perform(f.p),e=>e.maintenanceMutationUncertain===true&&!String(e).includes('SYNTHETIC_PROVIDER_SECRET'));
 const progress=f.emitted.filter(e=>e.phase==='reindex-progress').at(-1);
 assert.equal(progress?.counts.scopesAttempted,1);assert.equal(progress?.counts.queued,1);
 assert.ok(!JSON.stringify(f.emitted).includes('synthetic-doc'));assert.ok(!JSON.stringify(f.emitted).includes('MUST_NOT_OUTPUT'));
});
test('queue success is explicit authorized coverage only and never provider completion',async()=>{
 const f=fixture(),r=await perform(f.p);
 assert.equal(r.queue.queued,2);assert.equal(r.queue.scopesAttempted,2);assert.equal(r.indexingCompleteForAuthorizedScopes,false);assert.equal(r.globalCoverageClaimed,false);assert.equal(r.migration.migratedDistinct,1);
 assert.ok(!JSON.stringify(f.emitted).includes('synthetic-doc'));assert.ok(!JSON.stringify(f.emitted).includes('MUST_NOT_OUTPUT'));
});
