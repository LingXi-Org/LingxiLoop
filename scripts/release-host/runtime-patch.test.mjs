import test from 'node:test'
import assert from 'node:assert/strict'
import {validateRuntimePatch,runtimePatchPlanHash,assertRuntimePatchResult} from './runtime-patch.mjs'
import {patchFixture,databaseFixture} from './fixtures/runtime-patch.mjs'
test('runtime patch requires precise immutable source/target full inventory and formal SDK13 provenance',()=>{
 const db=databaseFixture();assert.equal(validateRuntimePatch(db),db.runtimePatch)
 for(const mutate of [p=>p.target.migrations[0].checksum='f'.repeat(64),p=>p.source.runtime='3.8.11',p=>p.target.tarball='https://arbitrary.invalid/sdk',p=>p.target.command='sh',p=>p.source.migrations.pop(),p=>p.target.protocol=12]){const bad=structuredClone(db);mutate(bad.runtimePatch);assert.throws(()=>validateRuntimePatch(bad),{code:'INVALID_RUNTIME_PATCH'})}
})
test('runtime patch responses bind exact action, full plan hash and observed target provenance',()=>{
 const patch=patchFixture(),planHash=runtimePatchPlanHash(patch),base={source:'3.8.12',target:'3.8.13',schema:14,product:57,planHash,action:'observe',observationOnly:true}
 assert.equal(assertRuntimePatchResult({...base,state:'source',complete:false},patch,'observe').state,'source')
 assert.equal(assertRuntimePatchResult({...base,state:'target',complete:true},patch,'observe').complete,true)
 for(const change of [{planHash:'sha256:'+'0'.repeat(64)},{state:'source',complete:true},{observationOnly:false},{action:'apply'},{unexpected:'untrusted diagnostic'}])assert.throws(()=>assertRuntimePatchResult({...base,state:'target',complete:true,...change},patch,'observe'),{code:'RUNTIME_PATCH_OUTCOME_UNRESOLVED'})
})
