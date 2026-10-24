import assert from 'node:assert/strict'
import test from 'node:test'
import { assertCurrentRuntimeProfile, assertFull54InstallBoundary, assertLockedRuntimePackage, assertMigrationRuntime, PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'
import { assertRuntimePatchDescriptors } from '../db/runtime-patch.js'

const current={runtime:'3.8.3',schema:14,controlPlane:11,publicText:2,runTrace:1}
test('full54 runtime profile binds the exact current package and retains historical gates',()=>{
  assert.doesNotThrow(()=>assertCurrentRuntimeProfile(current,PUBLIC_PURPOSE_SCHEMA_HASH,'3.8.3'))
  for(const value of [{...current,runtime:'3.8.4'},{...current,schema:15},{...current,controlPlane:12},
    {...current,publicText:1},{...current,runTrace:2}])assert.throws(()=>assertCurrentRuntimeProfile(value,PUBLIC_PURPOSE_SCHEMA_HASH,'3.8.3'))
  assert.throws(()=>assertCurrentRuntimeProfile(current,'a'.repeat(64),'3.8.3'))
  assert.throws(()=>assertMigrationRuntime(true,true,current,PUBLIC_PURPOSE_SCHEMA_HASH,true,true),/0053 requires/)
})
test('current patch initialization accepts only empty or already complete history; partial history keeps its historical gate',()=>{
  for(const count of [0,54])assert.doesNotThrow(()=>assertFull54InstallBoundary(count,'3.8.3'))
  for(const count of [1,9,10,49,53])assert.throws(()=>assertFull54InstallBoundary(count,'3.8.3'),/historical package/)
  assert.doesNotThrow(()=>assertFull54InstallBoundary(53,'3.8.2'))
})
test('formal current package proof rejects actual module, manifest, root/server lock and registry mismatches',()=>{
 const key='@lyyzka/lingxios',runtime='3.8.3',entry={version:runtime,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),resolved:`https://npm.pkg.github.com/download/${key}/${runtime}/fixture`}
 const manifest={dependencies:{[key]:runtime}},lock={packages:{'':manifest,['node_modules/'+key]:entry}}
 const files:Parameters<typeof assertLockedRuntimePackage>[0]=[lock,structuredClone(lock),manifest,structuredClone(manifest)]
 assert.deepEqual(assertLockedRuntimePackage(files,runtime),{runtime,integrity:entry.integrity,tarball:entry.resolved})
 assert.throws(()=>assertLockedRuntimePackage(files,'3.8.2'))
 for(const change of [()=>{files[1].packages!['node_modules/'+key].version='3.8.4'},
  ()=>{files[2].dependencies![key]='^3.8.3'},()=>{files[0].packages!['node_modules/'+key].resolved='https://other.test/package'}]){
  const before=structuredClone(files);change();assert.throws(()=>assertLockedRuntimePackage(files,runtime));files.splice(0,files.length,...before)
 }
})

test('reader3 current capability belongs to the reviewed3.8.7 boundary, never an old or unknown runtime',()=>{
 for(const runtime of ['3.8.7','3.8.8'])assert.doesNotThrow(()=>assertCurrentRuntimeProfile({...current,runtime,publicText:3},PUBLIC_PURPOSE_SCHEMA_HASH,runtime))
 for(const runtime of ['3.8.2','3.8.5','3.8.6','3.8.7-rc.1','3.9.0'])assert.throws(()=>assertCurrentRuntimeProfile({...current,runtime,publicText:3},PUBLIC_PURPOSE_SCHEMA_HASH,runtime))
 for(const publicText of [undefined,1,2,4])assert.throws(()=>assertCurrentRuntimeProfile({...current,runtime:'3.8.7',publicText},PUBLIC_PURPOSE_SCHEMA_HASH,'3.8.7'))
 assert.throws(()=>assertCurrentRuntimeProfile({...current,runtime:'3.8.7',publicText:3},PUBLIC_PURPOSE_SCHEMA_HASH,'3.8.6'))
 assert.throws(()=>assertMigrationRuntime(true,true,{...current,runtime:'3.8.7',publicText:3},PUBLIC_PURPOSE_SCHEMA_HASH,true,true),/0053 requires/)
})
test('v2 to v3 pure patch descriptors preserve native/product inventories and forbid rollback',()=>{
 const source={runtime:'3.8.5',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:54,
  migrations:Array.from({length:54},(_,i)=>({version:i+1,name:'fixture_'+i,checksum:'a'.repeat(64)}))}
 const target={...source,runtime:'3.8.7'}
 assert.doesNotThrow(()=>assertRuntimePatchDescriptors(source,target))
 for(const change of [(d:typeof target)=>{d.runtime='3.9.0'},(d:typeof target)=>{d.schema=15},(d:typeof target)=>{d.protocol=12},
  (d:typeof target)=>{d.schemaHash='b'.repeat(64)},(d:typeof target)=>{d.migrations[0].checksum='b'.repeat(64)}]){
  const bad=structuredClone(target);change(bad);assert.throws(()=>assertRuntimePatchDescriptors(source,bad))
 }
 assert.throws(()=>assertRuntimePatchDescriptors(target,source))
})

// Product55 adds case tables only; current package provenance remains exact.
test('case-cover product55 accepts empty, complete54 upgrade and55 no-op only',()=>{
  for(const count of [0,54,55]) assert.doesNotThrow(()=>assertFull54InstallBoundary(count,'3.8.11',55))
  for(const count of [1,10,49,53,56]) assert.throws(()=>assertFull54InstallBoundary(count,'3.8.11',55),/historical package/)
  assert.throws(()=>assertFull54InstallBoundary(55,'3.8.11'),/historical package/)
})

test('homework product56 accepts complete55 without weakening historical or runtime patch boundaries',()=>{
  for(const count of [0,54,55,56]) assert.doesNotThrow(()=>assertFull54InstallBoundary(count,'3.8.12',56))
  for(const count of [1,10,49,53,57]) assert.throws(()=>assertFull54InstallBoundary(count,'3.8.12',56),/historical package/)
  assert.throws(()=>assertFull54InstallBoundary(56,'3.8.12',55),/historical package/)
  assert.throws(()=>assertFull54InstallBoundary(56,'3.8.12',54),/historical package/)
  assert.throws(()=>assertMigrationRuntime(true,true,{...current,runtime:'3.8.12',publicText:3},PUBLIC_PURPOSE_SCHEMA_HASH,true,true),/0053 requires/)
})
