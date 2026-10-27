import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import { assertCurrentRuntimeProfile, assertFull54InstallBoundary, assertLockedRuntimePackage, assertMigrationRuntime, PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'
import { assertRuntimePatchDescriptors,loadRuntimePatchInventory,runtimePatchPlanHash,readRuntimePatchBarrier,applyPublishedRuntimePatch,observePublishedRuntimePatch } from '../db/runtime-patch.js'
import {parseRuntimePatchInput} from '../runtime-patch-bin.js'

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

test('case deletion product57 accepts complete product upgrades without admitting partial history',()=>{
  for(const count of [0,54,55,56,57]) assert.doesNotThrow(()=>assertFull54InstallBoundary(count,'3.8.12',57))
  for(const count of [1,10,49,53,58]) assert.throws(()=>assertFull54InstallBoundary(count,'3.8.12',57),/historical package/)
  assert.throws(()=>assertFull54InstallBoundary(57,'3.8.12',56),/historical package/)
})

const currentMigrations=readdirSync(new URL('../db/migrations/',import.meta.url)).sort().map(file=>({
 version:Number(file.slice(0,4)),name:file.slice(5,-4),checksum:createHash('sha256').update(readFileSync(new URL('../db/migrations/'+file,import.meta.url))).digest('hex'),
}))
const migrations57=currentMigrations.slice(0,57)
const source57={runtime:'3.8.12',schema:14,protocol:11,schemaHash:PUBLIC_PURPOSE_SCHEMA_HASH,productVersion:57,migrations:migrations57}
const target57={...source57,runtime:'3.8.14'}
test('product57 exact12 to14 descriptors retain the real named57 prefix while the production checkout must be exactly57',async()=>{
 assert.doesNotThrow(()=>assertRuntimePatchDescriptors(source57,target57))
 assert.equal(migrations57.length,57)
 if(currentMigrations.length===57)assert.deepEqual(await loadRuntimePatchInventory(57),migrations57)
 else{
  await assert.rejects(loadRuntimePatchInventory(57),/Runtime patch requires complete product57 inventory/)
  assert.throws(()=>assertRuntimePatchDescriptors({...source57,migrations:currentMigrations},{...target57,migrations:currentMigrations}),/complete product57/)
 }
})
test('product57 CAS refuses other runtime transitions, partial/renamed/rewritten inventory and schema drift',()=>{
 for(const mutate of [(d:typeof target57)=>{d.runtime='3.8.15'},(d:typeof target57)=>{d.productVersion=56},
  (d:typeof target57)=>{d.migrations.pop()},(d:typeof target57)=>{d.migrations[0].name='renamed'},
  (d:typeof target57)=>{d.migrations[0].checksum='b'.repeat(64)},(d:typeof target57)=>{d.schema=15},
  (d:typeof target57)=>{d.protocol=12},(d:typeof target57)=>{d.schemaHash='b'.repeat(64)}]){
  const bad=structuredClone(target57);mutate(bad);assert.throws(()=>assertRuntimePatchDescriptors(source57,bad))
 }
 assert.throws(()=>assertRuntimePatchDescriptors({...source57,runtime:'3.8.11'},target57))
 assert.throws(()=>assertRuntimePatchDescriptors(target57,source57))
})
const published57={...target57,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.14/'+'a'.repeat(40)}
test('fixed product57 CLI accepts only complete source/target descriptors, with no SQL, argv, URL or file inputs',()=>{
 const input={source:source57,target:published57}
 assert.deepEqual(parseRuntimePatchInput(JSON.stringify(input)),input)
 for(const change of [(d:typeof input&{command?:string})=>{d.command='SQL'},
  (d:typeof input)=>{d.target.tarball='https://other.invalid/package'},
  (d:typeof input)=>{d.target.integrity='sha512-not-integrity'},
  (d:typeof input)=>{d.target.migrations[0].name="x'; DROP TABLE"},
  (d:typeof input)=>{d.source.runtime='3.8.14'}]){
  const bad=structuredClone(input);change(bad);assert.throws(()=>parseRuntimePatchInput(JSON.stringify(bad)))
 }
 assert.throws(()=>parseRuntimePatchInput(' '.repeat(64*1024+1)))
})
test('runtime patch identity binds the same exact expected source/target independent of JSON key order',()=>{
 const reversed=Object.fromEntries(Object.entries(published57).reverse()) as typeof published57
 assert.equal(runtimePatchPlanHash(source57,published57),runtimePatchPlanHash(source57,reversed))
 assert.notEqual(runtimePatchPlanHash(source57,published57),runtimePatchPlanHash(source57,{...published57,integrity:'sha512-different'}))
})
test('product57 barrier refuses hidden, absent or active lease/checkpoint/client evidence',async()=>{
 const state={visible:true,prepared:0,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,incompatibleRuns:0,otherClients:0}
 const client=(row:Record<string,unknown>)=>({query:async()=>({rows:[row]})}) as unknown as Parameters<typeof readRuntimePatchBarrier>[0]
 await readRuntimePatchBarrier(client(state),true)
 for(const change of [{visible:false},{otherClients:1},{otherClients:undefined},{prepared:undefined},{liveWork:-1}])await assert.rejects(readRuntimePatchBarrier(client({...state,...change}),true))
 // Active counters are returned to the transaction, which requires all zero.
 assert.equal((await readRuntimePatchBarrier(client({...state,incompatibleRuns:1}),true)).incompatibleRuns,1)
})
test('fixed CLI rejects extra actions and missing maintenance authorization before a database connection, without private output',()=>{
 const script=fileURLToPath(new URL('../runtime-patch-bin.ts',import.meta.url))
 for(const args of [['exec','private-marker'],['observe','--url','private-marker'],['apply']]){
  try{
   execFileSync(process.execPath,['--import','tsx',script,...args],{input:JSON.stringify({source:source57,target:published57}),encoding:'utf8',env:{...process.env,DATABASE_URL:'postgres://private-marker@127.0.0.1:1/runtime_patch_test',LINGXIOS_SCHEMA_UPGRADE_DRAINED:''},stdio:['pipe','pipe','pipe']})
   assert.fail('CLI should refuse')
  }catch(error){
   const result=error as {status?:number;stdout?:string;stderr?:string}
   assert.equal(result.status,1)
   assert.deepEqual(JSON.parse(result.stdout??''),{error:{code:'RUNTIME_PATCH_REFUSED',uncertain:false,outcomeKnown:true,observationRequired:false}})
   assert.doesNotMatch(String(result.stdout)+String(result.stderr),/private-marker|postgres:\/\//)
  }
 }
})
test('formal package proof rejects a fixture lock/integrity before opening a database for apply or observation',async()=>{
 const database={connect:async()=>{assert.fail('unqualified package must never connect')}} as unknown as Parameters<typeof applyPublishedRuntimePatch>[0]
 const rejected=/Exact formal runtime patch package\/locks required|exact formal runtime package and matching root\/server manifests\/locks required/
 await assert.rejects(applyPublishedRuntimePatch(database,source57,published57),rejected)
 await assert.rejects(observePublishedRuntimePatch(database,source57,published57),rejected)
})

test('product58 upgrade accepts the complete SDK14 product57 predecessor and refuses partial or later history',()=>{
 for(const count of [0,54,55,56,57,58])assert.doesNotThrow(()=>assertFull54InstallBoundary(count,'3.8.14',58))
 for(const count of [1,49,53,59])assert.throws(()=>assertFull54InstallBoundary(count,'3.8.14',58),/historical package/)
})

const source58={...source57,runtime:'3.8.14',productVersion:58,migrations:currentMigrations}
const target58={...source58,runtime:'3.8.15'}

test('product58 exact15 to16 CAS preserves the full named ledger and rejects unreviewed pairs',()=>{
 const source={...source58,runtime:'3.8.15'},target={...target58,runtime:'3.8.16'}
 assert.doesNotThrow(()=>assertRuntimePatchDescriptors(source,target))
 const published={...target,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.16/'+'a'.repeat(40)}
 assert.deepEqual(parseRuntimePatchInput(JSON.stringify({source,target:published})),{source,target:published})
 for(const mutate of [(d:typeof target)=>{d.runtime='3.8.17'},(d:typeof target)=>{d.productVersion=57},(d:typeof target)=>{d.protocol=12},(d:typeof target)=>{d.migrations[0].name='changed'},(d:typeof target)=>{d.migrations.pop()}]){
  const bad=structuredClone(target);mutate(bad);assert.throws(()=>assertRuntimePatchDescriptors(source,bad))
 }
 assert.throws(()=>assertRuntimePatchDescriptors({...source,runtime:'3.8.14'},target))
})
test('product58 exact14 to15 CAS requires complete unchanged named58 inventory and original protocol',async()=>{
 assert.deepEqual(await loadRuntimePatchInventory(58),currentMigrations)
 assert.doesNotThrow(()=>assertRuntimePatchDescriptors(source58,target58))
 const target={...target58,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.15/'+'a'.repeat(40)}
 assert.deepEqual(parseRuntimePatchInput(JSON.stringify({source:source58,target})),{source:source58,target})
 for(const mutate of [(d:typeof target58)=>{d.runtime='3.8.16'},(d:typeof target58)=>{d.productVersion=57},(d:typeof target58)=>{d.protocol=12},(d:typeof target58)=>{d.migrations[0].name='changed'},(d:typeof target58)=>{d.migrations.pop()}]){
  const bad=structuredClone(target58);mutate(bad);assert.throws(()=>assertRuntimePatchDescriptors(source58,bad))
 }
 assert.throws(()=>assertRuntimePatchDescriptors({...source58,runtime:'3.8.13'},target58))
})
