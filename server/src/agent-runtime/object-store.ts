import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { RuntimeObjectStore } from '@lyyzka/lingxios'
import { env } from '../env.js'
import { readStorageBodyBounded } from '../storage.js'

function checkedKey(key: string): string {
  if (!/^(artifacts\/[a-f0-9]{64}\/[a-f0-9]{64}|workspaces\/[a-f0-9]{64}\/[a-f0-9]{64}-\d+\/[a-f0-9-]{36}\/[a-f0-9]{64})$/.test(key)) throw new Error('invalid runtime object key')
  return key
}

/** Runtime bytes never go through the public files route or a CDN URL. */
export function createRuntimeObjectStore(bucket: string): RuntimeObjectStore & { close(): void } {
  if (!bucket || bucket === env.R2_BUCKET) throw new Error('runtime storage requires a separate private bucket')
  const accessKeyId = process.env.LINGXIOS_R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.LINGXIOS_R2_SECRET_ACCESS_KEY?.trim()
  if (!env.R2_ENDPOINT || !accessKeyId || !secretAccessKey) throw new Error('runtime storage endpoint and dedicated credentials are required')
  const client = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }, maxAttempts: 2 })
  return {
    async put(key, bytes, signal) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: checkedKey(key), Body: bytes,
        ContentType: 'application/octet-stream', CacheControl: 'private, no-store' }), { abortSignal: signal })
    },
    async get(key, maxBytes, signal) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: checkedKey(key) }), { abortSignal: signal })
        if (result.ContentLength !== undefined && result.ContentLength > maxBytes) {
          const body = result.Body as { destroy?: () => void } | undefined
          body?.destroy?.()
          throw new Error('runtime object exceeds its commitment')
        }
        return await readStorageBodyBounded(result.Body, maxBytes, signal)
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') return null
        throw error
      }
    },
    async delete(key, signal) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: checkedKey(key) }), { abortSignal: signal }) },
    async list(prefix, cursor, limit, signal) {
      if (prefix !== 'workspaces/' || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid runtime object scan')
      const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: cursor, MaxKeys: limit }), { abortSignal: signal })
      return { objects: (result.Contents ?? []).filter(item => item.Key && item.LastModified)
        .map(item => ({ key: item.Key!, updatedAt: item.LastModified!.toISOString() })),
        ...(result.NextContinuationToken ? { cursor: result.NextContinuationToken } : {}) }
    },
    close() { client.destroy() },
  }
}
