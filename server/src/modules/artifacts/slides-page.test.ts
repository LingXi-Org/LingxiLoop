import assert from 'node:assert/strict'
import test from 'node:test'
import { slidesPageAssets } from './slides-page.js'

test('a grant-origin Slides page loads its hashed assets from the one shared public URL', () => {
  const html = '<script type="module" crossorigin src="/artifact-editor/slides-assets/editor-ABCDEFGH.js"></script>'
    + '<link rel="stylesheet" crossorigin href="/artifact-editor/slides-assets/editor-0123456789abcdef.css">'
    + '<link rel="modulepreload" crossorigin href="/artifact-editor/slides-assets/chunk-ABCDEFGH.js">'
  const page = slidesPageAssets(html, 'https://loop.example.com/invites')
  assert.equal(page.source, 'https://loop.example.com/artifact-editor/slides-assets/')
  assert.equal(page.html.match(/"https:\/\/loop\.example\.com\/artifact-editor\/slides-assets\//g)?.length, 3)
  assert.doesNotMatch(page.html, /"\/artifact-editor|invites/)
  assert.throws(() => slidesPageAssets(html, 'file:///tmp/'), /public HTTP origin/)
})
