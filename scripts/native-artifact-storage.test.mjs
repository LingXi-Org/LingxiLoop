import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nativeArtifactStorageConfiguration, nativeArtifactRuntimeConfiguration, nativeFixtureAsset } from './native-artifact-storage.mjs'

test('acceptance storage permits only its dedicated loopback bucket and fixed test credentials', () => {
  const configuration = nativeArtifactStorageConfiguration()
  assert.equal(configuration.R2_ENDPOINT, 'http://127.0.0.1:29000')
  assert.equal(configuration.R2_BUCKET, 'native-artifact-candidate-test')
  assert.deepEqual(nativeArtifactStorageConfiguration(configuration), configuration)
  for (const key of Object.keys(configuration)) assert.throws(() => nativeArtifactStorageConfiguration({ [key]: 'production-value' }), { code: 'ERR_ASSERTION' })
  assert.throws(() => nativeArtifactStorageConfiguration({}, 'https://production.example'))
})

test('fidelity native baseline gets separate storage on its own fixed origin',()=>{
  const baseline=nativeArtifactStorageConfiguration({},'https://localhost:24411')
  assert.equal(baseline.R2_BUCKET,'native-artifact-baseline-test')
  assert.equal(baseline.R2_PUBLIC_BASE,'https://localhost:24411/native-artifact-objects')
  assert.deepEqual(nativeArtifactStorageConfiguration(baseline,'https://localhost:24411'),baseline)
  assert.throws(()=>nativeArtifactStorageConfiguration(baseline,'https://localhost:24412'))
})

test('production acceptance configures independent runtime storage, Redis and control listeners for both arms',()=>{
  const arms=['https://localhost:24411','https://localhost:24412'].map(origin=>({files:nativeArtifactStorageConfiguration({},origin),runtime:nativeArtifactRuntimeConfiguration({},origin)}))
  for(const {files,runtime}of arms){assert.notEqual(runtime.LINGXIOS_R2_BUCKET,files.R2_BUCKET);assert.ok(runtime.LINGXIOS_SERVICE_TOKEN.length>=32);assert.ok(Number(runtime.AGENT_OS_INPUT_COST_MICROS_PER_MILLION)>0||Number(runtime.AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION)>0,'the published runtime requires a positive production token tariff even when no model calls are made');assert.equal(runtime.AGENT_OS_EMBEDDING_INPUT_COST_MICROS_PER_MILLION,'0');assert.equal(runtime.AGENT_OS_EMBEDDING_DIMENSIONS,'1024')}
  for(const key of ['LINGXIOS_R2_BUCKET','LINGXIOS_REALTIME_REDIS_URL','LINGXIOS_CONTROL_PORT'])assert.notEqual(arms[0].runtime[key],arms[1].runtime[key])
  assert.throws(()=>nativeArtifactRuntimeConfiguration({LINGXIOS_R2_BUCKET:'other'},'https://localhost:24411'))
})

test('native fixture asset retains stable IDs and dimensions with the product upload URL and exact bytes', () => {
  const image = { id: 'image-1', sha256: 'a'.repeat(64), contentType: 'image/png', width: 640, height: 360 }
  const uploaded = { id: 'b'.repeat(32), url: `/api/artifacts/test-slide/assets/${'b'.repeat(32)}`, sha256: image.sha256, contentType: image.contentType }
  assert.deepEqual(nativeFixtureAsset(image, uploaded, 'test-slide'), { ...image, url: uploaded.url })
  for (const patch of [{ sha256: 'c'.repeat(64) }, { contentType: 'image/jpeg' }, { url: 'https://example.test/image.png' }, { id: '../file' }]) {
    assert.throws(() => nativeFixtureAsset(image, { ...uploaded, ...patch }, 'test-slide'))
  }
  assert.throws(() => nativeFixtureAsset(image, uploaded, 'other-artifact'))
})

test('workflow pins real MinIO and service uses protected uploads only for native Slides', () => {
  const workflow = readFileSync(new URL('../.github/workflows/native-artifact-acceptance.yml', import.meta.url), 'utf8')
  for (const required of ['scripts/native-artifact-minio.Dockerfile', 'native-artifact-minio:acceptance server /data', '127.0.0.1:29000:9000', 'MINIO_ROOT_USER=native-artifact-access', 'MINIO_ROOT_PASSWORD=native-artifact-storage-test-only', 'native-artifact-minio']) assert.ok(workflow.includes(required), required)
  const storageBuild = readFileSync(new URL('./native-artifact-minio.Dockerfile', import.meta.url), 'utf8')
  assert.match(storageBuild, /MINIO_COMMIT=0d7408fc9969caf07de6a8c3a84f9fbb10a6739e/)
  assert.match(storageBuild, /test "\$\(git rev-parse HEAD\)" = "\$MINIO_COMMIT"/)
  const service = readFileSync(new URL('./native-artifact-serve.mjs', import.meta.url), 'utf8')
  assert.match(service, /if \(args\.format === 'native'\) \{\s+if \(kind === 'slides'\)/)
  assert.match(service, /\/assets\?name=/)
  assert.match(service, /nativeFixtureAsset\(image, await response\.json\(\), artifact\.id\)/)
  assert.match(service, /type: 'asset\.set', asset/)
})
