import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'

// This bucket is separate from browser uploads and has no public-read policy.
const storage = new S3Client({ endpoint: 'http://127.0.0.1:59000', region: 'auto', forcePathStyle: true,
  credentials: { accessKeyId: 'lingxiloop-e2e', secretAccessKey: 'lingxiloop-e2e-storage-local' } })
try {
  await storage.send(new CreateBucketCommand({ Bucket: 'lingxiloop-e2e-runtime' }), { abortSignal: AbortSignal.timeout(15000) })
} catch (error) {
  if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists') throw error
} finally { storage.destroy() }
