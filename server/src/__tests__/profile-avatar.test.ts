import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { avatarInputSchema } from '../modules/identity/contracts.js'
import { prepareAvatar } from '../modules/identity/profile-avatar.js'
import type { Storage, BoundedStorageReader } from '../storage.js'

test('avatars preserve their seeded style and accept only owned, bounded raster uploads', async () => {
  for (const value of [{}, { seed: '' }, { seed: 'x'.repeat(129) }, { seed: 'x', key: 'anything' }, { url: 'https://example.com/a.png' }, { seed: 'x', userId: 'other' }]) {
    assert.equal(avatarInputSchema.safeParse(value).success, false)
  }
  const scope = { companyId: 'company', userId: 'owner' }
  let owned = true
  const db = { query: async () => ({ rows: owned ? [{}] : [] }) } as unknown as Queryable
  const generated = await prepareAvatar(db, scope, { seed: 'one' }, 'user')
  assert.equal(generated.avatarSeed, 'one')
  assert.match(decodeURIComponent(generated.avatarUrl), /<dc:title>Marbles<\/dc:title>/)
  assert.deepEqual(await prepareAvatar(db, scope, { seed: 'one' }, 'user'), generated)
  assert.notEqual((await prepareAvatar(db, scope, { seed: 'two' }, 'user')).avatarUrl, generated.avatarUrl)
  const course = await prepareAvatar(db, scope, { seed: 'one' }, 'course')
  assert.match(decodeURIComponent(course.avatarUrl), /<dc:title>Planets<\/dc:title>/)

  let body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
  let mime = 'image/png'
  let size = body.length
  let readLimit = 0
  let saved: { key: string; body: Buffer; mime: string } | undefined
  const objects = {
    statObject: async () => ({ contentType: mime, sizeBytes: size }),
    readObjectBounded: async (_key: string, limit: number) => { readLimit = limit; return body },
    put: async (key: string, bytes: Buffer, type: string) => { saved = { key, body: bytes, mime: type }; return `https://assets.test/${key}` },
  } as unknown as Storage & BoundedStorageReader
  const input = { key: 'attachments/company/avatar.png' }
  const save = () => prepareAvatar(db, scope, input, 'user', objects)
  const uploaded = await save()
  assert.equal(uploaded.avatarSeed, null)
  assert.match(saved!.key, /^avatars\/company\/[a-f0-9-]+\.png$/)
  assert.deepEqual(saved!.body, body)
  assert.equal(saved!.mime, 'image/png')
  assert.equal(readLimit, 5 * 1024 * 1024)
  owned = false
  await assert.rejects(save, { status: 403 })
  owned = true
  await assert.rejects(() => prepareAvatar(db, scope, { key: 'attachments/other/avatar.png' }, 'user', objects), { status: 403 })
  mime = 'image/svg+xml'
  await assert.rejects(save, { status: 415 })
  mime = 'image/png'; size = 5 * 1024 * 1024 + 1
  await assert.rejects(save, { status: 413 })
  size = 0
  await assert.rejects(save, { status: 413 })
  body = Buffer.from('fake png'); size = body.length
  await assert.rejects(save, { status: 415 })
})
