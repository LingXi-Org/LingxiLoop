import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('source semantic query binds the project route, body and cancellation to the existing HTTP client', async () => {
  const controller = new AbortController()
  const result = { sourceId: 'source/id', status: 'matched', indexVersion: 'version', extractedText: 'Evidence', matches: [] }
  let captured: { path: string; init: RequestInit } | undefined
  mock.module('../../api/core/http.ts', { namedExports: { http: async (path: string, init: RequestInit) => {
    captured = { path, init }
    return result
  } } })
  try {
    const { knowledgeApi } = await import('./api')
    const input = { query: 'attention', indexVersion: 'version' }
    assert.equal(await knowledgeApi.searchProjectSource('course/id', 'source/id', input, controller.signal), result)
    assert.equal(captured!.path, '/projects/course%2Fid/sources/source%2Fid/search')
    assert.equal(captured!.init.method, 'POST')
    assert.equal(captured!.init.signal, controller.signal)
    assert.deepEqual(captured!.init.headers, { 'x-project-id': 'course/id' })
    assert.deepEqual(JSON.parse(String(captured!.init.body)), input)
  } finally { mock.restoreAll() }
})

