/**
 * Native R2 object storage. Startup fails unless the complete storage
 * contract is configured; there is no disk or presigned-read alternate.
 *
 * Surface area kept deliberately small:
 *   - `put(key, body, mime)` — write bytes, return the public URL
 *   - `presignPut(key, mime)` — short-lived URL the browser PUTs to
 *   - `publicUrl(key)` — HMAC-gated read URL for private prefixes
 *   - `mode` — always `r2`, surfaced so the API can advertise it
 *
 * Keys look like `<prefix>/<uuid>.<ext>`. Prefixes are conventional:
 *   - `attachments/` — user uploads
 *   - `avatars/`     — human profile images mirrored from identity providers
 */
import { createHmac } from 'node:crypto'
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from './env.js'

/** Keys under these prefixes always get HMAC-signed URLs. Other prefixes
 *  (e.g. `avatars/`) are served unsigned — they
 *  carry no private user content and benefit from full CDN caching. */
const SIGNED_PREFIXES = ['attachments/', 'email-attachments/', 'knowledge-sources/', 'presentation-artifacts/']
function needsSignature(key: string): boolean {
  return SIGNED_PREFIXES.some((p) => key.startsWith(p))
}

const STORAGE_KEY_PREFIXES = [
  'attachments/', 'email-attachments/', 'avatars/', 'knowledge-sources/', 'presentation-artifacts/',
]
function isStorageKey(key: string): boolean {
  return STORAGE_KEY_PREFIXES.some((p) => key.startsWith(p))
}

function stripQueryAndHash(path: string): string {
  return path.split('?')[0].split('#')[0]
}

export function normalizeStorageKey(raw: string): string | null {
  try {
    const key = decodeURIComponent(stripQueryAndHash(raw.trim()).replace(/^\/+/, ''))
    return isStorageKey(key) ? key : null
  } catch {
    return null
  }
}

export function storageKeyFromPublicUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  if (!env.R2_PUBLIC_BASE) return null
  try {
    const url = new URL(value)
    const base = new URL(env.R2_PUBLIC_BASE)
    const basePath = base.pathname.replace(/\/+$/, '')
    if (url.origin !== base.origin) return null
    if (basePath && !url.pathname.startsWith(`${basePath}/`)) return null
    const rawKey = basePath
      ? url.pathname.slice(basePath.length + 1)
      : url.pathname.replace(/^\/+/, '')
    return normalizeStorageKey(rawKey)
  } catch {
    return null
  }
}

export function signedUrlExpiresSoon(raw: string, leewaySeconds = 300): boolean {
  try {
    const exp = Number(new URL(raw).searchParams.get('exp') ?? 0)
    return Number.isFinite(exp) && exp > 0 && exp <= Math.floor(Date.now() / 1000) + leewaySeconds
  } catch {
    return false
  }
}

/** One enumerated object. lastModifiedMs is the storage backend's notion
 *  of when the object was last written — GC uses it to spare keys that
 *  were uploaded recently (the row write may still be in flight). */
export interface StorageObject {
  key: string
  sizeBytes: number
  lastModifiedMs: number
}

export interface StorageObjectMetadata {
  sizeBytes: number
  contentType: string | null
  etag: string | null
  lastModifiedMs: number | null
}

export interface PresignPutOptions {
  ttlSeconds?: number
  contentLength?: number
}

export class StorageObjectTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`storage object exceeds the ${maxBytes} byte limit`)
    this.name = 'StorageObjectTooLargeError'
  }
}

/** Metadata and bounded reads used at untrusted object-ingestion boundaries. */
export interface BoundedStorageReader {
  statObject(key: string): Promise<StorageObjectMetadata>
  readObjectBounded(key: string, maxBytes: number): Promise<Buffer>
}

export interface Storage {
  mode: 'r2'
  /** Write bytes synchronously from the server side (avatar gen path).
   *  Returns the resolved public URL. */
  put(key: string, body: Buffer, mime: string): Promise<string>
  /** Return a short-lived PUT URL the browser uploads to directly, plus
   *  the public URL the file will be available at after the upload. */
  presignPut(
    key: string,
    mime: string,
    options?: number | PresignPutOptions,
  ): Promise<{ uploadUrl: string; publicUrl: string }>
  /** Resolve the configured public gateway URL for a key. */
  publicUrl(key: string): Promise<string>
  /** Read an object into memory. Knowledge-source files are capped at 25 MB
   *  at the API edge, so a bounded Buffer keeps parser APIs simple. */
  readObject(key: string): Promise<Buffer>
  /** Enumerate every object whose key starts with `prefix`. Used by the
   *  GC sweep to find orphans not referenced by any DB row. R2 is paginated;
   *  the caller receives the flattened list. */
  listObjectsByPrefix(prefix: string): Promise<StorageObject[]>
  /** Remove one object. Provider failures propagate to the owning job. */
  deleteObject(key: string): Promise<boolean>
}

function validateReadLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer')
  }
}

function bodyChunkBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }
  throw new Error('object body yielded an unsupported chunk')
}

function terminateBody(body: unknown, error: Error): void {
  if (!body || typeof body !== 'object') return
  const destroy = (body as { destroy?: (error?: Error) => void }).destroy
  if (typeof destroy === 'function') {
    destroy.call(body, error)
    return
  }
  const cancel = (body as { cancel?: (reason?: unknown) => Promise<void> | void }).cancel
  if (typeof cancel === 'function') void Promise.resolve(cancel.call(body, error)).catch(() => undefined)
}

/** Buffer a Node or Web SDK response body without ever retaining more than maxBytes. */
export async function readStorageBodyBounded(body: unknown, maxBytes: number): Promise<Buffer> {
  validateReadLimit(maxBytes)
  if (!body) throw new Error('object has no body')

  const chunks: Buffer[] = []
  let total = 0
  const append = (chunk: unknown) => {
    const bytes = bodyChunkBytes(chunk)
    if (bytes.byteLength > maxBytes - total) {
      const error = new StorageObjectTooLargeError(maxBytes)
      terminateBody(body, error)
      throw error
    }
    total += bytes.byteLength
    chunks.push(Buffer.from(bytes))
  }

  if (body instanceof Blob) {
    if (body.size > maxBytes) throw new StorageObjectTooLargeError(maxBytes)
    return readStorageBodyBounded(body.stream(), maxBytes)
  }

  const asyncIterable = body as Partial<AsyncIterable<unknown>>
  if (typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    for await (const chunk of asyncIterable as AsyncIterable<unknown>) append(chunk)
    return Buffer.concat(chunks, total)
  }

  const stream = body as { getReader?: () => ReadableStreamDefaultReader<unknown> }
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        append(value)
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    return Buffer.concat(chunks, total)
  }

  if (body instanceof Uint8Array || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    append(body)
    return Buffer.concat(chunks, total)
  }

  throw new Error('object body is not a supported stream')
}

class R2Storage implements Storage, BoundedStorageReader {
  mode = 'r2' as const
  private client: S3Client
  private bucket: string
  private publicBase: string
  private signingSecret: string
  private urlTtl: number

  constructor(opts: {
    endpoint: string; bucket: string;
    accessKeyId: string; secretAccessKey: string;
    publicBase: string;
    signingSecret: string;
    urlTtl: number;
  }) {
    this.bucket = opts.bucket
    this.publicBase = opts.publicBase
    this.signingSecret = opts.signingSecret
    this.urlTtl = opts.urlTtl
    this.client = new S3Client({
      // R2 lives in a single region; the SDK still requires *some* value.
      // "auto" is the documented choice for R2.
      region: 'auto',
      endpoint: opts.endpoint,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
      // R2 requires path-style addressing in some configs; force it on so
      // the same code works whether the user is on the default subdomain
      // setup or a custom hostname.
      forcePathStyle: true,
    })
  }

  async put(key: string, body: Buffer, mime: string): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: mime,
    }))
    return this.publicUrl(key)
  }

  async presignPut(
    key: string,
    mime: string,
    options: number | PresignPutOptions = {},
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    const { ttlSeconds = 300, contentLength } = typeof options === 'number'
      ? { ttlSeconds: options, contentLength: undefined }
      : options
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mime,
      ContentLength: contentLength,
    })
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds })
    const publicUrl = await this.publicUrl(key)
    return { uploadUrl, publicUrl }
  }

  async listObjectsByPrefix(prefix: string): Promise<StorageObject[]> {
    // R2 / S3 ListObjectsV2 is paginated; loop on ContinuationToken so a
    // large bucket doesn't silently truncate at 1000.
    const out: StorageObject[] = []
    let token: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }))
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue
        out.push({
          key: obj.Key,
          sizeBytes: obj.Size ?? 0,
          lastModifiedMs: obj.LastModified ? obj.LastModified.getTime() : 0,
        })
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
    return out
  }

  async deleteObject(key: string): Promise<boolean> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    return true
  }

  async publicUrl(key: string): Promise<string> {
    // Prefer the explicit public base (custom domain). Cache-friendly,
    // no expiry on the URL structure itself. When a signing secret is
    // required signing secret and the key falls under a signed prefix, append the
    // HMAC query params — the Cloudflare Worker at the edge validates
    // these before proxying R2 reads.
    if (needsSignature(key)) {
        const exp = Math.floor(Date.now() / 1000) + this.urlTtl
        const sig = createHmac('sha256', this.signingSecret)
          .update(`${key}:${exp}`).digest('hex')
        return `${this.publicBase}/${key}?exp=${exp}&sig=${sig}`
    }
    return `${this.publicBase}/${key}`
  }

  async readObject(key: string): Promise<Buffer> {
    const normalized = normalizeStorageKey(key)
    if (!normalized) throw new Error('invalid storage key')
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalized }))
    if (!response.Body) throw new Error('object has no body')
    return Buffer.from(await response.Body.transformToByteArray())
  }

  async statObject(key: string): Promise<StorageObjectMetadata> {
    const normalized = normalizeStorageKey(key)
    if (!normalized) throw new Error('invalid storage key')
    const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: normalized }))
    const sizeBytes = response.ContentLength
    if (sizeBytes === undefined || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new Error('object has no valid content length')
    }
    return {
      sizeBytes,
      contentType: response.ContentType ?? null,
      etag: response.ETag ?? null,
      lastModifiedMs: response.LastModified?.getTime() ?? null,
    }
  }

  async readObjectBounded(key: string, maxBytes: number): Promise<Buffer> {
    validateReadLimit(maxBytes)
    const normalized = normalizeStorageKey(key)
    if (!normalized) throw new Error('invalid storage key')
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalized }))
    if (!response.Body) throw new Error('object has no body')
    if (response.ContentLength !== undefined && response.ContentLength > maxBytes) {
      const error = new StorageObjectTooLargeError(maxBytes)
      terminateBody(response.Body, error)
      throw error
    }
    return readStorageBodyBounded(response.Body, maxBytes)
  }
}

