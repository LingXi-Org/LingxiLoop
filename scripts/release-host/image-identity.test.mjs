import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {assertImageIdentity,verifyOciProof,inspectQualifiedImage} from './image-identity.mjs'
import {fixture,newImage} from './fixtures/fake-host.mjs'
import {fault} from './journal.mjs'
const exec=promisify(execFile)
function actual(kind='index') {return{Id:kind==='index'?newImage.indexDigest:kind==='platform'?newImage.platformDigest:newImage.configDigest,Descriptor:{digest:kind==='index'?newImage.indexDigest:newImage.platformDigest,mediaType:kind==='index'?'application/vnd.oci.image.index.v1+json':'application/vnd.oci.image.manifest.v1+json'},RepoDigests:[`old-mirror.invalid/ghcr.io/lingxi-org/app@${newImage.indexDigest}`],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:newImage.diffIds},Config:JSON.parse(Buffer.from(newImage.ociProof.config,'base64')).config}}
test('Docker29 index/platform IDs and classic config IDs keep their separate graph-proven identities',()=>{
  for(const kind of ['index','platform','config']) {const result=assertImageIdentity(actual(kind),newImage);assert.equal(result.localIdKind,kind);assert.equal(result.localImageId,actual(kind).Id);assert.equal(result.configDigest,newImage.configDigest)}
})
test('wrong descriptor type, platform, layer order or graph-bound config is rejected',()=>{
  const variants=[value=>value.Descriptor.mediaType='application/vnd.oci.image.manifest.v1+json',value=>value.Architecture='arm64',value=>value.RootFS.Layers=['sha256:'+'0'.repeat(64)],value=>value.Config.Env=['WRONG_CONFIG=true'],value=>value.RepoDigests=['ghcr.io/unrelated/app@sha256:'+'9'.repeat(64)]]
  for(const mutate of variants){const value=actual();mutate(value);assert.throws(()=>assertImageIdentity(value,newImage),{code:'IMAGE_IDENTITY_MISMATCH'})}
})
test('containerd index ID cannot be accepted without the full raw graph or with reconstructed/tampered proof',()=>{
  const missing=structuredClone(newImage);delete missing.ociProof;assert.throws(()=>assertImageIdentity(actual(),missing),{code:'IMAGE_IDENTITY_MISMATCH'})
  const changed=structuredClone(newImage);changed.ociProof.config=Buffer.from(Buffer.from(changed.ociProof.config,'base64').toString()+'\n').toString('base64');assert.throws(()=>verifyOciProof(changed),{code:'IMAGE_IDENTITY_MISMATCH'})
})
test('canonical cache-ref miss resolves the existing Docker local index offline, without pull or tagging',async()=>{
  const calls=[],run=async args=>{calls.push(args);if(args[2]===newImage.ref)throw fault('IMAGE_NOT_FOUND','Not cached by canonical name');assert.equal(args[2],newImage.indexDigest);return JSON.stringify([actual()])}
  const identity=await inspectQualifiedImage(run,newImage);assert.equal(identity.localIdKind,'index');assert.deepEqual(calls.map(args=>args[1]),['inspect','inspect'])
})
test('a qualified opaque local index cannot be labelled as a config digest',()=>{
  const local={kind:'local-qualified',ref:newImage.indexDigest,localImageId:newImage.indexDigest,localIdKind:'index',os:'linux',architecture:'amd64',diffIds:newImage.diffIds,sourceEvidence:{mode:'repo',commit:'a'.repeat(40)}},profile={localImageId:local.localImageId,localIdKind:'index',sourceEvidence:local.sourceEvidence}
  assert.equal(assertImageIdentity(actual(),local,profile).localIdKind,'index')
  assert.throws(()=>assertImageIdentity(actual(),{...local,localIdKind:'config'},{...profile,localIdKind:'config'}),{code:'IMAGE_IDENTITY_MISMATCH'})
  assert.throws(()=>assertImageIdentity(actual(),{...local,configDigest:local.localImageId},profile),{code:'LOCAL_IMAGE_UNQUALIFIED'})
})
test('Docker29 prepare/apply/verify use the verified local index in every offline overlay/container comparison',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'release-docker29-')),f=fixture(directory,{storeKind:'index',offline:true});t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})})
  for(const phase of ['prepare','drain','apply','verify','undrain']){const result=await f.run(phase);assert.equal(result.status,'succeeded',JSON.stringify(result));if(phase==='prepare')assert.ok(result.result.prepared.every(identity=>identity.localIdKind==='index'))}
  const overlay=JSON.parse(await readFile(join(directory,f.release.releaseId,'main-runtime-a-forward.json'),'utf8'));assert.equal(overlay.services.web.image,newImage.indexDigest);assert.equal(f.host.data.containers.web.Image,newImage.indexDigest);assert.equal(f.host.data.calls.some(args=>args.includes('tag')||args[0]==='image'&&args[1]==='pull'),false)
})
test('Compose accepts an exact inspected local ID in an offline service config',{skip:process.env.RELEASE_HOST_DOCKER_TEST!=='1'},async t=>{
  const binary=process.env.RELEASE_HOST_DOCKER_BIN??'/usr/local/bin/docker',directory=await mkdtemp(join(tmpdir(),'release-local-id-compose-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const{stdout}=await exec(binary,['image','inspect','pgvector/pgvector:pg16'],{encoding:'utf8'}),[image]=JSON.parse(stdout),path=join(directory,'compose.json')
  await writeFile(path,JSON.stringify({services:{'identity-check':{image:image.Id,pull_policy:'never'}}}))
  const config=JSON.parse((await exec(binary,['compose','--project-name','release-identity-read-only','--file',path,'config','--format','json'],{encoding:'utf8'})).stdout)
  assert.equal(config.services['identity-check'].image,image.Id);assert.equal(config.services['identity-check'].pull_policy,'never')
})
