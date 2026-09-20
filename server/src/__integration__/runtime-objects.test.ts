import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createRuntimeObjectStore } from '../agent-runtime/object-store.js'

test('private S3 objects cross nodes, enforce committed size, report missing bytes and transport failures',
  { skip: !process.env.LINGXIOS_TEST_OBJECT_BUCKET && 'set LINGXIOS_TEST_OBJECT_BUCKET and local S3 fixture credentials' }, async () => {
    assert.equal(new URL(process.env.R2_ENDPOINT!).hostname, '127.0.0.1', 'requires disposable local S3')
    const bucket = process.env.LINGXIOS_TEST_OBJECT_BUCKET!
    const a = createRuntimeObjectStore(bucket), b = createRuntimeObjectStore(bucket)
    const key = `workspaces/${'0'.repeat(64)}/${'b'.repeat(64)}-1/${randomUUID()}/${'c'.repeat(64)}`
    const signal = AbortSignal.timeout(15000), bytes = Buffer.from('shared private bytes')
    try {
      await a.put(key, bytes, signal)
      assert.deepEqual(Buffer.from((await b.get(key, bytes.length, signal))!), bytes)
      await assert.rejects(b.get(key, bytes.length - 1, signal), /commitment/)
      assert.ok((await b.list('workspaces/', undefined, 100, signal)).objects.some(item => item.key === key))
      const aborted = AbortSignal.abort(new Error('injected transport interruption'))
      await assert.rejects(a.put(key, Buffer.from('uncommitted replacement'), aborted))
      assert.deepEqual(Buffer.from((await b.get(key, bytes.length, signal))!), bytes)
      await a.delete(key, signal)
      assert.equal(await b.get(key, bytes.length, signal), null)
      await assert.rejects(a.put('../public/invalid', bytes, signal), /invalid runtime object key/)
    } finally { await a.delete(key, signal); a.close(); b.close() }
  })
