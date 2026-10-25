import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createExecutorServer,claimProcessLock } from './server.mjs'
import { hash, fault, Journal } from './journal.mjs'
import { configurationFingerprint, assertCompatible, validatePolicy } from './adapter.mjs'
import { qualifyDatabaseEvidence } from './local-control.mjs'
import { fixture, baseConfig, policy, contract, newImage, oldImage } from './fixtures/fake-host.mjs'

async function setup(t,options = {}) { const directory = await mkdtemp(join(tmpdir(),'release-host-test-')); const f = fixture(directory,options); t.after(async()=>{ try { f.journal.close() } catch {} await rm(directory,{ recursive:true,force:true }) }); return { ...f,directory } }
async function prepared(f) { assert.equal((await f.run('prepare')).status,'succeeded'); assert.equal((await f.run('drain')).status,'succeeded') }

// Failure-model regressions exercise the journal, actual HTTP and persisted fake Docker side effects.
test('cached source/target are digest verified; offline prepare and apply preserve original project/volume and fixed argv',async t => {
  const f = await setup(t,{ offline:true }); await prepared(f)
  assert.equal((await f.run('apply')).status,'succeeded')
  assert.equal((await f.run('verify')).status,'succeeded')
  assert.equal((await f.run('undrain')).status,'succeeded')
  assert.equal(f.host.data.calls.some(args => args.includes('pull') && args[0] === 'image'),false)
  const updates = f.host.data.calls.filter(args => args.includes('up'))
  assert.deepEqual(updates.map(args => args.at(-1)),['web','worker'])
  for (const args of updates) { assert.ok(args.includes('--no-build')); assert.ok(args.includes('--no-deps')); assert.equal(args[args.indexOf('--pull')+1],'never'); assert.equal(args[args.indexOf('--project-name')+1],'original-project') }
  assert.equal(f.host.data.containers.worker.Mounts[0].Name,'original-homes')
  assert.deepEqual(f.host.data.ingress,{ enabled:true,generation:1 })
})
test('corrupt complete cache refuses reuse without pulling or stopping business',async t => {
  const f = await setup(t,{ corruptCache:true }); const result = await f.run('prepare')
  assert.equal(result.status,'failed'); assert.equal(result.errors.forward.code,'IMAGE_IDENTITY_MISMATCH')
  assert.equal(f.host.data.calls.some(args => args.includes('stop') || args.includes('pull')),false)
})
test('download failure before switch leaves existing services running',async t => {
  const f = await setup(t,{ offline:true }); f.host.data.cache = [oldImage.ref]
  assert.equal((await f.run('prepare')).status,'failed')
  assert.ok(Object.values(f.host.data.containers).every(row => row.State.Running))
})
test('HTTP commits intent before 202; lost response is found by operation key and duplicate never dispatches twice',async t => {
  const f = await setup(t), dispatched = [], token = 'a'.repeat(40)
  const server = createExecutorServer({ executor:f.executor,token,dispatch:key => dispatched.push(key) })
  server.listen(0,'127.0.0.1'); await once(server,'listening'); t.after(()=>new Promise(resolve=>server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`, headers = { authorization:`Bearer ${token}`,'content-type':'application/json' }
  const response = await fetch(`${url}/operations`,{ method:'POST',headers,body:JSON.stringify(f.request('prepare')) })
  const body = await response.json(); assert.equal(response.status,202)
  const reopened = new Journal(join(f.directory,'journal.sqlite')); assert.equal(reopened.get(body.key).status,'intent'); reopened.close()
  await new Promise(resolve=>setImmediate(resolve))
  const found = await fetch(`${url}/operations?key=${encodeURIComponent(body.key)}`,{ headers }).then(row=>row.json())
  assert.equal(found.operationId,body.operationId)
  const duplicate = await fetch(`${url}/operations`,{ method:'POST',headers,body:JSON.stringify(f.request('prepare')) }).then(row=>row.json())
  assert.equal(duplicate.operationId,body.operationId); assert.equal(dispatched.length,1)
  assert.equal((await fetch(`${url}/health`)).status,401)
  assert.equal((await fetch(`${url}/operations`,{ method:'POST',headers,body:JSON.stringify(f.request('apply',1,{ parameters:{ command:'touch /tmp/forbidden' } })) })).status,400)
})
test('same key with changed parameters is rejected and stale generations cannot act',async t => {
  const f = await setup(t); await prepared(f); await f.run('apply')
  assert.throws(()=>f.executor.submit(f.request('apply',2)),{ code:'OPERATION_CONFLICT' })
  f.executor.submit(f.request('verify',2))
  assert.throws(()=>f.executor.submit(f.request('undrain',1)),{ code:'STALE_GENERATION' })
})
test('persistent service reservation blocks another batch even after lease time would have elapsed',async t => {
  const f = await setup(t); await prepared(f)
  const first = f.executor.submit(f.request('apply')); f.journal.patch(first.operation.key,{ status:'uncertain' })
  const second = structuredClone(f.release); second.releaseId = 'release-later'; f.executor.register(second,hash(second))
  assert.throws(()=>f.executor.submit(f.request('apply',2,{ releaseId:second.releaseId,manifestHash:hash(second) })),{ code:'RESOURCE_BUSY' })
})
test('online prepare generation zero never steals active service fencing',async t => {
  const f = await setup(t); await prepared(f)
  f.executor.submit(f.request('apply'))
  const second = structuredClone(f.release); second.releaseId = 'release-later'; f.executor.register(second,hash(second))
  const prep = f.executor.submit(f.request('prepare',0,{ releaseId:second.releaseId,manifestHash:hash(second) }))
  assert.equal(prep.created,true)
  assert.equal(f.journal.db.prepare('SELECT generation FROM fences WHERE resource=?').get('compose:original-project:web').generation,1)
})
test('process exit after Docker side effect is observed on restart without repeating up',async t => {
  const f = await setup(t); await prepared(f); f.executor.submit(f.request('apply')); f.host.save(); f.journal.close()
  const child = spawnSync(process.execPath,['--experimental-sqlite',new URL('./fixtures/crash.mjs',import.meta.url).pathname,f.directory],{ encoding:'utf8' })
  assert.equal(child.status,23,child.stderr)
  const restarted = fixture(f.directory); t.after(()=>restarted.journal.close())
  assert.equal(restarted.journal.get('release-495:main-runtime-a:apply').status,'running')
  const before = restarted.host.data.calls.filter(args=>args.includes('up')).length
  await restarted.executor.reconcileStartup()
  const observed = restarted.journal.get('release-495:main-runtime-a:apply')
  assert.equal(observed.status,'succeeded'); assert.equal(observed.result.observedAfterInterruption,true)
  assert.equal(restarted.host.data.calls.filter(args=>args.includes('up')).length,before)
})
test('partial unknown side effect stays reserved and is not replayed',async t => {
  const f = await setup(t,{ afterSideEffect:name => { if (name === 'forward:up:web') throw Object.assign(fault('CRASH_WINDOW','Lost receipt'),{ uncertain:true }) } }); await prepared(f)
  assert.equal((await f.run('apply')).status,'uncertain')
  const before = f.host.data.calls.filter(args=>args.includes('up')).length
  await f.executor.reconcileStartup()
  assert.equal(f.journal.get('release-495:main-runtime-a:apply').status,'uncertain')
  assert.equal(f.host.data.calls.filter(args=>args.includes('up')).length,before)
  assert.throws(()=>f.executor.submit(f.request('recover')),{ code:'RESOURCE_BUSY' })
})
test('known startup failure automatically restores cached compatible source and retains forward error',async t => {
  const f = await setup(t,{ unhealthyTarget:true,offline:true }); await prepared(f)
  const result = await f.run('apply')
  assert.equal(result.status,'failed'); assert.equal(result.result.recovered,true); assert.equal(result.errors.forward.code,'STARTUP_TIMEOUT'); assert.equal(result.errors.recovery,null)
  assert.equal(f.host.data.containers.web.Image,oldImage.configDigest)
  f.executor.recordCleanupError(result.key,fault('CLEANUP_FAILED','Temporary verification cleanup failed'))
  const receipt = f.journal.get(result.key)
  assert.equal(receipt.errors.forward.code,'STARTUP_TIMEOUT'); assert.equal(receipt.errors.cleanup[0].code,'CLEANUP_FAILED'); assert.equal(receipt.status,'failed')
})
test('failed recovery is separate from forward failure and remains uncertain',async t => {
  const f = await setup(t,{ unhealthyTarget:true,failRecovery:true }); await prepared(f)
  const result = await f.run('apply')
  assert.equal(result.status,'uncertain'); assert.equal(result.errors.forward.code,'STARTUP_TIMEOUT'); assert.equal(result.errors.recovery.code,'DOCKER_COMMAND_FAILED')
})
test('fallback missing data-semantic capability is refused before starting any old artifact',async t => {
  const f = await setup(t); await prepared(f); await f.run('apply')
  f.adapter.state = async()=>({ ...contract,verified:true,requiredCapabilities:['future.required-capability'] })
  const before = f.host.data.calls.length, result = await f.run('recover')
  assert.equal(result.status,'failed'); assert.equal(result.errors.recovery.code,'INCOMPATIBLE_CAPABILITY')
  assert.equal(f.host.data.calls.slice(before).some(args=>args.includes('stop') || args.includes('up')),false)
})
test('post-admission failure recovery uses independent drain/apply/undrain keys',async t => {
  const f = await setup(t); await prepared(f); await f.run('apply'); await f.run('undrain')
  assert.equal((await f.run('recovery-drain')).status,'succeeded')
  assert.equal((await f.run('recover')).status,'succeeded')
  assert.equal((await f.run('recovery-undrain')).status,'succeeded')
  assert.equal(f.host.data.containers.worker.Image,oldImage.configDigest); assert.equal(f.host.data.ingress.enabled,true)
})
test('semantic config ignores port/set order and object order while preserving command argument order',()=>{
  const config = baseConfig(), local = policy('/tmp/fingerprint').targets['main-runtime-a']
  config.services.web.ports.push({ target:5182,published:'5184' })
  const reordered = structuredClone(config); reordered.services.web.ports.reverse()
  assert.equal(configurationFingerprint(config,local),configurationFingerprint(reordered,local))
  reordered.services.web.command.reverse()
  assert.notEqual(configurationFingerprint(config,local),configurationFingerprint(reordered,local))
})
test('original volume binding drift fails without any stop/up',async t=>{
  const f = await setup(t); f.host.data.containers.worker.Mounts[0].Name='new-empty-homes'
  assert.equal((await f.run('prepare')).errors.forward.code,'VOLUME_BINDING_CHANGED')
  assert.equal(f.host.data.calls.some(args=>args.includes('up') || args.includes('stop')),false)
})
test('rolling and arbitrary local inline helpers are rejected until specifically qualified',async t=>{
  const f = await setup(t), manifest = structuredClone(f.release); manifest.targets['main-runtime-a'].hostPlan.mode='rolling'; manifest.releaseId='unqualified-rolling'
  assert.throws(()=>f.executor.register(manifest,hash(manifest)),{ code:'ROLLING_UNQUALIFIED' })
  const local = policy(f.directory); local.targets['main-runtime-a'].controls.state={ argv:['/bin/sh','-c','anything'] }
  assert.throws(()=>validatePolicy(local),{ code:'INVALID_POLICY' })
})
test('actual migration checksum ledger and required capabilities come from qualified local DB evidence',()=>{
  const migrations = [{ version:1,name:'initial',checksum:'a'.repeat(64) }], current = { ...contract,productSchema:1,installedSchema:14,readOnly:true,fullVisibility:true,schemaHash:'b'.repeat(64),protocolVersion:11,migrationCount:1,migrations }
  const qualifiedContract = { ...contract,productSchema:1 },database = { profiles:{ [`14:1:${current.schemaHash}`]:{ contract:qualifiedContract,migrationsHash:hash(migrations),protocolVersion:11,requiredCapabilities:['case.soft-delete-filter'] } } }
  assert.equal(qualifyDatabaseEvidence(current,database).verified,true)
  assert.throws(()=>qualifyDatabaseEvidence({ ...current,migrations:[{ ...migrations[0],checksum:'c'.repeat(64) }] },database),{ code:'DATABASE_PROVENANCE_UNQUALIFIED' })
  assert.throws(()=>assertCompatible({ ...qualifiedContract,capabilities:[] },qualifyDatabaseEvidence(current,database)),{ code:'INCOMPATIBLE_CAPABILITY' })
})
test('singleton lock refuses an alive duplicate process',async t=>{
  const f = await setup(t), path = join(f.directory,'singleton.lock'), release = await claimProcessLock(path)
  try { await assert.rejects(claimProcessLock(path),{ code:'EXECUTOR_ALREADY_RUNNING' }) } finally { await release() }
})
test('schema transition source and compatible recovery can be different prepared artifacts',async t=>{
  const f=await setup(t),release=structuredClone(f.release),target=release.targets['main-runtime-a']
  target.hostPlan.source=structuredClone(target.hostPlan.recovery)
  target.hostPlan.recovery.images={ web:newImage,worker:newImage }
  release.releaseId='source-distinct-from-recovery'
  const manifestHash=hash(release);f.executor.register(release,manifestHash)
  const request=f.request('prepare',0,{ releaseId:release.releaseId,manifestHash })
  const accepted=f.executor.submit(request),result=await f.executor.run(accepted.operation.key)
  assert.equal(result.status,'succeeded')
  assert.equal(f.host.data.containers.web.Image,oldImage.configDigest)
  const recovery=JSON.parse(await readFile(join(f.directory,release.releaseId,'main-runtime-a-recovery.json'),'utf8'))
  assert.equal(recovery.services.web.image,newImage.configDigest)
})
test('manifest operation-tool identity must be supported by the installed fixed executor',async t=>{
  const f=await setup(t),release=structuredClone(f.release);release.releaseId='unsupported-ops';release.opsSha='c'.repeat(40)
  assert.throws(()=>f.executor.register(release,hash(release)),{code:'OPS_VERSION_MISMATCH'})
})
test('prepare and drain preflight reject missing/unavailable ingress or source readiness before any writer stop',async t=>{
  for(const failure of ['missing','unavailable','readiness']){
    const f=await setup(t),original=f.adapter.control.bind(f.adapter)
    if(failure==='missing')delete f.local.targets['main-runtime-a'].controls.ingress
    else f.adapter.control=async(local,action,body,method)=>{if(action===(failure==='unavailable'?'ingressState':'readiness'))throw fault('CONTROL_UNAVAILABLE','Unavailable fixed control');return original(local,action,body,method)}
    const result=await f.run('prepare');assert.equal(result.status,'failed');assert.equal(f.host.data.calls.some(args=>args.includes('stop')||args.includes('up')),false)
  }
  const f=await setup(t);assert.equal((await f.run('prepare')).status,'succeeded');delete f.local.targets['main-runtime-a'].controls.ingressState
  assert.equal((await f.run('drain')).status,'failed');assert.equal(f.host.data.calls.some(args=>args.includes('stop')),false)
})
test('known pre-migration archive failure restores exact source even when recovery is target-schema-only',async t=>{
  const f=await setup(t),release=structuredClone(f.release),target=release.targets['main-runtime-a'];target.hostPlan.source=structuredClone(target.hostPlan.recovery);target.hostPlan.recovery.contract={...target.hostPlan.recovery.contract,productSchema:58};release.releaseId='known-backup-failure'
  const manifestHash=hash(release);f.executor.register(release,manifestHash)
  const op=phase=>f.request(phase,phase==='prepare'?0:1,{releaseId:release.releaseId,manifestHash}),run=async phase=>{const accepted=f.executor.submit(op(phase));return f.executor.run(accepted.operation.key)}
  assert.equal((await run('prepare')).status,'succeeded');assert.equal((await run('drain')).status,'succeeded')
  const backup=f.journal.accept(op('backup'),f.adapter.resources('main-runtime-a','backup')).operation
  f.journal.finish(backup.key,'failed',{needsIntervention:false},{forward:{code:'ARCHIVE_UPLOAD_REJECTED'},recovery:null,cleanup:[]})
  for(const phase of ['source-drain','restore-source','source-undrain']){const result=await run(phase);assert.equal(result.status,'succeeded',JSON.stringify(result))}
  assert.equal(f.host.data.containers.web.Image,oldImage.configDigest);assert.equal(f.host.data.ingress.enabled,true)
  assert.equal(f.journal.get(backup.key).errors.forward.code,'ARCHIVE_UPLOAD_REJECTED')
})
for(const phase of ['migrate','apply','recover'])test(`source restoration refuses even an unknown ${phase} intent`,async t=>{
  const f=await setup(t);await prepared(f)
  const prior=f.executor.submit(f.request(phase)).operation;f.journal.patch(prior.key,{status:'uncertain'})
  const before=f.host.data.calls.length
  await assert.rejects(f.executor.assertSourceRestoreAllowed(f.request('restore-source')),{code:'SOURCE_RESTORE_FORBIDDEN'})
  assert.equal(f.host.data.calls.slice(before).some(args=>args.includes('stop')||args.includes('up')),false)
})
test('source restoration refuses changed installed schema despite broad source support declarations',async t=>{
  const f=await setup(t),release=structuredClone(f.release);release.releaseId='source-state-changed';release.targets['main-runtime-a'].hostPlan.source=structuredClone(release.targets['main-runtime-a'].hostPlan.recovery);release.targets['main-runtime-a'].hostPlan.source.contract.supportedProductSchemas=[57,58]
  const manifestHash=hash(release);f.executor.register(release,manifestHash);f.adapter.state=async()=>({...f.release.targets['main-runtime-a'].contract,productSchema:58,verified:true,requiredCapabilities:[]})
  await assert.rejects(f.executor.assertSourceRestoreAllowed(f.request('restore-source',1,{releaseId:release.releaseId,manifestHash})),{code:'SOURCE_STATE_CHANGED'})
})

test('trusted helper known failure is terminal without hiding unknown side-effect failures',async t=>{
  const f=await setup(t);await prepared(f)
  const op=f.executor.submit(f.request('apply')).operation,context=await f.executor.context(op)
  await assert.rejects(context.step('known-read-only-backup',async()=>{throw Object.assign(fault('ARCHIVE_TOO_LARGE','Verified dump retained'),{outcomeKnown:true,uncertain:false})},{sideEffect:true}))
  assert.equal(f.journal.get(op.key).steps.at(-1).status,'failed-known')
})
