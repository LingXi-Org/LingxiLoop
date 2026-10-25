import assert from 'node:assert/strict'
import test from 'node:test'
import { loadMaterialOriginal } from './original-resource'
import type { KnowledgeSource } from '../knowledge/contracts'

const context = { companyId: 'school', userId: 'student', projectId: 'course', space: 'private' as const }
const detail = { title: 'notes.md', mimeType: 'text/markdown', originalFileUrl: '/api/files?key=private', capabilities: { canDownload: true } } as KnowledgeSource
Object.defineProperty(globalThis, 'window', { value: { location: { origin: 'https://school.example' } }, configurable: true })
test('original preview uses authenticated original bytes, including stored-only files', async () => {
  const got = await loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => ({ ...detail, status: 'stored', extractedText: 'different parsed text' }), isCurrent: () => true,
    fetch: async (url, init) => {
      assert.equal(url, 'https://school.example/api/files?key=private')
      assert.equal(init.credentials, 'include')
      assert.deepEqual(init.headers, { 'x-company-id': 'school', 'x-project-id': 'course' })
      return new Response('# Original bytes')
    },
  })
  assert.equal(await got.blob.text(), '# Original bytes')
})
test('expired URL reauthorizes once and never sends tenant/cookies to storage origin', async () => {
  let authorized = 0
  const got = await loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => ({ ...detail, originalFileUrl: `https://storage.example/${++authorized}` }), isCurrent: () => true,
    fetch: async (url, init) => {
      assert.equal(init.credentials, 'omit'); assert.equal(init.headers, undefined)
      return url.endsWith('/1') ? new Response('', { status: 403 }) : new Response('original')
    },
  })
  assert.equal(authorized, 2); assert.equal(await got.blob.text(), 'original')
})
test('denied detail and changed account cannot expose an original Blob', async () => {
  await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => ({ ...detail, capabilities: undefined }), isCurrent: () => true,
    fetch: async () => { throw new Error('must not fetch') },
  }), /原文件/)
  let current = true
  await assert.rejects(loadMaterialOriginal(context, new AbortController().signal, {
    detail: async () => detail, isCurrent: () => current,
    fetch: async () => { current = false; return new Response('other account') },
  }), { name: 'AbortError' })
})
test('closing aborts in-flight original acquisition', async () => {
  const controller = new AbortController()
  await assert.rejects(loadMaterialOriginal(context, controller.signal, {
    detail: async () => { controller.abort(); return detail }, isCurrent: () => true,
    fetch: async () => { throw new Error('must not fetch') },
  }), { name: 'AbortError' })
})
