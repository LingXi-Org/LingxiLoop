import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildManifest, imageArtifact, sourceContractIdentity, configurationsEqual, publicPackageProvenance, verifyAttestationRun, verifiedOciBytes, ghcrConfigBlob } from './release-candidate.mjs'
import { parseVersion, putImmutableObject } from './release-static.mjs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const sha = 'a'.repeat(40), index = `sha256:${'b'.repeat(64)}`, platform = `sha256:${'c'.repeat(64)}`, configDigest = `sha256:${'d'.repeat(64)}`, layer = `sha256:${'e'.repeat(64)}`
const contract = { nativeSchema: 14, productSchema: 57, api: 'api-v1', worker: 'worker-v1', checkpoint: 'checkpoint-v1', control: 'control-v1', capabilities: ['soft-delete'] }
const configuration = { version: 'config-1', secretRefs: ['DB_URL'], volumes: { homes: 'original-homes' } }
const previousImage = { kind: 'image', digest: configDigest }
const current = { releaseId: 'old', appSha: sha, sequence: 1, artifact: previousImage, contract, configuration, hosts: ['a'], verification: { readiness: ['health'], businessProbe: 'conversation-read' }, hostPlan: { version: 1, mode: 'maintenance', images: { web: previousImage, worker: previousImage }, contract, configurationHash: index } }
const worker = { kind: 'worker', workerName: 'lingxiloop-web-static', versionId: '11111111-2222-3333-4444-555555555555', hash: index }
const accepted = { releaseId: 'old', components: { 'main-runtime-a': current, 'main-runtime-b': { ...current, hosts: ['b'] }, 'main-frontend': { ...current, hosts: [], artifact: worker } } }
const input = { accepted, appSha: sha, opsSha: sha, sequence: 2, runId: '1', contractIdentity: () => ({ lingxios: '3.8.12', migrations: [] }) }
test('qualified frontend depends on both backend targets and uses fixed adapters and recovery artifacts', () => {
  const manifest = buildManifest({ ...input, artifacts: { 'main-runtime-a': previousImage, 'main-runtime-b': previousImage, 'main-frontend': worker } })
  assert.deepEqual(manifest.targets['main-frontend'].dependsOn, ['main-runtime-a', 'main-runtime-b'])
  assert.equal(manifest.targets['main-frontend'].adapter, 'web-static')
  assert.deepEqual(manifest.targets['main-runtime-a'].hostPlan.images, { web: previousImage, worker: previousImage })
  assert.deepEqual(manifest.targets['main-runtime-a'].hostPlan.recovery.images, current.hostPlan.images)
  assert.equal(manifest.targets['main-runtime-a'].configuration.volumes.homes, 'original-homes')
})
test('schema/package changes and stale sequence fail with explicit errors', () => {
  let count = 0
  assert.throws(() => buildManifest({ ...input, artifacts: { 'main-runtime-a': previousImage }, contractIdentity: () => ({ schema: count++ }) }), /CONTRACT_CHANGE_REQUIRES_ATTESTATION/)
  assert.throws(() => buildManifest({ ...input, sequence: 1, artifacts: { 'main-frontend': worker } }), /STALE_CANDIDATE/)
})
const rawHash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
function ociFixture() {
  // These are the actual bytes supplied by the registry mocks. All graph
  // digests/sizes are computed from them; no fake digest mapping is injected.
  const config = Buffer.from(`{ "architecture": "amd64", "os": "linux", "rootfs": { "type": "layers", "diff_ids": ["${layer}"] } }`)
  const configHash = rawHash(config)
  const manifest = Buffer.from(`{\n "schemaVersion": 2, "mediaType": "application/vnd.oci.image.manifest.v1+json", "config": {"digest":"${configHash}","size":${config.length}}, "layers": []\n}`)
  const manifestHash = rawHash(manifest)
  const indexBytes = Buffer.from(`{ "schemaVersion":2, "mediaType":"application/vnd.oci.image.index.v1+json", "manifests":[{"digest":"${manifestHash}","size":${manifest.length},"platform":{"os":"linux","architecture":"amd64"}}] }`)
  return { config, configHash, manifest, manifestHash, index: indexBytes, indexHash: rawHash(indexBytes), inspect: reference => reference.endsWith(manifestHash) ? manifest : indexBytes }
}
test('raw OCI index/platform/config bytes prove their separate exact graph identities', async () => {
  const fixture=ociFixture()
  const artifact = await imageArtifact('ghcr.io/lingxi-org/runtime', fixture.indexHash, fixture.inspect, async (_reference,digest) => { assert.equal(digest,fixture.configHash); return fixture.config })
  assert.equal(artifact.digest, fixture.indexHash); assert.equal(artifact.platformDigest, fixture.manifestHash)
  assert.equal(artifact.configDigest, fixture.configHash); assert.deepEqual(artifact.diffIds, [layer])
  assert.deepEqual(Buffer.from(artifact.ociProof.index,'base64'),fixture.index)
  assert.deepEqual(Buffer.from(artifact.ociProof.manifest,'base64'),fixture.manifest)
  assert.deepEqual(Buffer.from(artifact.ociProof.config,'base64'),fixture.config)
})
test('only one buildx transport LF can be stripped and only after matching the expected digest', async () => {
  const fixture=ociFixture()
  const artifact=await imageArtifact('ghcr.io/lingxi-org/runtime',fixture.indexHash,reference=>Buffer.concat([fixture.inspect(reference),Buffer.from('\n')]),async()=>fixture.config)
  assert.deepEqual(Buffer.from(artifact.ociProof.index,'base64'),fixture.index)
  assert.throws(()=>verifiedOciBytes(Buffer.concat([fixture.index,Buffer.from('\n\n')]),fixture.indexHash,'index',true),/OCI_DIGEST_MISMATCH/)
  assert.throws(()=>verifiedOciBytes(Buffer.concat([fixture.index,Buffer.from('\r\n')]),fixture.indexHash,'index',true),/OCI_DIGEST_MISMATCH/)
  await assert.rejects(imageArtifact('ghcr.io/lingxi-org/runtime',fixture.indexHash,fixture.inspect,async()=>Buffer.concat([fixture.config,Buffer.from('\n')])),/OCI_DIGEST_MISMATCH: config/)
})
test('missing, reconstructed and mutated raw graph proof fails closed', async () => {
  const fixture=ociFixture()
  await assert.rejects(imageArtifact('ghcr.io/lingxi-org/runtime',fixture.indexHash,()=>JSON.parse(fixture.index.toString())),/OCI_RAW_PROOF_REQUIRED/)
  await assert.rejects(imageArtifact('ghcr.io/lingxi-org/runtime',fixture.indexHash,()=>Buffer.from(JSON.stringify(JSON.parse(fixture.index.toString())))),/OCI_DIGEST_MISMATCH/)
  await assert.rejects(imageArtifact('ghcr.io/lingxi-org/runtime',fixture.indexHash,()=>{throw new Error('unavailable')}),/OCI_RAW_INDEX_UNAVAILABLE/)
  await assert.rejects(imageArtifact('ghcr.io/lingxi-org/runtime',fixture.indexHash,fixture.inspect,async()=>Buffer.from('mutated config')),/OCI_DIGEST_MISMATCH: config/)
})
test('GHCR config blob authenticates with a scoped pull token and keeps credentials off a signed CDN redirect', async () => {
  const fixture=ociFixture(), calls=[]
  const bytes=await ghcrConfigBlob('ghcr.io/lingxi-org/runtime',fixture.configHash,{env:{GITHUB_ACTOR:'ci-user',GITHUB_TOKEN:'fixture-password'},read:()=>{throw new Error('no Docker config')},fetcher:async(url,init)=>{
    calls.push({url:new URL(url),init})
    if(calls.length===1) { assert.equal(init.headers.authorization,`Basic ${Buffer.from('ci-user:fixture-password').toString('base64')}`);return Response.json({token:'fixture-pull-token'}) }
    if(calls.length===2) { assert.equal(init.headers.authorization,'Bearer fixture-pull-token');return new Response(null,{status:307,headers:{location:'https://pkg-containers.githubusercontent.com/ghcr1/blobs/config?sig=fixture-signed'}}) }
    assert.equal(init.headers,undefined);return new Response(fixture.config)
  }})
  assert.deepEqual(bytes,fixture.config)
  assert.equal(calls[0].url.searchParams.get('scope'),'repository:lingxi-org/runtime:pull')
  assert.equal(calls[1].url.pathname,`/v2/lingxi-org/runtime/blobs/${fixture.configHash}`)
  assert.ok(calls.every(call=>call.init.signal instanceof AbortSignal))
  assert.ok(calls.every(call=>!call.url.href.includes('fixture-password')&&!call.url.href.includes('fixture-pull-token')))
})
test('GHCR reads existing registry-login credentials without placing them in argv or proof', async () => {
  const fixture=ociFixture();let count=0
  const bytes=await ghcrConfigBlob('ghcr.io/lingxi-org/runtime',fixture.configHash,{env:{DOCKER_CONFIG:'/trusted/docker'},read:path=>{assert.equal(path,'/trusted/docker/config.json');return JSON.stringify({auths:{'ghcr.io':{auth:Buffer.from('ci:fixture-docker-secret').toString('base64')}}})},fetcher:async(_url,init)=>{count++;if(count===1){assert.equal(init.headers.authorization,`Basic ${Buffer.from('ci:fixture-docker-secret').toString('base64')}`);return Response.json({access_token:'fixture-short-token'})}return new Response(fixture.config)}})
  assert.deepEqual(bytes,fixture.config)
  await assert.rejects(ghcrConfigBlob('ghcr.io/lingxi-org/runtime',fixture.configHash,{env:{},read:()=>{throw new Error('missing')}}),/GHCR_AUTH_UNAVAILABLE/)
})
test('Worker version ID must come from an actual upload receipt', () => {
  assert.equal(parseVersion('Uploaded Worker Version ID: 11111111-2222-3333-4444-555555555555'), worker.versionId)
  assert.throws(() => parseVersion('deploy started'), /version identity/)
})
test('retained artifact conflict refuses mutation and identical objects are reused', async () => {
  const calls = []
  const options = { account: 'account', bucket: 'releases', token: 'secret', fetcher: async (url, init) => { calls.push(init.method || 'GET'); return new Response('old') } }
  await putImmutableObject('chunks/a.js', Buffer.from('old'), options)
  await assert.rejects(putImmutableObject('chunks/a.js', Buffer.from('changed'), options), /IMMUTABLE_ARTIFACT_CONFLICT/)
  assert.deepEqual(calls, ['GET', 'GET'])
})
test('CI gate keeps every legacy deployment entry while new path uploads and registers only', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
  for (const job of ['update-manifests', 'deploy', 'rollout']) {
    const condition = workflow.split(`\n  ${job}:`)[1].split('    needs:')[0]
    assert.match(condition, /vars.RELEASE_CONTROLLER_ENABLED != 'true' && always\(\)/)
  }
  const next = workflow.split('\n  prepare-static:')[1]
  assert.doesNotMatch(next, /versions deploy|git push|update-deployment-images|trigger-komodo-rollout/)
  assert.match(next, /versions upload/)
  assert.match(next, /secrets.RELEASE_API_TOKEN/)
  assert.match(next, /node scripts\/release-candidate.mjs submit/)
})
test('source contract identity reads the full current locked LingxiOS and product migration inventory', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const identity = sourceContractIdentity(head)
  assert.match(identity.lingxios, /^\d+\.\d+\.\d+$/)
  assert.ok(identity.migrations.length > 0)
  assert.ok(identity.migrations.every(item => /^[a-f0-9]{64}$/.test(item.checksum)))
})

