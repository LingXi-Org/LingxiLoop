import assert from 'node:assert/strict'
import test from 'node:test'
import {
  installStorageProvider,
  readStorageBodyBounded,
  storage,
  type Storage,
  StorageObjectTooLargeError,
} from '../storage.js'

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