function buildStorage(): Storage & BoundedStorageReader {
  const required = {
    R2_ENDPOINT: env.R2_ENDPOINT,
    R2_BUCKET: env.R2_BUCKET,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_BASE: env.R2_PUBLIC_BASE,
    R2_URL_SIGNING_SECRET: env.R2_URL_SIGNING_SECRET,
  }
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) throw new Error(`native R2 storage configuration missing: ${missing.join(', ')}`)
  return new R2Storage({
      endpoint: env.R2_ENDPOINT,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      publicBase: env.R2_PUBLIC_BASE,
      signingSecret: env.R2_URL_SIGNING_SECRET,
      urlTtl: env.R2_URL_TTL_SECONDS,
  })
}

let activeStorage: (Storage & Partial<BoundedStorageReader>) | null = null

/** Install the process-wide storage adapter at the composition boundary.
 * Tests pass an explicit in-memory provider; production calls
 * `initializeNativeStorage` and therefore still fails before readiness when
 * the canonical R2 contract is incomplete. */
export function installStorageProvider(provider: Storage & Partial<BoundedStorageReader>): void {
  if (activeStorage && activeStorage !== provider) {
    throw new Error('storage provider is already installed')
  }
  activeStorage = provider
}

export function initializeNativeStorage(): void {
  if (activeStorage) return
  installStorageProvider(buildStorage())
}

function requireStorage(): Storage & Partial<BoundedStorageReader> {
  if (!activeStorage) throw new Error('storage provider is not installed')
  return activeStorage
}

/** Stable delegating port captured by domain applications during module
 * composition. The provider itself must be installed explicitly before any
 * process exposes readiness or any test invokes a storage-backed use case. */
export const storage: Storage & BoundedStorageReader = {
  get mode() { return requireStorage().mode },
  put: (...args) => requireStorage().put(...args),
  presignPut: (...args) => requireStorage().presignPut(...args),
  publicUrl: (...args) => requireStorage().publicUrl(...args),
  readObject: (...args) => requireStorage().readObject(...args),
  statObject: (...args) => {
    const provider = requireStorage()
    if (!provider.statObject) throw new Error('storage provider does not support object metadata')
    return provider.statObject(...args)
  },
  readObjectBounded: (...args) => {
    const provider = requireStorage()
    if (!provider.readObjectBounded) throw new Error('storage provider does not support bounded reads')
    return provider.readObjectBounded(...args)
  },
  listObjectsByPrefix: (...args) => requireStorage().listObjectsByPrefix(...args),
  deleteObject: (...args) => requireStorage().deleteObject(...args),
}

/** Stored attachment shape — mirror of AttachmentPayload in the router.
 *  Defined here so the freshening helper has no circular import. */
export interface StoredAttachment {
  url: string
  name: string
  kind: 'img' | 'pdf' | 'file' | 'fig'
  mime?: string
  size?: number
  key?: string
  [extra: string]: unknown
}

/** Re-sign an attachment's `url` from its stored `key` so each response
 *  carries a fresh signature. Without this, persisted message URLs would
 *  expire and break historical bubbles after the TTL window. Returns the
 *  requires the persisted native storage key. */
export async function freshenAttachmentUrl<T extends StoredAttachment | null | undefined>(
  att: T,
): Promise<T> {
  if (!att) return att
  // Re-sign exclusively from the canonical persisted storage key.
  const key = att.key
  if (!key) throw new Error('attachment storage key is required')
  const url = await storage.publicUrl(key)
  if (url === att.url && att.key === key) return att
  return { ...att, url, key } as T
}