test('accepted configuration compares object keys and secret reference sets semantically', () => {
  assert.equal(configurationsEqual({ version: 'v1', secretRefs: ['B', 'A'], volumes: { a: 'a', b: 'b' } }, { volumes: { b: 'b', a: 'a' }, secretRefs: ['A', 'B'], version: 'v1' }), true)
  assert.equal(configurationsEqual(configuration, { ...configuration, volumes: { homes: 'empty-new-volume' } }), false)
})

function migrationFixture() {
  const oldSha = '1'.repeat(40), nextSha = '2'.repeat(40), recoverySha = '3'.repeat(40)
  const before = { lingxios: '3.8.12', integrity: 'sha512-old', resolved: 'https://npm.pkg.github.com/old', migrations: [{ version: 1, name: 'initial', checksum: '1'.repeat(64) }] }
  const after = { ...before, migrations: [...before.migrations, { version: 2, name: 'soft_delete', checksum: '2'.repeat(64) }] }
  const sourceContract = { ...contract, productSchema: 1, lingxios: before.lingxios, migrations: before.migrations.map(({version,checksum})=>({version,checksum})) }
  const nextContract = { ...sourceContract, productSchema: 2, migrations: after.migrations.map(({version,checksum})=>({version,checksum})) }
  const image = { kind: 'image', digest: index, ref: `ghcr.io/lingxi-org/runtime@${index}`, indexDigest: index, platformDigest: platform, configDigest, os: 'linux', architecture: 'amd64', diffIds: [layer] }
  const oldImage = { ...image, digest: configDigest, indexDigest: configDigest, ref: `ghcr.io/lingxi-org/runtime@${configDigest}` }
  const source = { ...current, appSha: oldSha, contract: sourceContract, artifact: oldImage, hostPlan: { ...current.hostPlan, contract: sourceContract, images: { web: oldImage, worker: oldImage } } }
  const production = { releaseId: 'old', components: { 'main-runtime-a': source, 'main-runtime-b': { ...source, hosts: ['b'] } } }
  const publicPackage = { lingxios: before.lingxios, nativeSchema: 14, controlPlane: 11, schemaHash: '4'.repeat(64) }
  const profileKeys = { source: `14:1:${publicPackage.schemaHash}`, target: `14:2:${publicPackage.schemaHash}`, recovery: `14:2:${publicPackage.schemaHash}` }
  const hostPlan = { mode: 'maintenance', database: { from: {nativeSchema:14,productSchema:1},to:{nativeSchema:14,productSchema:2},strategy:'maintenance',rpo:'zero-committed-writes',migrations:after.migrations }, recovery: { appSha:recoverySha,artifact:image,images:{web:image,worker:image},contract:nextContract,configurationHash:index } }
  const attestation = {version:1,appSha:nextSha,opsSha:sha,targets:Object.fromEntries(['main-runtime-a','main-runtime-b'].map(id=>[id,{contract:nextContract,publicPackage,profileKeys,hostPlan:structuredClone(hostPlan)}]))}
  return { accepted:production,artifacts:{'main-runtime-a':image,'main-runtime-b':image},appSha:nextSha,opsSha:sha,sequence:2,runId:'1',attestation,publicPackage,contractIdentity:commit=>commit===oldSha?before:after }
}
test('exact app attestation permits full maintenance migration with separate source and compatible recovery', () => {
  const fixture = migrationFixture(), manifest = buildManifest(fixture)
  const a = manifest.targets['main-runtime-a'], b = manifest.targets['main-runtime-b']
  assert.equal(a.contract.productSchema, 2)
  assert.deepEqual(a.hostPlan.database.migrations, fixture.attestation.targets['main-runtime-a'].hostPlan.database.migrations)
  assert.equal(a.hostPlan.source.contract.productSchema, 1)
  assert.equal(a.hostPlan.recovery.contract.productSchema, 2)
  assert.equal(a.hostPlan.source.images.web.digest, configDigest)
  assert.equal(a.hostPlan.recovery.images.web.digest, index)
  assert.equal(b.hostPlan.database, undefined)
})
test('attestation rejects wrong commit, omitted/rewritten migrations, unverified package and old-schema recovery', () => {
  for (const mutate of [
    value=>{value.attestation.appSha=sha},
    value=>{value.attestation.targets['main-runtime-a'].hostPlan.database.migrations.pop()},
    value=>{value.attestation.targets['main-runtime-a'].hostPlan.database.migrations[0].checksum='f'.repeat(64)},
    value=>{value.publicPackage={...value.publicPackage,nativeSchema:15}},
    value=>{value.attestation.targets['main-runtime-a'].publicPackage={...value.publicPackage,controlPlane:99}},
    value=>{value.attestation.targets['main-runtime-a'].hostPlan.database.from.productSchema=0},
    value=>{value.attestation.targets['main-runtime-a'].hostPlan.recovery.contract.productSchema=1},
    value=>{value.attestation.targets['main-runtime-a'].profileKeys.target='14:2:invented'},
    value=>{delete value.artifacts['main-runtime-b']},
  ]) {
    const fixture=migrationFixture(); mutate(fixture)
    assert.throws(()=>buildManifest(fixture),/CONTRACT_CHANGE_REQUIRES_ATTESTATION/)
  }
  const missing=migrationFixture();delete missing.attestation
  assert.throws(()=>buildManifest(missing),/CONTRACT_CHANGE_REQUIRES_ATTESTATION/)
})
test('ordinary same-schema release strips a previous database migration plan', () => {
  const fixture=migrationFixture(), previous=fixture.accepted.components['main-runtime-a']
  previous.hostPlan.database=fixture.attestation.targets['main-runtime-a'].hostPlan.database
  const manifest=buildManifest({...fixture,appSha:previous.appSha,attestation:undefined})
  assert.equal(manifest.targets['main-runtime-a'].hostPlan.database,undefined)
  assert.equal(manifest.targets['main-runtime-a'].hostPlan.source.contract.productSchema,1)
})

