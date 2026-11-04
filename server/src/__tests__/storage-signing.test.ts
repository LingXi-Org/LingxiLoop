import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { initializeNativeStorage, storage } from '../storage.js'

test('browser upload signatures bind the actual SHA256 and never the empty CRC32 body', async () => {
  initializeNativeStorage()
  const bytes = Buffer.from('print("student evidence")\n')
  const checksumSHA256 = createHash('sha256').update(bytes).digest('base64')
  const signed = await storage.presignPut('attachments/company/evidence.py', 'text/plain', { contentLength: bytes.length, checksumSHA256 })
  const url = new URL(signed.uploadUrl)
  assert.equal(url.searchParams.get('x-amz-checksum-sha256'), checksumSHA256)
  assert.equal(url.searchParams.get('x-amz-checksum-crc32'), null)
  assert.ok(url.searchParams.get('X-Amz-SignedHeaders')?.includes('content-length'))
  assert.ok(url.searchParams.get('X-Amz-SignedHeaders')?.includes('content-type'))
  const legacy = new URL((await storage.presignPut('attachments/company/image.png', 'image/png', { contentLength: 9 })).uploadUrl)
  assert.equal(legacy.searchParams.get('x-amz-checksum-crc32'), null)
})
