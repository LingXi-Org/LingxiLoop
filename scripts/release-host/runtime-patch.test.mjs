import test from 'node:test'
import assert from 'node:assert/strict'
import {validateRuntimePatch,runtimePatchPlanHash,assertRuntimePatchResult} from './runtime-patch.mjs'
import {patchFixture,databaseFixture} from './fixtures/runtime-patch.mjs'
test('runtime patch requires precise immutable source/target full inventory and formal SDK14 provenance',()=>{
 const db=databaseFixture();assert.equal(validateRuntimePatch(db),db.runtimePatch)
 for(const mutate of [p=>p.target.migrations[0].checksum='f'.repeat(64),p=>p.source.runtime='3.8.11',p=>p.target.tarball='https://arbitrary.invalid/sdk',p=>p.target.command='sh',p=>p.source.migrations.pop(),p=>p.target.protocol=12]){const bad=structuredClone(db);mutate(bad.runtimePatch);assert.throws(()=>validateRuntimePatch(bad),{code:'INVALID_RUNTIME_PATCH'})}
})
test('runtime patch responses bind exact action, full plan hash and observed target provenance',()=>{
 const patch=patchFixture(),planHash=runtimePatchPlanHash(patch),base={source:'3.8.12',target:'3.8.14',schema:14,product:57,planHash,action:'observe',observationOnly:true}
 assert.equal(assertRuntimePatchResult({...base,state:'source',complete:false},patch,'observe').state,'source')
 assert.equal(assertRuntimePatchResult({...base,state:'target',complete:true},patch,'observe').complete,true)
 for(const change of [{planHash:'sha256:'+'0'.repeat(64)},{state:'source',complete:true},{observationOnly:false},{action:'apply'},{unexpected:'untrusted diagnostic'}])assert.throws(()=>assertRuntimePatchResult({...base,state:'target',complete:true,...change},patch,'observe'),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED'})
})
test('runtime patch accepts the CI builder full named database inventory and rejects omitted or drifted names',()=>{
 const db=databaseFixture();db.migrations=structuredClone(db.runtimePatch.target.migrations)
 assert.equal(validateRuntimePatch(db),db.runtimePatch)
 for(const mutate of [d=>{delete d.migrations[0].name},d=>{d.migrations[0].name='wrong_name'}]){const bad=structuredClone(db);mutate(bad);assert.throws(()=>validateRuntimePatch(bad),{code:'INVALID_RUNTIME_PATCH'})}
})

test('product58 permits only exact SDK14 to15 with unchanged58 ledger, never a no-backup exception',()=>{
 const db=databaseFixture(58);assert.equal(validateRuntimePatch(db),db.runtimePatch)
 for(const mutate of [d=>d.runtimePatch.source.runtime='3.8.13',d=>d.runtimePatch.target.runtime='3.8.16',d=>d.runtimePatch.target.productVersion=57,d=>d.runtimePatch.target.migrations[0].name='changed',d=>d.runtimePatch.target.migrations.pop(),d=>d.runtimePatch.target.schemaHash='b'.repeat(64),d=>d.rpo='test-data-no-backup']){
  const bad=structuredClone(db);mutate(bad);assert.throws(()=>validateRuntimePatch(bad),{code:'INVALID_RUNTIME_PATCH'})
 }
 const p=db.runtimePatch,result={action:'observe',source:'3.8.14',target:'3.8.15',schema:14,product:58,planHash:runtimePatchPlanHash(p),state:'target',complete:true,observationOnly:true}
 assert.equal(assertRuntimePatchResult(result,p,'observe').complete,true)
 assert.throws(()=>assertRuntimePatchResult({...result,product:57},p,'observe'),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED'})
})

test('product58 SDK15 to16 retains exact package, inventory and backup requirements',()=>{
 const db=databaseFixture(58);db.runtimePatch.source.runtime='3.8.15';db.runtimePatch.target.runtime='3.8.16';db.runtimePatch.target.tarball=db.runtimePatch.target.tarball.replace('/3.8.15/','/3.8.16/')
 assert.equal(validateRuntimePatch(db),db.runtimePatch)
 for(const mutate of [d=>d.runtimePatch.source.runtime='3.8.14',d=>d.runtimePatch.target.runtime='3.8.17',d=>d.runtimePatch.target.productVersion=57,d=>d.runtimePatch.target.migrations[0].name='changed',d=>d.runtimePatch.target.schemaHash='b'.repeat(64),d=>d.runtimePatch.target.tarball=d.runtimePatch.target.tarball.replace('/3.8.16/','/3.8.15/'),d=>d.rpo='test-data-no-backup']){
  const bad=structuredClone(db);mutate(bad);assert.throws(()=>validateRuntimePatch(bad),{code:'INVALID_RUNTIME_PATCH'})
 }
})
