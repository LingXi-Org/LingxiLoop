import assert from 'node:assert/strict'
import test from 'node:test'
import { designPageAssets } from './design-page.js'
import { runInNewContext } from 'node:vm'

test('optional injected scripts cannot fail the editor; only marked blocking assets report failure', () => {
  const page = designPageAssets('<head></head>', 'https://loop.example.com')
  const source = /<script>([\s\S]*?)<\/script>/.exec(page.html)![1]
  let receive: (event: { target: unknown }) => void = () => {}
  let failures = 0
  class Script { constructor(readonly src: string, readonly critical = false) {} hasAttribute() { return this.critical } }
  class Link { rel = 'stylesheet'; constructor(readonly critical = false) {} hasAttribute() { return this.critical } }
  runInNewContext(source, { window: { addEventListener: (_: string, listener: typeof receive) => { receive = listener } },
    parent: { postMessage: () => failures++ }, HTMLScriptElement: Script, HTMLLinkElement: Link })
  receive({ target: new Script('https://static.cloudflareinsights.com/beacon.min.js') })
  receive({ target: new Link() })
  assert.equal(failures, 0, 'optional scripts/styles do not own core editor readiness')
  receive({ target: new Script('https://loop.example.com/artifact-editor/design-assets/entry.js', true) })
  receive({ target: new Link(true) })
  assert.equal(failures, 2)
})

test('shared Design resources use only the configured public origin and fixed asset namespace', () => {
  const html = `<script crossorigin src="__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/design-${'a'.repeat(64)}.js"></script><meta name="dc-runtime-file" content="artifact-type/dc-runtime.js">`
  const page = designPageAssets(html, 'https://loop.example.com/invites')
  assert.equal(page.source, 'https://loop.example.com/artifact-editor/design-assets/')
  assert.match(page.html, /src="https:\/\/loop\.example\.com\/artifact-editor\/design-assets\//)
  assert.match(page.html, /content="artifact-type\/dc-runtime\.js"/)
  assert.doesNotMatch(page.html, /invites|__LINGXI/)
  assert.throws(() => designPageAssets(html, 'file:///tmp/'), /public HTTP origin/)
})
