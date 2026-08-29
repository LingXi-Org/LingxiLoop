import assert from 'node:assert/strict'
import test from 'node:test'
import {
  installStorageProvider,
  storage,
  type Storage,
} from '../storage.js'

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
