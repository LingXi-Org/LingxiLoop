import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Readable} from 'node:stream'
import {ArtifactCache} from './artifact-cache.mjs'
import {runDocker} from './adapter.mjs'
import {verifyArchiveTar} from './artifact-tar.mjs'
import {inspectQualifiedImage} from './image-identity.mjs'
import {hash} from './journal.mjs'

// Opt-in local fixture only. The producer records that its OCI graph is synthetic, not registry provenance.
test('CI-produced local Docker save/gzip fixture loads and daemon roundtrip proves the same raw config and layers',{skip:!process.env.RELEASE_HOST_ARCHIVE_FIXTURE},async t=>{
  const source=process.env.RELEASE_HOST_ARCHIVE_FIXTURE,directory=await mkdtemp(join(tmpdir(),'release-archive-integration-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const image=JSON.parse(await readFile(join(source,'artifact.json'),'utf8')),archive=await readFile(join(source,'image.tar.gz')),calls=[],binary=process.env.RELEASE_HOST_DOCKER_BIN??'/usr/local/bin/docker'
  await verifyArchiveTar(join(source,'image.tar.gz'),image)
  const run=async(args,options)=>{calls.push(args);return runDocker(args,{...options,binary})}
  const version=JSON.parse(await run(['version','--format','{{json .Server}}']));t.diagnostic(`Actual local Docker ${version.Version}/${version.Os}/${version.Arch}; no registry or product container operations`)
  // Load exactly the producer fixture; retain its existing tag and original evidence for parent verification.
  await run(['image','load','--input',join(source,'image.tar.gz')])
  const request={releaseId:'local-ci-archive-fixture',target:'main-runtime-a',manifestHash:hash(image),configDigest:image.configDigest},manifest={targets:{'main-runtime-a':{hostPlan:{images:{web:image},recovery:{images:{web:image}}}}}},journal={manifest:(id,expected)=>{assert.equal(id,request.releaseId);assert.equal(expected,request.manifestHash);return manifest}},policy={stateDirectory:directory,targets:{'main-runtime-a':{}}},cache=new ArtifactCache(policy,{journal,run})
  let offset=0;for(let index=0;index<image.archive.parts.length;index++){const part=image.archive.parts[index];await cache.put(request,index,Readable.from([archive.subarray(offset,offset+part.size)]));offset+=part.size}
  const identity=await cache.ensure(image);assert.equal(identity.identity,'archive-verified');assert.equal(identity.configDigest,image.configDigest);assert.equal(identity.archiveSha256,image.archive.sha256)
  assert.equal((await cache.status(request)).imageReady,true);assert.equal((await inspectQualifiedImage(run,image,undefined,{stateDirectory:directory})).localImageId,identity.localImageId)
  assert.equal(calls.filter(args=>args[1]==='load').length,1);assert.equal(calls.filter(args=>args[1]==='save').length,1);assert.equal(calls.some(args=>args.includes('pull')||args.includes('build')||args.includes('stop')||args.includes('rm')),false)
})
