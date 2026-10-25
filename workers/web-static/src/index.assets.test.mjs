import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
// Own this integration check in release-controller CI, using its exact locked Wrangler graph.
const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.resolve('wrangler'))('miniflare')
test('real Static Assets HTML canonicalization serves SPA deep links without redirects and keeps root navigation working', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingxi-static-html-'))
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  let runtime
  try {
    await writeFile(join(directory, 'index.html'), '<!doctype html><html>actual SPA fixture</html>')
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'assets', 'index-12345678.js'), 'export const baseline = true;')
    runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
      name: 'static-html-regression', modules: true, scriptPath: fileURLToPath(new URL(`../${config.main}`, import.meta.url)),
      compatibilityDate: config.compatibility_date, bindings: config.vars, r2Buckets: ['RETAINED_ASSETS'],
      assets: { directory, binding: config.assets.binding,
        routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: config.assets.run_worker_first },
        assetConfig: { ...(config.assets.html_handling ? { html_handling: config.assets.html_handling } : {}), not_found_handling: config.assets.not_found_handling } },
    }] }))
    // This is the real binding behavior that the old mock did not model.
    const assets = (await runtime.getBindings('static-html-regression')).ASSETS
    const canonical = await assets.fetch('https://loop.example.com/index.html', { redirect: 'manual' })
    assert.equal(canonical.status, 307)
    assert.equal(canonical.headers.get('location'), '/')
    for (const path of ['/', '/cases', '/cases/', '/chat/1']) {
      const response = await runtime.dispatchFetch(`https://loop.example.com${path}`, { headers: { accept: 'text/html' }, redirect: 'manual' })
      assert.equal(response.status, 200, path)
      assert.equal(response.headers.get('location'), null, path)
      assert.equal(await response.text(), '<!doctype html><html>actual SPA fixture</html>')
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    assert.equal((await runtime.dispatchFetch('https://loop.example.com/', { redirect: 'manual' })).status, 200)
    const head = await runtime.dispatchFetch('https://loop.example.com/cases', { method: 'HEAD', headers: { accept: 'text/html' }, redirect: 'manual' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('location'), null)
    assert.equal(await head.text(), '')
    assert.equal((await runtime.dispatchFetch('https://loop.example.com/cases', { redirect: 'manual' })).status, 404)
    assert.equal((await runtime.dispatchFetch('https://loop.example.com/assets/missing.js', { headers: { accept: 'text/html' }, redirect: 'manual' })).status, 404)
    const script = await runtime.dispatchFetch('https://loop.example.com/assets/index-12345678.js', { redirect: 'manual' })
    assert.equal(script.status, 200)
    assert.equal(await script.text(), 'export const baseline = true;')
  } finally {
    await runtime?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
