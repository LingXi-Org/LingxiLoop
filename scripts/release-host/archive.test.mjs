import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { uploadArchive, observeArchive, MAX_ARCHIVE_BYTES } from './archive.mjs'
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lingxi-archive-')), directory = join(root, 'release-1', 'database')
  await mkdir(directory, { recursive: true }); const dumpPath = join(directory, 'backup.dump'), tokenFile = join(root, 'token')
  const dump = Buffer.from('private database backup')
  await writeFile(dumpPath, dump); await writeFile(tokenFile, 'executor-secret', { mode: 0o600 })
  const op = { releaseId: 'release-1', target: 'main-runtime-a', generation: 1, manifestHash: hash('manifest') }
  const core = { version: 1, releaseId: op.releaseId, target: op.target, generation: op.generation, manifestHash: op.manifestHash, dumpHash: hash(dump), size: dump.length, key: 'releases/release-1/backups/main-runtime-a/database.dump', complete: true }
  return { root, policy: { stateDirectory: root, archive: { baseUrl: 'https://release.test', tokenFile } }, op, dump, dumpPath, dumpHash: core.dumpHash, receipt: { ...core, bodyHash: hash(JSON.stringify(core)) } }
}
test('streams to a fixed HTTPS endpoint with secret-file auth and returns checked metadata', async () => {
  const f = await fixture(), calls = []
  const result = await uploadArchive(f.policy, f.op, { ...f, fetcher: async (url, init) => {
    assert.equal(url.href, 'https://release.test/v1/releases/release-1/backups/main-runtime-a')
    assert.equal(url.search, ''); assert.equal(init.redirect, 'error'); assert.equal(init.headers.authorization, 'Bearer executor-secret')
    assert.ok(init.signal instanceof AbortSignal); calls.push(init.method || 'GET')
    if (!init.method) return new Response('', { status: 404 })
    assert.equal(init.duplex, 'half'); assert.equal(init.headers['content-length'], String(f.dump.length))
    const chunks = []; for await (const chunk of init.body) chunks.push(chunk)
    assert.deepEqual(Buffer.concat(chunks), f.dump)
    return Response.json(f.receipt, { status: 201 })
  } })
  assert.equal(result.complete, true); assert.equal(result.reused, false); assert.deepEqual(calls, ['GET', 'POST'])
  assert.deepEqual(await readFile(f.dumpPath), f.dump)
})
test('existing metadata reuses the archive and mismatched receipt hash is rejected', async () => {
  const f = await fixture(); let count = 0
  const result = await uploadArchive(f.policy, f.op, { ...f, fetcher: async () => { count++; return Response.json(f.receipt) } })
  assert.equal(result.reused, true); assert.equal(count, 1)
  await assert.rejects(uploadArchive(f.policy, f.op, { ...f, fetcher: async () => Response.json({ ...f.receipt, bodyHash: hash('different receipt') }) }), { code: 'ARCHIVE_IDENTITY_CONFLICT' })
})
test('lost POST response reconciles via one fresh metadata GET without repeating upload', async () => {
  const f = await fixture(), calls = []
  const result = await uploadArchive(f.policy, f.op, { ...f, fetcher: async (_url, init) => {
    calls.push(init.method || 'GET')
    if (calls.length === 1) return new Response('', { status: 404 })
    if (init.method === 'POST') { for await (const _ of init.body) {} throw new Error('response lost') }
    return Response.json(f.receipt)
  } })
  assert.equal(result.reconciled, true); assert.deepEqual(calls, ['GET', 'POST', 'GET'])
  assert.deepEqual(await readFile(f.dumpPath), f.dump)
})
test('an unconfirmed upload remains uncertain and preserves the local backup', async () => {
  const f = await fixture()
  await assert.rejects(uploadArchive(f.policy, f.op, { ...f, fetcher: async (_url, init) => { if (init.method === 'POST') throw new Error('connection lost'); return new Response('', { status: 404 }) } }), { code: 'ARCHIVE_UPLOAD_UNCONFIRMED', uncertain: true, localBackupPreserved: true })
  assert.deepEqual(await readFile(f.dumpPath), f.dump)
})
test('oversize and untrusted paths fail before any upload and never remove backup', async () => {
  const f = await fixture(), file = await open(f.dumpPath, 'r+')
  await file.truncate(MAX_ARCHIVE_BYTES + 1); await file.close()
  const fetcher = async () => { throw new Error('network must not be called') }
  await assert.rejects(uploadArchive(f.policy, f.op, { ...f, fetcher }), { code: 'ARCHIVE_TOO_LARGE', localBackupPreserved: true })
  await assert.rejects(uploadArchive(f.policy, f.op, { ...f, dumpPath: join(f.root, 'elsewhere'), fetcher }), { code: 'ARCHIVE_POLICY_REQUIRED' })
  const handle = await open(f.dumpPath, 'r'); assert.equal((await handle.stat()).size, MAX_ARCHIVE_BYTES + 1); await handle.close()
})

