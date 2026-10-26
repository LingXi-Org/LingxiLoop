import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {spawnSync} from 'node:child_process'
import {ArtifactCache} from './artifact-cache.mjs'
import {artifactFixture,byteHash} from './fixtures/artifact.mjs'
import {fault,hash} from './journal.mjs'
import {fixture as hostFixture} from './fixtures/fake-host.mjs'

async function setup(t,options={}){
  const directory=await mkdtemp(join(tmpdir(),'artifact-fetch-')),f=artifactFixture(),calls=[],requests=[];let loaded=false
  t.after(()=>rm(directory,{recursive:true,force:true}))
  const tokenFile=join(directory,'existing-executor-token');await writeFile(tokenFile,'private-existing-executor-token-495',{mode:0o600})
  const request={releaseId:'artifact-fetch',target:'main-runtime-a',manifestHash:hash('registered'),configDigest:f.image.configDigest}
  const manifest={targets:{'main-runtime-a':{hostPlan:{images:{web:f.image},source:{images:{web:f.image}},recovery:{images:{web:f.image}}}}}}
  const journal={manifest:(id,value)=>{assert.equal(id,request.releaseId);assert.equal(value,request.manifestHash);return manifest}}
  const policy={stateDirectory:directory,artifactTransport:'r2',archive:{baseUrl:'https://release.test',tokenFile,timeoutMs:1000},targets:{'main-runtime-a':{}}}
  const actual={Id:byteHash('loaded-local-id'),Descriptor:{digest:byteHash('loaded-local-id'),mediaType:'application/vnd.oci.image.index.v1+json'},RepoTags:[f.image.archive.tag],RepoDigests:[],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:f.image.diffIds},Config:JSON.parse(f.config).config}
  const run=async args=>{calls.push(args);if(args[1]==='inspect'){if(!loaded||![actual.Id,f.image.archive.tag].includes(args[2]))throw fault('IMAGE_NOT_FOUND','missing');return JSON.stringify([actual])}if(args[1]==='load'){if(options.failBeforeLoad)throw Error('response lost before load');loaded=true;return ''}if(args[1]==='save'){await writeFile(args[3],f.raw,{mode:0o600});return ''}throw Error('Unexpected Docker operation')}
  const response=(index,bytes=f.parts[index],headers={})=>new Response(bytes,{headers:{'content-type':'application/octet-stream','content-length':String(bytes.length),'content-encoding':'identity','x-lingxi-artifact-sha256':f.image.archive.parts[index].sha256,...headers}})
  const fetcher=async(url,init)=>{requests.push({url:String(url),init});const index=f.image.archive.parts.findIndex(p=>String(url).endsWith(p.sha256.slice(7)));assert.ok(index>=0);return response(index)}
  const cache=new ArtifactCache(policy,{journal,run,fetcher,afterLoad:options.afterLoad})
  const restarted=fetcher=>new ArtifactCache(policy,{journal,run,fetcher})
  const upload=async()=>{for(let i=0;i<f.parts.length;i++)await cache.put(request,i,Readable.from([f.parts[i]]))}
  return{...f,directory,policy,journal,manifest,request,cache,run,calls,requests,response,restarted,upload,fetcher}
}
test('missing parts stream from the fixed authenticated HTTPS endpoint and reuse the original safe load/readback',async t=>{
  const f=await setup(t);await f.cache.put(f.request,0,Readable.from([f.parts[0]]))
  const identity=await f.cache.prepare(f.request)
  assert.equal(identity.identity,'archive-verified');assert.equal(identity.configDigest,f.image.configDigest)
  assert.deepEqual(f.requests.map(r=>new URL(r.url).pathname),f.image.archive.parts.slice(1).map(p=>`/v1/artifact-blobs/${p.sha256.slice(7)}`))
  for(const{url,init}of f.requests){assert.equal(new URL(url).origin,'https://release.test');assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.deepEqual(init.headers,{authorization:'Bearer private-existing-executor-token-495'});assert.equal(init.body,undefined)}
  assert.deepEqual(f.calls.filter(a=>['load','save'].includes(a[1])).map(a=>a.slice(0,2)),[['image','load'],['image','save']])
  assert.ok(f.calls.every(a=>a[0]==='image'));assert.equal(JSON.stringify(identity).includes('do-not-emit'),false)
  f.policy.archive={baseUrl:'invalid',tokenFile:'/nonexistent'}
  const restarted=f.restarted(async()=>{throw Error('complete cache must not fetch')})
  assert.equal((await restarted.prepare(f.request)).identity,'archive-verified')
})
test('all complete parts prepare offline even without archive transport configuration',async t=>{
  const f=await setup(t);await f.upload();delete f.policy.archive
  assert.equal((await f.cache.prepare(f.request)).identity,'archive-verified');assert.deepEqual(f.requests,[])
})
test('authentication refusals and redirects stop once without retry, following Location or leaking response diagnostics',async t=>{
  for(const status of [401,403,302]){
    const f=await setup(t);let count=0,canceled=false
    f.cache.fetcher=async()=>{count++;return new Response(new ReadableStream({cancel(){canceled=true}}),{status,headers:{location:'https://foreign.invalid/private'}})}
    await assert.rejects(f.cache.prepare(f.request),error=>{assert.equal(error.code,status===302?'ARTIFACT_DOWNLOAD_REJECTED':'ARTIFACT_DOWNLOAD_AUTHENTICATION_FAILED');assert.equal(error.message.includes('private'),false);return true})
    assert.equal(count,1);assert.equal(canceled,true);assert.equal(f.calls.some(a=>a[1]==='load'),false)
  }
})
test('network and 5xx reads have a fixed three-attempt bound and never retry hash or metadata failures',async t=>{
  for(const failure of ['network','5xx']){
    const f=await setup(t);let count=0
    f.cache.wait=async()=>{};f.cache.fetcher=async()=>{count++;if(failure==='network')throw Error('private transport details');return new Response('private upstream body',{status:503})}
    await assert.rejects(f.cache.prepare(f.request),{code:'ARTIFACT_DOWNLOAD_UNAVAILABLE'});assert.equal(count,3);assert.equal(f.calls.some(a=>a[1]==='load'),false)
  }
  for(const failure of ['hash','length','header']){
    const f=await setup(t);let count=0
    f.cache.fetcher=async()=>{count++;return failure==='hash'?f.response(0,Buffer.alloc(f.parts[0].length)):f.response(0,undefined,failure==='length'?{'content-length':'1'}:{'x-lingxi-artifact-sha256':byteHash('wrong')})}
    await assert.rejects(f.cache.prepare(f.request));assert.equal(count,1);assert.deepEqual((await f.cache.status(f.request)).receivedParts,[])
  }
})
test('partial network failure leaves valid durable parts reusable by a later prepare without redownloading them',async t=>{
  const f=await setup(t);let attempts=0;f.cache.wait=async()=>{}
  f.cache.fetcher=async(url,init)=>{if(String(url).endsWith(f.image.archive.parts[0].sha256.slice(7)))return f.fetcher(url,init);attempts++;return f.response(1,new ReadableStream({start(c){c.error(new TypeError('private interrupted body'))}}),{'content-length':String(f.parts[1].length)})}
  await assert.rejects(f.cache.prepare(f.request),{code:'ARTIFACT_DOWNLOAD_UNAVAILABLE'});assert.equal(attempts,3);assert.deepEqual((await f.cache.status(f.request)).receivedParts,[0]);assert.equal(f.calls.some(a=>a[1]==='load'),false)
  const requested=[];const restarted=f.restarted(async(url,init)=>{requested.push(String(url));return f.fetcher(url,init)})
  assert.equal((await restarted.prepare(f.request)).identity,'archive-verified');assert.equal(requested.some(url=>url.endsWith(f.image.archive.parts[0].sha256.slice(7))),false)
  assert.equal(JSON.parse(await readFile(`${restarted.partPath(f.image,0)}.json`,'utf8')).sha256,f.image.archive.parts[0].sha256)
})
test('only trusted HTTPS root and existing local token references can supply bytes; manifest URLs are ignored',async t=>{
  for(const baseUrl of ['http://release.test','https://user:secret@release.test','https://release.test/path','https://release.test/?query=1','https://release.test/#fragment']){
    const f=await setup(t);f.policy.archive.baseUrl=baseUrl
    await assert.rejects(f.cache.prepare(f.request),{code:'ARTIFACT_DOWNLOAD_POLICY_INVALID'});assert.deepEqual(f.requests,[])
  }
  const f=await setup(t);f.image.archive.url='https://foreign.invalid/private';await f.cache.prepare(f.request);assert.ok(f.requests.every(r=>new URL(r.url).origin==='https://release.test'))
})
test('concurrent missing-cache preparations allow one download stream; no second GET is started',async t=>{
  const f=await setup(t);let release,started,count=0;const ready=new Promise(resolve=>{started=resolve}),gate=new Promise(resolve=>{release=resolve})
  f.cache.fetcher=async(url,init)=>{count++;if(count===1){started();await gate}return f.fetcher(url,init)}
  const first=f.cache.prepare(f.request);await ready
  await assert.rejects(f.cache.prepare(f.request),{code:'ARTIFACT_DOWNLOAD_BUSY'});assert.equal(count,1);release();await first
})
test('unknown prior Docker load is only observed and never downloads or reloads after restart',async t=>{
  for(const sideEffectOccurred of [false,true]){
    const f=await setup(t,sideEffectOccurred?{afterLoad:()=>{throw Error('crash after load')}}:{failBeforeLoad:true});await f.upload()
    await assert.rejects(f.cache.ensure(f.image),{code:'ARTIFACT_LOAD_UNCERTAIN'})
    const restarted=f.restarted(async()=>{throw Error('unknown load must not download')})
    if(sideEffectOccurred)assert.equal((await restarted.prepare(f.request)).identity,'archive-verified')
    else await assert.rejects(restarted.prepare(f.request),{code:'ARTIFACT_LOAD_UNCERTAIN'})
    assert.equal(f.calls.filter(a=>a[1]==='load').length,1)
  }
})
test('a real child process exit after part fsync is resumed from durable bytes without fetching that part again',async t=>{
  const f=await setup(t)
  const child=spawnSync(process.execPath,['--experimental-sqlite',new URL('./fixtures/artifact-fetch-crash.mjs',import.meta.url).pathname,f.directory],{encoding:'utf8'})
  assert.equal(child.status,23,child.stderr);assert.deepEqual((await f.cache.status(f.request)).receivedParts,[0])
  assert.equal((await f.cache.prepare(f.request)).identity,'archive-verified')
  assert.equal(f.requests.some(r=>r.url.endsWith(f.image.archive.parts[0].sha256.slice(7))),false)
})
test('body timeout is bounded and retried only three times with no committed part or daemon load',async t=>{
  const f=await setup(t);let attempts=0;f.policy.archive.timeoutMs=100;f.cache.wait=async()=>{}
  f.cache.fetcher=async(_url,init)=>{attempts++;return f.response(0,new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(new DOMException('private abort','AbortError')),{once:true})}}),{'content-length':String(f.parts[0].length)})}
  await assert.rejects(f.cache.prepare(f.request),{code:'ARTIFACT_DOWNLOAD_UNAVAILABLE'});assert.equal(attempts,3)
  assert.deepEqual((await f.cache.status(f.request)).receivedParts,[]);assert.equal(f.calls.some(a=>a[1]==='load'),false)
})
test('known prepare download failure releases its reservation; an explicit new candidate reuses parts and preserves source/volumes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'artifact-prepare-')),f=hostFixture(directory),artifact=artifactFixture(),requests=[];let loaded=false,failed=true
  t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})})
  const tokenFile=join(directory,'existing-token');await writeFile(tokenFile,'private-existing-executor-token-495',{mode:0o600})
  f.local.artifactTransport='r2';f.local.archive={baseUrl:'https://release.test',tokenFile};f.adapter.artifacts.wait=async()=>{}
  const actual={Id:byteHash('prepared-image'),Descriptor:{digest:byteHash('prepared-image'),mediaType:'application/vnd.oci.image.index.v1+json'},RepoTags:[artifact.image.archive.tag],RepoDigests:[],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:artifact.image.diffIds},Config:JSON.parse(artifact.config).config}
  const originalRun=f.host.run.bind(f.host);f.host.run=async args=>{
    if(args[0]==='image'&&args[1]==='inspect'&&[artifact.image.ref,artifact.image.configDigest,artifact.image.platformDigest,artifact.image.indexDigest,artifact.image.archive.tag,actual.Id].includes(args[2])){if(!loaded)throw fault('IMAGE_NOT_FOUND','missing');return JSON.stringify([actual])}
    if(args[0]==='image'&&args[1]==='load'){loaded=true;return ''}
    if(args[0]==='image'&&args[1]==='save'){await writeFile(args[3],artifact.raw,{mode:0o600});return ''}
    return originalRun(args)
  }
  const originalFetch=f.adapter.fetcher;f.adapter.fetcher=async(url,init)=>{
    if(!new URL(url).pathname.startsWith('/v1/artifact-blobs/'))return originalFetch(url,init)
    const index=artifact.image.archive.parts.findIndex(p=>String(url).endsWith(p.sha256.slice(7)));requests.push({index,failed})
    if(failed&&index===1)return new Response(null,{status:503})
    return new Response(artifact.parts[index],{headers:{'content-type':'application/octet-stream','content-length':String(artifact.parts[index].length),'x-lingxi-artifact-sha256':artifact.image.archive.parts[index].sha256}})
  }
  const run=async id=>{const release=structuredClone(f.release);release.releaseId=id;release.targets['main-runtime-a'].hostPlan.images={web:artifact.image,worker:artifact.image};const manifestHash=hash(release);f.executor.register(release,manifestHash);const op=f.executor.submit(f.request('prepare',0,{releaseId:id,manifestHash})).operation;return f.executor.run(op.key)}
  const first=await run('download-failed');assert.equal(first.status,'failed');assert.equal(first.errors.forward.code,'ARTIFACT_DOWNLOAD_UNAVAILABLE')
  assert.equal(f.journal.db.prepare('SELECT count(*) AS n FROM reservations').get().n,0);assert.equal(loaded,false)
  failed=false;const second=await run('download-candidate-after-failure');assert.equal(second.status,'succeeded',JSON.stringify(second))
  assert.equal(requests.some(r=>r.index===0&&!r.failed),false);assert.ok(second.result.prepared.some(p=>p.direction==='source'&&p.reused));assert.ok(second.result.prepared.some(p=>p.direction==='forward'&&!p.reused));assert.ok(second.result.prepared.some(p=>p.direction==='recovery'&&p.reused))
  assert.equal(f.host.data.calls.some(a=>a.includes('pull')||a.includes('stop')||a.includes('up')),false);assert.equal(f.host.data.containers.worker.Mounts[0].Name,'original-homes')
})