test('published package schema provenance uses public exports and actual schema bytes', async () => {
  const proof=await publicPackageProvenance(async()=>({releaseVersions:{runtime:'3.8.12',schema:14,controlPlane:11},packageResources:()=>({schema:'/formal/schema.sql'})}),file=>{assert.equal(file,'/formal/schema.sql');return Buffer.from('published schema')})
  assert.equal(proof.lingxios,'3.8.12');assert.equal(proof.controlPlane,11);assert.match(proof.schemaHash,/^[a-f0-9]{64}$/)
  await assert.rejects(publicPackageProvenance(async()=>({releaseVersions:{runtime:'3.8.12'}})),/public exports/)
})
test('contract artifacts require a successful exact-source run in this repository', () => {
  const run={conclusion:'success',head_sha:sha,repository:{full_name:'LingXi-Org/LingxiLoop'}}
  assert.doesNotThrow(()=>verifyAttestationRun(run,sha,'LingXi-Org/LingxiLoop'))
  for(const bad of [{...run,conclusion:'failure'},{...run,head_sha:'b'.repeat(40)},{...run,repository:{full_name:'other/repo'}}]) assert.throws(()=>verifyAttestationRun(bad,sha,'LingXi-Org/LingxiLoop'),/successful same-repository run/)
})

