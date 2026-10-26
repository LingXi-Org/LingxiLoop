import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {artifactFixture,byteHash} from './fixtures/artifact.mjs'
import {archiveIdentityHash,archiveReceiptPath,inspectQualifiedImage} from './image-identity.mjs'
import {hash} from './journal.mjs'
test('historical completed load receipts still prove local recovery images without any load, fetch or write',async t=>{
 const f=artifactFixture(),directory=await mkdtemp(join(tmpdir(),'legacy-readback-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const actual={Id:byteHash('legacy-regenerated-index'),Descriptor:{digest:byteHash('legacy-regenerated-index'),mediaType:'application/vnd.oci.image.index.v1+json',size:800},RepoTags:[f.image.archive.tag],RepoDigests:[],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:f.image.diffIds},Config:JSON.parse(f.config).config}
 const receipt={version:1,state:'verified',artifactHash:archiveIdentityHash(f.image),archiveSha256:f.image.archive.sha256,configDigest:f.image.configDigest,tag:f.image.archive.tag,localImageId:actual.Id,localIdKind:'index',descriptor:actual.Descriptor,configurationHash:hash(actual.Config),roundTrip:{configDigest:f.image.configDigest,diffIds:f.image.diffIds}}
 const path=archiveReceiptPath(directory,f.image);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(receipt),{mode:0o600})
 const calls=[],run=async args=>{calls.push(args);return JSON.stringify([actual])}
 assert.equal((await inspectQualifiedImage(run,f.image,undefined,{stateDirectory:directory})).localImageId,actual.Id)
 actual.RootFS.Layers=[byteHash('changed')]
 await assert.rejects(inspectQualifiedImage(run,f.image,undefined,{stateDirectory:directory}),{code:'IMAGE_IDENTITY_MISMATCH'})
 assert.ok(calls.every(args=>args[0]==='image'&&args[1]==='inspect'))
})
