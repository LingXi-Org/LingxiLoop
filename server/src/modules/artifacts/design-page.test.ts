import assert from 'node:assert/strict'
import test from 'node:test'
import { designPageAssets } from './design-page.js'

test('shared Design resources use only the configured public origin and fixed asset namespace', () => {
  const html = `<script crossorigin src="__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/design-${'a'.repeat(64)}.js"></script><meta name="dc-runtime-file" content="artifact-type/dc-runtime.js">`
  const page = designPageAssets(html, 'https://loop.example.com/invites')
  assert.equal(page.source, 'https://loop.example.com/artifact-editor/design-assets/')
  assert.match(page.html, /src="https:\/\/loop\.example\.com\/artifact-editor\/design-assets\//)
  assert.match(page.html, /content="artifact-type\/dc-runtime\.js"/)
  assert.doesNotMatch(page.html, /invites|__LINGXI/)
  assert.throws(() => designPageAssets(html, 'file:///tmp/'), /public HTTP origin/)
})
