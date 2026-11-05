import assert from 'node:assert/strict'

/** Fixed local acceptance storage. Never inherit a real bucket or credential. */
export function nativeArtifactStorageConfiguration(env = {}, origin = 'https://localhost:24412') {
  assert.ok(['https://localhost:24411','https://localhost:24412'].includes(origin), 'native acceptance storage requires its dedicated local origin')
  const arm=origin.endsWith(':24411')?'baseline':'candidate'
  const configuration = {
    R2_ENDPOINT: 'http://127.0.0.1:29000', R2_BUCKET: `native-artifact-${arm}-test`,
    R2_ACCESS_KEY_ID: 'native-artifact-access', R2_SECRET_ACCESS_KEY: 'native-artifact-storage-test-only',
    R2_PUBLIC_BASE: `${origin}/native-artifact-objects`, R2_URL_SIGNING_SECRET: 'native-artifact-local-test-only',
  }
  for (const [name, value] of Object.entries(configuration)) {
    assert.ok(env[name] === undefined || env[name] === value, `acceptance refuses inherited ${name}`)
  }
  return configuration
}

/** The real production Web reader also owns runtime object/preview adapters and
 * a control listener. Each arm uses independent local namespaces. */
export function nativeArtifactRuntimeConfiguration(env={},origin='https://localhost:24412') {
  nativeArtifactStorageConfiguration({},origin)
  const baseline=origin.endsWith(':24411'),arm=baseline?'baseline':'candidate'
  const configuration={
    LINGXIOS_R2_BUCKET:`native-artifact-${arm}-runtime-test`,
    LINGXIOS_R2_ACCESS_KEY_ID:'native-artifact-access',LINGXIOS_R2_SECRET_ACCESS_KEY:'native-artifact-storage-test-only',
    LINGXIOS_REALTIME_REDIS_URL:`redis://127.0.0.1:26379/${baseline?3:4}`,
    LINGXIOS_CONTROL_HOST:'127.0.0.1',LINGXIOS_CONTROL_PORT:baseline?'24911':'24912',
    LINGXIOS_SERVICE_TOKEN:'native-artifact-local-service-test-only-credentials',
    // The official runtime rejects zero monetary tariffs in production. This
    // synthetic positive tariff is never charged: the provider is closed and
    // no Worker is started by the performance fixture.
    AGENT_OS_INPUT_COST_MICROS_PER_MILLION:'1',AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION:'1',
    AGENT_OS_EMBEDDING_INPUT_COST_MICROS_PER_MILLION:'0',AGENT_OS_EMBEDDING_DIMENSIONS:'1024',
  }
  for(const [name,value]of Object.entries(configuration))assert.ok(env[name]===undefined||env[name]===value,`acceptance refuses inherited ${name}`)
  return configuration
}

export async function ensureNativeArtifactBucket(configuration,origin='https://localhost:24412') {
  const local = nativeArtifactStorageConfiguration(configuration,origin)
  const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({ endpoint: local.R2_ENDPOINT, region: 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: local.R2_ACCESS_KEY_ID, secretAccessKey: local.R2_SECRET_ACCESS_KEY } })
  try {
    // The workflow starts an empty MinIO volume. A stale bucket is a setup error.
    const runtime=nativeArtifactRuntimeConfiguration({},origin)
    for(const Bucket of [local.R2_BUCKET,runtime.LINGXIOS_R2_BUCKET])await client.send(new CreateBucketCommand({ Bucket }), { abortSignal: AbortSignal.timeout(30000) })
  } finally { client.destroy() }
}

/** Keep semantic fixture IDs while referencing the actual immutable upload. */
export function nativeFixtureAsset(image, uploaded, artifactId) {
  assert.match(uploaded?.id ?? '', /^[a-f0-9]{32}$/)
  assert.equal(uploaded.url, `/api/artifacts/${encodeURIComponent(artifactId)}/assets/${uploaded.id}`)
  assert.equal(uploaded.sha256, image.sha256, 'uploaded fixture image bytes changed')
  assert.equal(uploaded.contentType, image.contentType)
  return { id: image.id, url: uploaded.url, sha256: uploaded.sha256, contentType: uploaded.contentType,
    width: image.width, height: image.height }
}
