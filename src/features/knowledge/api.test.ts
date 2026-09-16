import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('deleting an interrupted upload resets only its request key across both source views', async () => {
  const keys: string[] = []
  let rejectDelete = false
  mock.module('../../api/core/http.ts', { namedExports: {
    http: async (path: string, init: RequestInit) => {
      if (init.method === 'DELETE') {
        if (rejectDelete) throw new Error('delete failed')
        return { ok: true }
      }
      assert.ok(path.endsWith('/upload/presign'))
      const { idempotencyKey } = JSON.parse(String(init.body))
      keys.push(idempotencyKey)
      return { id: idempotencyKey, uploadUrl: 'https://storage.invalid/upload' }
    },
  } })
  mock.module('../../api/transport.ts', { namedExports: {
    putPresignedFile: async () => { throw new Error('upload interrupted') },
  } })
  mock.module('../platform/api.ts', { namedExports: {
    uploadsApi: { uploadCapabilities: async () => ({ maxBytes: 1024, allowedMimes: ['text/plain'] }) },
  } })
  mock.module('../projects/api.ts', { namedExports: { projectLifecycleApi: {} } })
  try {
    const { knowledgeApi } = await import('./api')
    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    for (const [upload, remove] of [
      [knowledgeApi.uploadProjectSource, knowledgeApi.deleteSource],
      [knowledgeApi.uploadKnowledgeFile, knowledgeApi.deleteProjectSource],
    ] as const) {
      const scope = crypto.randomUUID()
      await assert.rejects(upload(scope, file), /upload interrupted/)
      const original = keys.at(-1)!
      rejectDelete = true
      await assert.rejects(remove(scope, original), /delete failed/)
      rejectDelete = false
      await remove(scope, 'unrelated-source')
      await assert.rejects(upload(scope, file), /upload interrupted/)
      assert.equal(keys.at(-1), original)
      await remove(scope, original)
      await assert.rejects(upload(scope, file), /upload interrupted/)
      assert.notEqual(keys.at(-1), original)
    }
  } finally {
    mock.restoreAll()
  }
})
