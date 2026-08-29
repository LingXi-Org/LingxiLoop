import assert from 'node:assert/strict'
import test from 'node:test'
import type { Storage } from '../storage.js'
import { mirrorIdentityAvatar } from '../modules/identity/avatar-infrastructure.js'

function storageFixture() {
  const writes: Array<{ key: string; mime: string; body: Buffer }> = []
  const storage: Storage = {
    mode: 'r2',
    async put(key, body, mime) {
      writes.push({ key, mime, body: Buffer.from(body) })
      return `https://storage.invalid/${key}`
    },
    async presignPut() { throw new Error('not used') },
    async publicUrl(key) { return `https://storage.invalid/${key}` },
    async readObject() { throw new Error('not used') },
    async listObjectsByPrefix() { return [] },
    async deleteObject() { return false },
  }
  return { storage, writes }
}

test('identity avatar mirroring writes validated provider bytes through canonical storage', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-type': 'image/png' },
  })
  t.after(() => { globalThis.fetch = originalFetch })
  const fixture = storageFixture()

  const url = await mirrorIdentityAvatar(fixture.storage, 'user-a', 'https://identity.invalid/avatar')

  assert.equal(url, 'https://storage.invalid/avatars/user-a.png')
  assert.deepEqual(fixture.writes, [{ key: 'avatars/user-a.png', mime: 'image/png', body: Buffer.from([1, 2, 3]) }])
})

test('identity avatar mirroring rejects unsupported media instead of preserving a remote fallback', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('not an image', {
    headers: { 'content-type': 'text/plain' },
  })
  t.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(
    mirrorIdentityAvatar(storageFixture().storage, 'user-a', 'https://identity.invalid/avatar'),
    /unsupported avatar content type/,
  )
})
