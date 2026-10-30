import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadMaterialOriginal } from './original-resource'
import type { KnowledgeSource } from '../knowledge/contracts'

const context = { userId: 'student', companyId: 'company', projectId: 'course', space: 'public' as const }
const detail = { id: 'ready-pdf', title: 'lesson.pdf', mimeType: 'application/pdf', originalFileUrl: '/api/files?key=synthetic', capabilities: { canDownload: true } } as KnowledgeSource
Object.assign(globalThis, { window: { location: { origin: 'https://app.test' } } })

test('original file reports denied, absent and service failures without exposing response bodies', async () => {
  for (const [status, expected] of [[403, /权限已失效/], [404, /不存在或已不可访问/], [503, /服务暂时不可用/]] as const) {
    let calls = 0
    await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
      detail: async () => detail, fetch: async () => { calls++; return new Response('private detail', { status }) }, isCurrent: () => true,
    }), expected)
    assert.equal(calls, status === 403 ? 2 : 1)
  }
})

test('authorization retry refreshes detail and returns the actual file bytes', async () => {
  let details = 0, calls = 0
  const result = await loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => { details++; return detail },
    fetch: async (_url, init) => { assert.equal(init.credentials, 'include'); return ++calls === 1 ? new Response('', { status: 401 }) : new Response('synthetic pdf') },
    isCurrent: () => true,
  })
  assert.equal(details, 2)
  assert.equal(await result.blob.text(), 'synthetic pdf')
})