test('a single-platform registry manifest preserves the same exact index and platform bytes', async () => {
  const fixture=ociFixture();let calls=0
  const artifact=await imageArtifact('ghcr.io/lingxi-org/runtime',fixture.manifestHash,()=>{calls++;return fixture.manifest},async()=>fixture.config)
  assert.equal(calls,1);assert.equal(artifact.indexDigest,artifact.platformDigest)
  assert.deepEqual(Buffer.from(artifact.ociProof.index,'base64'),Buffer.from(artifact.ociProof.manifest,'base64'))
})
test('GHCR rejects an untrusted blob redirect before sending any request or credential there', async () => {
  const fixture=ociFixture();let calls=0
  await assert.rejects(ghcrConfigBlob('ghcr.io/lingxi-org/runtime',fixture.configHash,{env:{GITHUB_ACTOR:'ci-user',GITHUB_TOKEN:'fixture-password'},read:()=>{throw new Error('missing')},fetcher:async()=>{calls++;if(calls===1)return Response.json({token:'fixture-pull-token'});return new Response(null,{status:307,headers:{location:'https://untrusted.example/config'}})}}),/GHCR_BLOB_REDIRECT_UNTRUSTED/)
  assert.equal(calls,2)
})
function runtimePatch57Fixture(){
 const f=migrationFixture(),old=f.accepted.components['main-runtime-a'].appSha,recoverySha=f.attestation.targets['main-runtime-a'].hostPlan.recovery.appSha
 const rows=Array.from({length:57},(_,i)=>({version:i+1,name:`migration_${i+1}`,checksum:String(i%10).repeat(64)})),before={...f.contractIdentity(old),migrations:rows},after={...before,lingxios:'3.8.13',integrity:`sha512-${'A'.repeat(86)}==`,resolved:`https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.13/${'b'.repeat(40)}`}
 f.publicPackage={...f.publicPackage,lingxios:'3.8.13'};f.contractIdentity=commit=>commit===old?before:after
 for(const id of ['main-runtime-a','main-runtime-b']){
  const current=f.accepted.components[id],override=f.attestation.targets[id],source={...current.contract,lingxios:'3.8.12',productSchema:57,migrations:inventory(rows)}
  current.contract=source;current.hostPlan.contract=source
  override.contract={...source,lingxios:'3.8.13'};override.publicPackage=f.publicPackage;override.profileKeys={source:`14:57:${f.publicPackage.schemaHash}`,target:`14:57:${f.publicPackage.schemaHash}`,recovery:`14:57:${f.publicPackage.schemaHash}`}
  const descriptor={runtime:'3.8.12',schema:14,protocol:11,schemaHash:f.publicPackage.schemaHash,productVersion:57,migrations:rows}
  override.hostPlan.database={...override.hostPlan.database,from:{nativeSchema:14,productSchema:57},to:{nativeSchema:14,productSchema:57},migrations:structuredClone(rows),runtimePatch:{source:descriptor,target:{...structuredClone(descriptor),runtime:'3.8.13',integrity:after.integrity,tarball:after.resolved}}}
  override.hostPlan.recovery.contract=override.contract;override.hostPlan.recovery.appSha=recoverySha
 }
 return f
}
const inventory=rows=>rows.map(({version,checksum})=>({version,checksum}))
test('SDK12 to SDK13 attestation must bind the exact fixed CAS57 package and unchanged named inventory',()=>{
 assert.equal(buildManifest(runtimePatch57Fixture()).targets['main-runtime-a'].hostPlan.database.runtimePatch.target.runtime,'3.8.13')
 for(const mutate of [o=>{delete o.hostPlan.database.runtimePatch},o=>{o.hostPlan.database.runtimePatch.target.integrity=`sha512-${'B'.repeat(86)}==`},o=>{o.hostPlan.database.runtimePatch.source.runtime='3.8.11'},o=>{o.hostPlan.database.runtimePatch.target.tarball=`https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.13/${'c'.repeat(40)}`}]){
  const f=runtimePatch57Fixture();for(const o of Object.values(f.attestation.targets))mutate(o);assert.throws(()=>buildManifest(f),/CONTRACT_CHANGE_REQUIRES_ATTESTATION/)
 }
})
