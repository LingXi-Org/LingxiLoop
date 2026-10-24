import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { caseArticleUrl, caseViewFromSearch, canManageCaseView } from './case-view'

test('case view defaults to reader independently of the app view query', () => {
  assert.equal(caseViewFromSearch('?view=cases'), 'reader')
  assert.equal(caseViewFromSearch('?view=manage&caseView=unknown'), 'reader')
  assert.equal(caseViewFromSearch('?view=cases&caseView=manage'), 'manage')
  assert.equal(canManageCaseView('reader', true), false)
  assert.equal(canManageCaseView('manage', false), false)
  assert.equal(canManageCaseView('manage', true), true)
})

test('case links preserve the selected view and organization across reloads', () => {
  const manage = caseArticleUrl('?view=chat&case=old&conversation=old&keep=yes', 'org', 'case /1', 'manage')
  const url = new URL(manage, 'https://app.invalid')
  assert.equal(url.pathname, '/cases/case%20%2F1')
  assert.equal(url.searchParams.get('view'), 'cases')
  assert.equal(url.searchParams.get('company'), 'org')
  assert.equal(url.searchParams.get('keep'), 'yes')
  assert.equal(url.searchParams.has('case'), false)
  assert.equal(url.searchParams.has('conversation'), false)
  assert.equal(caseViewFromSearch(url.search), 'manage')
  const reader = new URL(caseArticleUrl(url.search, 'org', undefined, 'reader'), url)
  assert.equal(reader.pathname, '/cases')
  assert.equal(reader.searchParams.has('caseView'), false)
  assert.equal(caseViewFromSearch(reader.search), 'reader')
})

test('list and detail requests explicitly select reader or manage and retain cancellation', async () => {
  const calls: { path: string; signal?: AbortSignal }[] = []
  mock.module('../../api/core/http.ts', { namedExports: {
    http: async (path: string, init: RequestInit) => { calls.push({ path, signal: init.signal ?? undefined }); return {} },
  } })
  try {
    const { casesApi } = await import('./api')
    const abort = new AbortController()
    await casesApi.list('query', 'category')
    await casesApi.detail('case /1')
    await casesApi.list('query', 'category', 'manage', abort.signal)
    await casesApi.detail('case /1', 'manage', abort.signal)
    assert.deepEqual(calls.map(call => new URL(call.path, 'https://api.invalid').searchParams.get('view')), ['reader', 'reader', 'manage', 'manage'])
    assert.deepEqual(calls.slice(2).map(call => call.signal), [abort.signal, abort.signal])
    assert.equal(new URL(calls[2].path, 'https://api.invalid').searchParams.get('q'), 'query')
    assert.equal(new URL(calls[2].path, 'https://api.invalid').searchParams.get('category'), 'category')
    assert.equal(new URL(calls[3].path, 'https://api.invalid').pathname, '/cases/case%20%2F1')
  } finally { mock.restoreAll() }
})
