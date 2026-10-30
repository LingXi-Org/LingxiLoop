import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createViewerResource } from './viewer-resource'
import { scopePreviewSource } from './preview-session'
import { createTextResourceCache } from '../ui/file-viewer-text-resource'

test('reopening a URL does not reuse a previously authorized cached response', async () => {
  const oldFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => ++calls === 1 ? new Response('private synthetic text') : new Response('', { status: 403 })
  try {
    const source = { kind: 'url' as const, url: 'https://app.test/api/files?key=synthetic', fileName: 'note.txt' }
    const cache = createTextResourceCache()
    const load = () => cache.load({ content: createViewerResource(scopePreviewSource(source)).content, fileName: source.fileName, signal: new AbortController().signal })
    assert.equal(await load(), 'private synthetic text')
    await assert.rejects(load())
    assert.equal(calls, 2)
  } finally { globalThis.fetch = oldFetch }
})
