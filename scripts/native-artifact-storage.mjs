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

export async function ensureNativeArtifactBucket(configuration,origin='https://localhost:24412') {
  const local = nativeArtifactStorageConfiguration(configuration,origin)
  const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({ endpoint: local.R2_ENDPOINT, region: 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: local.R2_ACCESS_KEY_ID, secretAccessKey: local.R2_SECRET_ACCESS_KEY } })
  try {
    // The workflow starts an empty MinIO volume. A stale bucket is a setup error.
    await client.send(new CreateBucketCommand({ Bucket: local.R2_BUCKET }), { abortSignal: AbortSignal.timeout(30000) })
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
