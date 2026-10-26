import test from 'node:test'
import assert from 'node:assert/strict'
import {assertLocalReadinessUrl} from './local-control.mjs'
const interfaces={lo:[{address:'127.0.0.1'}],eth1:[{address:'10.20.0.2'}]}
test('node readiness allows an HTTP literal proved to belong to this machine',()=>{
  assert.doesNotThrow(()=>assertLocalReadinessUrl(new URL('http://10.20.0.2:5183/api/readyz'),interfaces))
  assert.doesNotThrow(()=>assertLocalReadinessUrl(new URL('http://127.0.0.1:5183/api/readyz'),interfaces))
})
test('another private host or DNS name cannot replace actual local-node readiness',()=>{
  for(const url of ['http://10.20.0.3:5183/api/readyz','http://loop.example.invalid/api/readyz','http://private-node.example.invalid:5183/api/readyz'])assert.throws(()=>assertLocalReadinessUrl(new URL(url),interfaces),{code:'INVALID_POLICY'})
})

import{mkdtemp,mkdir,writeFile,unlink,rm}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{localControl}from'./local-control.mjs'
import{Journal,hash,fault}from'./journal.mjs'
import{artifactFixture,byteHash}from'./fixtures/artifact.mjs'
import{archiveIdentityHash,archiveReceiptPath}from'./image-identity.mjs'
test('readiness uses the completed private R2 receipt for a regenerated Docker identity and refuses its absence or tampering',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'release-r2-readiness-'));t.after(()=>rm(directory,{recursive:true,force:true}));const f=artifactFixture(),image=f.image,id=byteHash('qualified daemon platform'),containerId='a'.repeat(64)
 const actual={Id:id,Descriptor:{digest:id,mediaType:'application/vnd.oci.image.manifest.v1+json'},RepoTags:[image.archive.tag],RepoDigests:[],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:image.diffIds},Config:JSON.parse(f.config).config}
 const receipt={version:1,state:'verified',artifactHash:archiveIdentityHash(image),configDigest:image.configDigest,archiveSha256:image.archive.sha256,tag:image.archive.tag,roundTrip:{configDigest:image.configDigest,diffIds:image.diffIds},localImageId:id,localIdKind:'platform',descriptor:actual.Descriptor,configurationHash:hash(actual.Config)}
 const path=archiveReceiptPath(directory,image);await mkdir(join(directory,'artifacts','identities'),{recursive:true});await writeFile(path,JSON.stringify(receipt),{mode:0o600})
 const manifest={releaseId:'qualified-image',targets:{'main-runtime-a':{hostPlan:{images:{web:image},contract:{api:'fixed'}}}}},manifestHash=hash(manifest),journal=new Journal(join(directory,'journal.sqlite'));journal.register(manifest,manifestHash);journal.close()
 const policy={stateDirectory:directory,targets:{'main-runtime-a':{project:'original-project',services:{web:{role:'web'}},readinessUrl:'http://127.0.0.1:5183/readyz'}}},calls=[],run=async args=>{calls.push(args);if(args[0]==='ps')return containerId;if(args[0]==='container')return JSON.stringify([{Image:id,State:{Running:true,Health:{Status:'healthy'}}}]);if(args[0]==='image'&&args[1]==='inspect'&&args[2]===id)return JSON.stringify([actual]);throw fault('IMAGE_NOT_FOUND','Not available by the original registry identity')}
 const options={run,fetcher:async()=>new Response(null,{status:200}),interfaces:()=>({lo:[{address:'127.0.0.1'}]})},op={releaseId:manifest.releaseId,manifestHash,target:'main-runtime-a',direction:'forward'}
 assert.equal((await localControl(policy,'readiness',op,options)).ready,true)
 await writeFile(path,JSON.stringify({...receipt,artifactHash:byteHash('wrong')}),{mode:0o600});await assert.rejects(localControl(policy,'readiness',op,options),{code:'IMAGE_IDENTITY_MISMATCH'})
 await unlink(path);await assert.rejects(localControl(policy,'readiness',op,options),{code:'READINESS_UNPROVEN'})
 assert.equal(calls.some(args=>args.includes('load')||args.includes('save')||args.includes('pull')),false)
})
