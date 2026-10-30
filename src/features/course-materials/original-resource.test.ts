import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatOriginalResourceDiagnostic, loadMaterialOriginal, originalResourceErrorMessage } from './original-resource'
import type { KnowledgeSource } from '../knowledge/contracts'

const context = { userId: 'student', companyId: 'company', projectId: 'course', space: 'public' as const }
const detail = { id: 'ready-pdf', title: 'lesson.pdf', mimeType: 'application/pdf', originalFileUrl: '/api/files?key=synthetic', capabilities: { canDownload: true } } as KnowledgeSource
Object.assign(globalThis, { window: { location: { origin: 'https://app.test' } } })

test('diagnostic log is a single string containing only safe stage and status', () => {
  const event = { stage: 'file_response' as const, status: 404, url: 'https://private.test/?token=secret', body: 'private text' }
  assert.equal(formatOriginalResourceDiagnostic(event), '[course-materials] original preview failed {"stage":"file_response","status":404}')
  assert.equal(formatOriginalResourceDiagnostic({ stage: 'file_request' }), '[course-materials] original preview failed {"stage":"file_request"}')
})

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

test('detail service errors cannot expose their response text', async () => {
  await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => { throw new Error('原文件 internal diagnostic') }, fetch: async () => assert.fail('unexpected fetch'), isCurrent: () => true,
  }), reason => {
    assert.equal(originalResourceErrorMessage(reason), '原文件暂时无法加载，请重试或联系资料管理者。')
    return true
  })
})

test('failed preview reports only a bounded stage and HTTP status, never URLs or error text', async () => {
  const events: unknown[] = []
  const secret = 'synthetic-private-url-or-response'
  await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => { throw Object.assign(new Error(secret), { status: 304 }) },
    fetch: async () => assert.fail('unexpected fetch'), isCurrent: () => true, diagnostic: event => events.push(event),
  }))
  assert.deepEqual(events, [{ stage: 'detail', status: 304 }])
  const requestEvents: unknown[] = []
  await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => detail, fetch: async () => { throw new Error(secret) }, isCurrent: () => true, diagnostic: event => requestEvents.push(event),
  }))
  assert.deepEqual(requestEvents, [{ stage: 'file_request' }])
  assert.doesNotMatch(JSON.stringify(requestEvents), /synthetic-private/)
})

test('HTTP failure records status without its body, while cancellation emits no diagnostic', async () => {
  const events: unknown[] = []
  await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => detail, fetch: async () => new Response('private object key', { status: 404 }),
    isCurrent: () => true, diagnostic: event => events.push(event),
  }))
  assert.deepEqual(events, [{ stage: 'file_response', status: 404 }])
  const aborted = new AbortController(); aborted.abort()
  const canceled: unknown[] = []
  await assert.rejects(loadMaterialOriginal(context, aborted.signal, {
    detail: async () => detail, fetch: async () => assert.fail('unexpected fetch'),
    isCurrent: () => true, diagnostic: event => canceled.push(event),
  }))
  assert.deepEqual(canceled, [])
})
