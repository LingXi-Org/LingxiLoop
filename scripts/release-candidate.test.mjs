import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildManifest, imageArtifact, sourceContractIdentity, configurationsEqual, publicPackageProvenance, verifyAttestationRun } from './release-candidate.mjs'
import { parseVersion, putImmutableObject } from './release-static.mjs'
import { execFileSync } from 'node:child_process'
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
test('index/platform/config and uncompressed layer digests retain their separate identities', () => {
  const artifact = imageArtifact('ghcr.io/lingxi-org/runtime', index, ref => ref.endsWith(index) ? { manifests: [{ digest: platform, platform: { os: 'linux', architecture: 'amd64' } }] } : { config: { digest: configDigest } }, () => ({ os: 'linux', architecture: 'amd64', rootfs: { diff_ids: [layer] } }))
  assert.equal(artifact.digest, index); assert.equal(artifact.platformDigest, platform)
  assert.equal(artifact.configDigest, configDigest); assert.deepEqual(artifact.diffIds, [layer])
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