test('observeArchive is read-only: missing receipt fails without POST and matching receipt is reused', async () => {
  const f = await fixture(), calls = []
  await assert.rejects(observeArchive(f.policy, f.op, { ...f, fetcher: async (_url, init) => { calls.push(init.method || 'GET'); return new Response('', { status: 404 }) } }), { code: 'ARCHIVE_NOT_CONFIRMED', uncertain: true, localBackupPreserved: true })
  assert.deepEqual(calls, ['GET'])
  assert.equal((await observeArchive(f.policy, f.op, { ...f, fetcher: async (_url, init) => { assert.equal(init.method, undefined); return Response.json(f.receipt) } })).reused, true)
})
test('large archive upload has a separate bounded budget while metadata keeps its short deadline',async()=>{
 const f=await fixture(), original=AbortSignal.timeout,deadlines=[]
 AbortSignal.timeout=ms=>{deadlines.push(ms);return original(ms)}
 try{
  await uploadArchive(f.policy,f.op,{...f,fetcher:async(_url,init)=>{
   if(!init.method)return new Response('',{status:404})
   for await(const _ of init.body){}
   return Response.json(f.receipt,{status:201})
  }})
  assert.deepEqual(deadlines,[60000,300000])
  await assert.rejects(uploadArchive({...f.policy,archive:{...f.policy.archive,uploadTimeoutMs:300001}},f.op,{...f,fetcher:async()=>{throw Error('must not fetch')}}),{code:'ARCHIVE_TIMEOUT_INVALID'})
 }finally{AbortSignal.timeout=original}
})
test('upload diagnostics distinguish timeout, HTTP failure and read-after absence without exposing secrets',async()=>{
 for(const failure of ['timeout','http']){
  const f=await fixture(),calls=[];let clock=0
  await assert.rejects(uploadArchive(f.policy,f.op,{...f,now:()=>clock,fetcher:async(_url,init)=>{
   calls.push(init.method??'GET');clock+=10
   if(!init.method)return new Response('',{status:404})
   for await(const _ of init.body){}
   if(failure==='http')return new Response('private upstream body',{status:502})
   throw Object.assign(Error('token=private https://secret.invalid/?signature=private'),{name:'TimeoutError',cause:{code:'SECRET_PRIVATE'}})
  }}),error=>{
   assert.equal(error.code,'ARCHIVE_UPLOAD_UNCONFIRMED');assert.equal(error.uncertain,true)
   assert.deepEqual(error.archiveDiagnostics,{version:1,readAfter:'absent',events:[
    {phase:'metadata-before',outcome:'absent',httpStatus:404,elapsedMs:10},
    {phase:'upload',outcome:failure==='http'?'http-error':'timeout',...(failure==='http'?{httpStatus:502}:{}),elapsedMs:10},
    {phase:'metadata-after',outcome:'absent',httpStatus:404,elapsedMs:10},
   ]});assert.equal(JSON.stringify(error.archiveDiagnostics).includes('private'),false);return true
  });assert.deepEqual(calls,['GET','POST','GET'])
 }
})
test('denied upload records its status without retrying or inventing a read-after check',async()=>{
 const f=await fixture(),calls=[]
 await assert.rejects(uploadArchive(f.policy,f.op,{...f,fetcher:async(_url,init)=>{calls.push(init.method??'GET');if(!init.method)return new Response('',{status:404});for await(const _ of init.body){};return new Response('private',{status:403})}}),error=>{
  assert.equal(error.code,'ARCHIVE_UPLOAD_REJECTED');assert.equal(error.archiveDiagnostics.readAfter,'not-attempted');assert.equal(error.archiveDiagnostics.events[1].httpStatus,403);return true
 });assert.deepEqual(calls,['GET','POST'])
})
test('read-after failure retains the original upload classification and both HTTP outcomes',async()=>{
 const f=await fixture();let reads=0
 await assert.rejects(uploadArchive(f.policy,f.op,{...f,fetcher:async(_url,init)=>{
  if(!init.method)return new Response('',{status:++reads===1?404:503})
  for await(const _ of init.body){};throw Object.assign(Error('private'),{cause:{code:'ECONNRESET'}})
 }}),error=>{
  assert.equal(error.code,'ARCHIVE_METADATA_REJECTED');assert.equal(error.archiveDiagnostics.events[1].outcome,'connection-reset');assert.equal(error.archiveDiagnostics.events[2].httpStatus,503);assert.equal(error.archiveDiagnostics.readAfter,'http-error');return true
 })
})
test('a lost response recovered by matching metadata retains evidence of the unsuccessful upload reply',async()=>{
 const f=await fixture();let reads=0
 const result=await uploadArchive(f.policy,f.op,{...f,fetcher:async(_url,init)=>{
  if(!init.method)return ++reads===1?new Response('',{status:404}):Response.json(f.receipt)
  for await(const _ of init.body){};throw Object.assign(Error('private'),{cause:{code:'UND_ERR_SOCKET'}})
 }})
 assert.equal(result.complete,true);assert.equal(result.reconciled,true);assert.equal(result.archiveDiagnostics.readAfter,'verified');assert.equal(result.archiveDiagnostics.events[1].outcome,'connection-closed')
})
test('invalid JSON and conflicting upload receipts remain unconfirmed with their HTTP200 identity diagnostics',async()=>{
 for(const outcome of ['receipt-invalid','identity-mismatch']){
  const f=await fixture()
  await assert.rejects(uploadArchive(f.policy,f.op,{...f,fetcher:async(_url,init)=>{
   if(!init.method)return new Response('',{status:404})
   for await(const _ of init.body){}
   return outcome==='receipt-invalid'?new Response('private invalid JSON',{status:200}):Response.json({...f.receipt,dumpHash:hash('wrong')})
  }}),error=>{assert.equal(error.code,'ARCHIVE_UPLOAD_UNCONFIRMED');assert.equal(error.archiveDiagnostics.events[1].outcome,outcome);assert.equal(error.archiveDiagnostics.events[1].httpStatus,200);assert.equal(error.archiveDiagnostics.readAfter,'absent');return true})
 }
})
test('pre-upload TLS failure records a safe class and never starts a POST',async()=>{
 const f=await fixture();let calls=0
 await assert.rejects(uploadArchive(f.policy,f.op,{...f,fetcher:async(_url,init)=>{calls++;assert.equal(init.method,undefined);throw Object.assign(Error('private certificate and URL'),{cause:{code:'CERT_HAS_EXPIRED'}})}}),error=>{
  assert.equal(error.code,'ARCHIVE_METADATA_UNAVAILABLE');assert.equal(error.archiveDiagnostics.events.length,1);assert.equal(error.archiveDiagnostics.events[0].outcome,'tls-error');assert.equal(error.archiveDiagnostics.events[0].httpStatus,undefined);assert.equal(JSON.stringify(error.archiveDiagnostics).includes('private'),false);return true
 });assert.equal(calls,1)
})
