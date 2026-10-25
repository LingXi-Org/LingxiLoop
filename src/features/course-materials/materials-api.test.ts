import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('material upload binds presign and completion to initial organization/course and retry resumes completed PUT', async () => {
  const calls: Array<{ path: string; init: RequestInit }> = []
  let puts = 0
  let completeFailures = 1
  let principalValid = true
  mock.module('../../api/core/http.ts', { namedExports: { http: async (path: string, init: RequestInit) => {
    calls.push({ path, init })
    if (path.endsWith('presign')) return { id: 'original-source', uploadUrl: 'https://storage.invalid/signed' }
    if (completeFailures-- > 0) throw new Error('connection lost after completion')
    return { ok: true }
  } } })
  mock.module('../platform/api.ts', { namedExports: { uploadsApi: { uploadCapabilities: async () => ({ maxBytes: 1024, allowedMimes: ['application/zip'] }) } } })
  mock.module('../projects/api.ts', { namedExports: { projectLifecycleApi: {} } })
  mock.module('./upload-transport.ts', { namedExports: { putMaterialFile: async (_url: string, _file: File, _mime: string, progress: (n: number) => void) => {
    puts++; progress(50); progress(100); return { ok: true, status: 200 }
  } } })
  const { knowledgeApi } = await import('../knowledge/api')
  const file = new File(['PK'], 'notes.zip')
  const progress: number[] = []
  const binding = { companyId: 'original-org', userId: 'original-user', space: 'private' as const, isCurrentIdentity: () => principalValid }
  try {
    await assert.rejects(knowledgeApi.uploadProjectMaterial('original-course', file, binding, n => progress.push(n)), /connection lost/)
    await knowledgeApi.uploadProjectMaterial('original-course', file, binding, () => {})
    assert.equal(puts, 1, 'completion retry must not create/reupload a second source')
    assert.deepEqual(progress, [50, 100])
    assert.equal(calls.filter(call => call.path.endsWith('presign')).length, 1)
    for (const call of calls) {
      assert.ok(call.path.startsWith('/projects/original-course/sources/'))
      assert.deepEqual(call.init.headers, { 'x-company-id': 'original-org', 'x-project-id': 'original-course' })
    }
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.mime, 'application/zip', 'empty browser MIME is inferred from original extension')
    assert.equal(body.visibilityScope, undefined, 'scope remains server-owned')
    assert.equal(body.ownerUserId, undefined)
    principalValid = false
    const before = calls.length
    await assert.rejects(knowledgeApi.uploadProjectMaterial('original-course', file, binding, () => {}), /登录账号已改变/)
    assert.equal(calls.length, before)
  } finally { mock.restoreAll() }
})

test('a material upload never completes using a changed account after its object PUT', async () => {
  let principalValid = true
  let completed = false
  mock.module('../../api/core/http.ts', { namedExports: { http: async (path: string) => {
    if (path.endsWith('complete-upload')) completed = true
    return { id: 'source-account-switch', uploadUrl: 'https://storage.invalid/signed' }
  } } })
  mock.module('../platform/api.ts', { namedExports: { uploadsApi: { uploadCapabilities: async () => ({ maxBytes: 1024, allowedMimes: ['text/plain'] }) } } })
  mock.module('../projects/api.ts', { namedExports: { projectLifecycleApi: {} } })
  mock.module('./upload-transport.ts', { namedExports: { putMaterialFile: async () => {
    principalValid = false; return { ok: true, status: 200 }
  } } })
  // Module isolation is required because the first test exercises the shared request-key map.
  const isolatedPath = '../knowledge/api?account-switch'
  const api = await import(isolatedPath) as typeof import('../knowledge/api')
  try {
    await assert.rejects(api.knowledgeApi.uploadProjectMaterial('another-course', new File(['one'], 'one.txt', { type: 'text/plain' }),
      { companyId: 'org', userId: 'one', space: 'private', isCurrentIdentity: () => principalValid }, () => {}), /登录账号已改变/)
    assert.equal(completed, false)
  } finally { mock.restoreAll() }
})
