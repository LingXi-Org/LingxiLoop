import assert from 'node:assert/strict'
import test from 'node:test'
import {
  installStorageProvider,
  normalizeStorageKey,
  readStorageBodyBounded,
  storage,
  type Storage,
  StorageObjectTooLargeError,
} from '../storage.js'
import { PlatformApplication, type PlatformInfrastructure } from '../modules/platform/application.js'
import { MAX_UPLOAD_BYTES, presignUploadRequestSchema } from '../modules/platform/contracts.js'

test('upload boundaries reject unsafe or cross-workspace storage paths', async () => {
  for (const key of [
    'attachments/company/../other/file.pdf',
    'attachments/company/%2e%2e/other/file.pdf',
    'attachments/company\\file.pdf',
    'attachments//company/file.pdf',
    'attachments/company/file.pdf\u0000.jpg',
  ]) assert.equal(normalizeStorageKey(key), null)
  assert.equal(normalizeStorageKey('attachments/company/file.pdf'), 'attachments/company/file.pdf')

  let presignOptions: unknown
  const application = new PlatformApplication({
    storage: {
      mode: 'r2',
      async presignPut(key: string, _mime: string, options?: number | { ttlSeconds?: number; contentLength?: number }) {
        presignOptions = options
        return { uploadUrl: `https://upload.invalid/${key}`, publicUrl: `https://cdn.invalid/${key}` }
      },
      async publicUrl(key: string) { return `https://cdn.invalid/${key}` },
    },
  } as unknown as PlatformInfrastructure)
  await application.presignUpload('company', { name: 'notes.pdf', mime: 'application/pdf', size: MAX_UPLOAD_BYTES })
  assert.deepEqual(presignOptions, { contentLength: MAX_UPLOAD_BYTES })
  assert.equal(presignUploadRequestSchema.safeParse({ name: '../notes.pdf', mime: 'application/pdf', size: 1 }).success, false)
  assert.deepEqual(
    await application.refreshUploadUrl('company', 'attachments/company/file.pdf'),
    { key: 'attachments/company/file.pdf', url: 'https://cdn.invalid/attachments/company/file.pdf' },
  )
  await assert.rejects(application.refreshUploadUrl('company', 'attachments/other/file.pdf'), /workspace attachment key required/)
})

test('bounded storage reads stop as soon as a streamed body crosses the cap', async () => {
  let destroyed = false
  let yielded = 0
  const body = {
    destroy() { destroyed = true },
    async *[Symbol.asyncIterator]() {
      yielded += 1
      yield Buffer.from('1234')
      yielded += 1
      yield Buffer.from('56')
      yielded += 1
      yield Buffer.alloc(1024)
    },
  }

  await assert.rejects(
    readStorageBodyBounded(body, 5),
    (error) => error instanceof StorageObjectTooLargeError && error.maxBytes === 5,
  )
  assert.deepEqual({ destroyed, yielded }, { destroyed: true, yielded: 2 })
})

test('storage use requires an explicitly installed provider', async () => {
  assert.throws(
    () => storage.publicUrl('attachments/missing.txt'),
    /provider is not installed/,
  )

  const provider: Storage = {
    mode: 'r2',
    async put(key) { return `https://storage.test.invalid/${key}` },
    async presignPut(key) {
      return {
        uploadUrl: `https://storage.test.invalid/upload/${key}`,
        publicUrl: `https://storage.test.invalid/${key}`,
      }
    },
    async publicUrl(key) { return `https://storage.test.invalid/${key}` },
    async readObject() { return Buffer.from('fixture') },
    async listObjectsByPrefix() { return [] },
    async deleteObject() { return true },
  }
  installStorageProvider(provider)

  assert.equal(
    await storage.publicUrl('attachments/fixture.txt'),
    'https://storage.test.invalid/attachments/fixture.txt',
  )
})

test('readiness requires both PostgreSQL and Redis', async () => {
  const checks: string[] = []
  const infrastructure = {
    db: { query: async () => { checks.push('postgres'); return { rows: [{ '?column?': 1 }] } } },
    redisPing: async () => { checks.push('redis') },
  } as unknown as PlatformInfrastructure
  const application = new PlatformApplication(infrastructure)

  await application.assertReady()
  assert.deepEqual(checks.sort(), ['postgres', 'redis'])

  infrastructure.redisPing = async () => { throw new Error('redis unavailable') }
  await assert.rejects(application.assertReady(), /redis unavailable/)
})
