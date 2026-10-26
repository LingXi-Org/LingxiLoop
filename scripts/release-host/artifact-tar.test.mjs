// Historical archive evidence remains readable after retiring image distribution.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateArchive,verifyArchiveTar,MAX_PART} from './artifact-tar.mjs'
import {artifactFixture,byteHash} from './fixtures/artifact.mjs'
async function setup(t,options={}){const directory=await mkdtemp(join(tmpdir(),'legacy-artifact-evidence-'));t.after(()=>rm(directory,{recursive:true,force:true}));return {...artifactFixture(options),directory}}
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
