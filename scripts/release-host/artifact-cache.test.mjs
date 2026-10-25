import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,readFile,lstat,unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {once} from 'node:events'
import {gzipSync} from 'node:zlib'
import {ArtifactCache} from './artifact-cache.mjs'
import {validateArchive,verifyArchiveTar,MAX_PART} from './artifact-tar.mjs'
import {inspectQualifiedImage,assertImageIdentity,archiveReceiptPath} from './image-identity.mjs'
import {fault,hash} from './journal.mjs'
import {createExecutorServer} from './server.mjs'
import {fixture,newImage,oldImage} from './fixtures/fake-host.mjs'
import {artifactFixture,byteHash} from './fixtures/artifact.mjs'

async function setup(t,options={}){
  const directory=await mkdtemp(join(tmpdir(),'release-artifact-')),f=artifactFixture(options),calls=[];let loaded=false
  t.after(()=>rm(directory,{recursive:true,force:true}))
  const actual={Id:byteHash('Docker29 regenerated index'),Descriptor:{digest:byteHash('Docker29 regenerated index'),mediaType:'application/vnd.oci.image.index.v1+json',size:800},RepoTags:[f.image.archive.tag],RepoDigests:[],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:f.image.diffIds},Config:JSON.parse(f.config).config}
  const request={releaseId:'archive-test',target:'main-runtime-a',manifestHash:hash('registered'),configDigest:f.image.configDigest},manifest={targets:{'main-runtime-a':{hostPlan:{images:{web:f.image},recovery:{images:{web:f.image}}}}}}
  const journal={manifest:(id,expected)=>{assert.equal(id,request.releaseId);assert.equal(expected,request.manifestHash);return manifest}},policy={stateDirectory:directory,targets:{'main-runtime-a':{}},acceptedOpsShas:['a'.repeat(40)]}
  const run=async args=>{calls.push(args);if(args[1]==='inspect'){if(!loaded||![actual.Id,f.image.archive.tag].includes(args[2]))throw fault('IMAGE_NOT_FOUND','missing');return JSON.stringify([actual])}if(args[1]==='load'){if(options.failBeforeLoad)throw Error('before-load disconnect');loaded=true;if(options.failAfterLoad)throw Error('after-load disconnect');return 'Loaded image'}if(args[1]==='save'){await writeFile(args[3],options.badReadback?Buffer.from('invalid tar'):f.raw,{mode:0o600});return ''}throw Error('Unexpected Docker action')}
  const cache=new ArtifactCache(policy,{journal,run,afterLoad:options.afterLoad})
  const upload=async()=>{for(let i=0;i<f.parts.length;i++)await cache.put(request,i,Readable.from([f.parts[i]]))}
  return{...f,directory,policy,journal,manifest,request,cache,run,calls,actual,upload,setLoaded:()=>loaded=true}
}
test('stream verifier proves raw OCI config, ordered diffIDs, single fixed tag and gzip/blob layer encodings',async t=>{
  for(const blobGzip of [false,true]){const f=await setup(t,{blobGzip}),path=join(f.directory,'fixture.gz');await writeFile(path,f.gzip);const proof=await verifyArchiveTar(path,f.image);assert.equal(proof.configDigest,f.image.configDigest);assert.deepEqual(proof.diffIds,f.image.diffIds)}
})
test('classic v1 compatibility metadata may omit architecture and parent while declared architecture stays exact',async t=>{
  // Actual CI Docker-save members use id/parent?/created/container_config/os, without architecture.
  const metadata={id:'a'.repeat(64),parent:'b'.repeat(64),created:'2026-10-25T00:00:00Z',container_config:{},os:'linux'}
  for(const value of [metadata,{...metadata,architecture:'amd64'},Object.fromEntries(Object.entries(metadata).filter(([key])=>key!=='parent'))]){
    const bytes=Buffer.from(JSON.stringify(value)),f=await setup(t,{mutateEntries:entries=>entries.push({name:`blobs/sha256/${byteHash(bytes).slice(7)}`,data:bytes})}),path=join(f.directory,'classic.gz');await writeFile(path,f.gzip);assert.equal((await verifyArchiveTar(path,f.image)).configDigest,f.image.configDigest)
  }
})
test('classic metadata rejects wrong or null architecture, malformed IDs/parents, unknown JSON and mismatched blob hashes',async t=>{
  const metadata={id:'a'.repeat(64),parent:'b'.repeat(64),created:'2026-10-25T00:00:00Z',container_config:{},architecture:'amd64',os:'linux'}
  for(const value of [{...metadata,architecture:'arm64'},{...metadata,architecture:null},{...metadata,id:'invalid'},{...metadata,parent:'../invalid'},{...metadata,parent:null},{...metadata,rootfs:{type:'layers',diff_ids:[]}},['unknown-json']]){
    const bytes=Buffer.from(JSON.stringify(value)),f=await setup(t,{mutateEntries:entries=>entries.push({name:`blobs/sha256/${byteHash(bytes).slice(7)}`,data:bytes})}),path=join(f.directory,'unknown.gz');await writeFile(path,f.gzip);await assert.rejects(verifyArchiveTar(path,f.image),{code:'ARCHIVE_UNEXPECTED_MEMBER'})
  }
  const bytes=Buffer.from(JSON.stringify(metadata)),f=await setup(t,{mutateEntries:entries=>entries.push({name:`blobs/sha256/${'c'.repeat(64)}`,data:bytes})}),path=join(f.directory,'wrong-digest.gz');await writeFile(path,f.gzip);await assert.rejects(verifyArchiveTar(path,f.image),{code:'ARCHIVE_BLOB_DIGEST_MISMATCH'})
})
test('path traversal, links, duplicate image/tag, config/layer mismatch and invalid archive limits fail closed',async t=>{
  const variants=[{mutateEntries:entries=>entries.push({name:'../escaped',data:'x'})},{mutateEntries:entries=>entries.push({name:'blobs',type:'2',link:'/etc/passwd'})},{mutateManifest:rows=>rows.push(rows[0])},{mutateManifest:rows=>rows[0].RepoTags.push('unqualified:tag')},{mutateEntries:entries=>entries[0].data=Buffer.from('{}')},{mutateEntries:entries=>entries[1].data=Buffer.from('wrong layer')}]
  for(const options of variants){const f=await setup(t,options),path=join(f.directory,'bad.gz');await writeFile(path,f.gzip);await assert.rejects(verifyArchiveTar(path,f.image))}
  const f=artifactFixture();assert.throws(()=>validateArchive({...f.image,archive:{...f.image.archive,parts:[{sha256:byteHash('x'),size:MAX_PART+1}]}}),{code:'INVALID_IMAGE_ARCHIVE'})
})
test('durable parts are idempotent; dropped response/restart reconciles hashes and refuses corrupt overwrite',async t=>{
  const f=await setup(t);await f.upload();const first=await f.cache.status(f.request);assert.equal(first.missingParts.length,0);assert.deepEqual(first.receivedParts,f.parts.map((_,i)=>i));assert.equal(first.imageReady,false)
  const restarted=new ArtifactCache(f.policy,{journal:f.journal,run:f.run}),result=await restarted.put(f.request,0,Readable.from([f.parts[0]]));assert.equal(result.reused,true)
  assert.deepEqual((await restarted.status(f.request)).receivedParts,first.receivedParts);assert.equal((await lstat(restarted.partPath(f.image,0))).mode&0o777,0o600)
  await writeFile(restarted.partPath(f.image,0),'corrupt');await assert.rejects(restarted.put(f.request,0,Readable.from([f.parts[0]])),{code:'ARTIFACT_PART_CORRUPT'});assert.equal(await readFile(restarted.partPath(f.image,0),'utf8'),'corrupt')
})
test('part receipts repair missing crash-window receipts and detect timestamp/content drift; qualified image skips parts',async t=>{
  const f=await setup(t);await f.upload();const path=f.cache.partPath(f.image,0),before=JSON.parse(await readFile(`${path}.json`,'utf8'))
  await unlink(`${path}.json`);assert.equal((await f.cache.status(f.request)).receivedParts.length,f.parts.length);assert.equal(JSON.parse(await readFile(`${path}.json`,'utf8')).sha256,f.image.archive.parts[0].sha256)
  await writeFile(path,f.parts[0]);await f.cache.status(f.request);const after=JSON.parse(await readFile(`${path}.json`,'utf8'));assert.notDeepEqual(after.stamp,before.stamp)
  await f.cache.ensure(f.image);await writeFile(path,'corrupt-after-image-qualified');const status=await f.cache.status(f.request);assert.equal(status.imageReady,true);assert.deepEqual(status.receivedParts,[]);assert.deepEqual(status.missingParts,[])
})
test('partial/wrong upload never commits, concurrent writes lock, and manifest scope cannot select arbitrary paths',async t=>{
  const f=await setup(t);await assert.rejects(f.cache.put(f.request,0,Readable.from([Buffer.from('wrong')])));assert.equal((await f.cache.status(f.request)).receivedParts.length,0)
  let release,started;const ready=new Promise(resolve=>started=resolve),hold=new Promise(resolve=>release=resolve)
  const pending=f.cache.put(f.request,0,Readable.from((async function*(){started();await hold;yield f.parts[0]})()));await ready
  await assert.rejects(f.cache.put(f.request,0,Readable.from([f.parts[0]])),{code:'ARTIFACT_BUSY'});release();await pending
  await assert.rejects(f.cache.status({...f.request,path:'/tmp/escape'}),{code:'INVALID_ARTIFACT_REQUEST'});await assert.rejects(f.cache.status({...f.request,configDigest:byteHash('unregistered')}),{code:'ARTIFACT_NOT_REGISTERED'});assert.equal(f.calls.some(args=>args.includes('load')),false)
})
test('fixed offline load/readback permits changed Docker29 local ID only via private completed raw-config receipt',async t=>{
  const f=await setup(t);await f.upload();const identity=await f.cache.ensure(f.image);assert.equal(identity.identity,'archive-verified');assert.equal(identity.localImageId,f.actual.Id);assert.notEqual(identity.localImageId,f.image.indexDigest)
  assert.throws(()=>assertImageIdentity(f.actual,f.image),{code:'IMAGE_IDENTITY_MISMATCH'});assert.equal((await inspectQualifiedImage(f.run,f.image,undefined,{stateDirectory:f.directory})).localImageId,f.actual.Id)
  assert.deepEqual(f.calls.filter(args=>['load','save'].includes(args[1])).map(args=>args.slice(0,3)),[['image','load','--input'],['image','save','--output']]);assert.equal(f.calls.some(args=>args.includes('pull')||args.includes('build')),false)
  const receipt=await readFile(archiveReceiptPath(f.directory,f.image),'utf8');assert.equal(receipt.includes('do-not-emit'),false);assert.equal((await f.cache.status(f.request)).imageReady,true)
  f.actual.RootFS.Layers=[byteHash('tampered')];await assert.rejects(f.cache.status(f.request),{code:'IMAGE_IDENTITY_MISMATCH'})
})
test('crash/lost reply after load is observed after restart without reloading; absent unknown result remains locked',async t=>{
  for(const failBeforeLoad of [false,true]){const f=await setup(t,failBeforeLoad?{failBeforeLoad:true}:{afterLoad:()=>{throw Error('crash window')}});await f.upload();await assert.rejects(f.cache.ensure(f.image),{code:'ARTIFACT_LOAD_UNCERTAIN'});const restarted=new ArtifactCache(f.policy,{journal:f.journal,run:f.run}),status=await restarted.status(f.request);assert.equal(status.imageReady,!failBeforeLoad);if(failBeforeLoad){assert.equal(status.loadState,'uncertain');await assert.rejects(restarted.ensure(f.image),{code:'ARTIFACT_LOAD_UNCERTAIN'})}assert.equal(f.calls.filter(args=>args[1]==='load').length,1)}
})
test('identical canonical OCI image reuses its proven cache across transport-only tar/gzip repackaging',async t=>{
  const f=await setup(t);await f.upload();const original=await f.cache.ensure(f.image),rewrapped=gzipSync(f.raw,{level:1}),image={...f.image,archive:{...f.image.archive,sha256:byteHash(rewrapped),size:rewrapped.length,parts:[{sha256:byteHash(rewrapped),size:rewrapped.length}]}}
  assert.notEqual(image.archive.sha256,f.image.archive.sha256);f.manifest.targets['main-runtime-a'].hostPlan.images.web=image;f.manifest.targets['main-runtime-a'].hostPlan.recovery.images.web=image
  const status=await f.cache.status(f.request);assert.equal(status.imageReady,true);assert.equal(status.archiveSha256,image.archive.sha256);assert.equal(status.identity.archiveSha256,original.archiveSha256);assert.deepEqual(status.receivedParts,[]);assert.equal((await f.cache.ensure(image)).archiveSha256,original.archiveSha256);assert.equal(f.calls.filter(args=>args[1]==='load').length,1)
  await assert.rejects(inspectQualifiedImage(f.run,{...image,ref:image.ref.replace('fixture/release','fixture/different')},undefined,{stateDirectory:f.directory}),{code:'IMAGE_IDENTITY_MISMATCH'})
})
test('missing/corrupt archive, insufficient disk and failed daemon readback never qualify or touch business services',async t=>{
  const f=await setup(t);await assert.rejects(f.cache.ensure(f.image),{code:'ARTIFACT_PARTS_REQUIRED'});assert.equal(f.calls.some(args=>args[1]==='load'),false)
  await f.upload();f.cache.space=async()=>{throw fault('ARTIFACT_DISK_SPACE_REQUIRED','no space')};await assert.rejects(f.cache.ensure(f.image),{code:'ARTIFACT_DISK_SPACE_REQUIRED'});assert.equal(f.calls.some(args=>args[1]==='load'),false)
  const g=await setup(t,{badReadback:true});await g.upload();await assert.rejects(g.cache.ensure(g.image),{code:'ARTIFACT_LOAD_UNCERTAIN'});assert.equal((await g.cache.status(g.request)).imageReady,false);assert.ok(g.calls.every(args=>args[0]==='image'))
})
test('R2 prepare refuses missing unarchived images without registry requests or stopping source',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'release-r2-')),f=fixture(directory,{offline:true});t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})});f.adapter.policy.artifactTransport='r2';f.host.data.cache=[oldImage.ref]
  const operation=await f.run('prepare');assert.equal(operation.status,'failed');assert.equal(operation.errors.forward.code,'OFFLINE_IMAGE_MISSING');assert.equal(f.host.data.calls.some(args=>args.includes('pull')||args.includes('stop')),false)
})
test('prepare interruption after cache qualification reconstructs only private overlays and never repeats daemon writes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'release-r2-resume-')),f=fixture(directory,{offline:true});t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})});f.adapter.policy.artifactTransport='r2'
  const{operation}=f.executor.submit(f.request('prepare'));f.journal.patch(operation.key,{status:'uncertain'})
  const result=await f.executor.reconcile(f.journal.get(operation.key));assert.equal(result.status,'succeeded',JSON.stringify(result));const overlay=JSON.parse(await readFile(join(directory,f.release.releaseId,'main-runtime-a-forward.json'),'utf8'));assert.equal(overlay.services.web.image,newImage.configDigest)
  assert.equal(f.host.data.calls.some(args=>args.includes('pull')||args.includes('load')||args.includes('up')||args.includes('stop')),false)
})
test('artifact HTTP routes use executor auth and exact registered wire; response-loss status returns durable indexes',async t=>{
  const f=await setup(t),token='a'.repeat(40),executor={adapter:{artifacts:f.cache,policy:f.policy}},server=createExecutorServer({executor,token});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)))
  const url=`http://127.0.0.1:${server.address().port}`,headers={authorization:`Bearer ${token}`,'content-type':'application/json'}
  assert.equal((await fetch(`${url}/artifact-status`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f.request)})).status,401)
  const partHeaders={authorization:`Bearer ${token}`,'content-type':'application/octet-stream','x-lingxi-release-id':f.request.releaseId,'x-lingxi-target':f.request.target,'x-lingxi-manifest-hash':f.request.manifestHash,'x-lingxi-config-digest':f.request.configDigest,'x-lingxi-part-index':'0'}
  assert.equal((await fetch(`${url}/artifact-parts`,{method:'PUT',headers:partHeaders,body:f.parts[0]})).status,200)
  const status=await fetch(`${url}/artifact-status`,{method:'POST',headers,body:JSON.stringify(f.request)}).then(response=>response.json());assert.deepEqual(status.receivedParts,[0]);assert.equal(status.configDigest,f.image.configDigest);assert.equal(status.archiveSha256,f.image.archive.sha256)
})
