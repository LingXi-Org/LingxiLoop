import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import test from 'node:test'
import { adaptDesignMath } from './build-artifact-math.mjs'
import { adaptDesignRuntimeUrl, buildDesignEditor } from './build-design-editor.mjs'

test('Design package preserves the agreed math runtime and optional executable bytes, extracts the exact fallback font and losslessly precompresses fixed resources', async () => {
  const manifest = await buildDesignEditor()
  const source = resolve(manifest.source), output = resolve('server/assets/design-editor')
  const math = await readFile('server/assets/visualize-runtime/math.js', 'utf8')
  for (const [name, sizes] of Object.entries(manifest.compressed)) {
    const bytes = await readFile(resolve(output, name))
    assert.deepEqual(brotliDecompressSync(await readFile(resolve(output, `${name}.br`))), bytes)
    assert.deepEqual(gunzipSync(await readFile(resolve(output, `${name}.gz`))), bytes)
    assert.ok(sizes.br < bytes.length)
    if (name.endsWith('.js')) {
      const original = await readFile(resolve(source, name === manifest.entry.file ? manifest.entry.original : name === manifest.runtime.file ? manifest.runtime.original : name))
      const expected = name === manifest.entry.file ? Buffer.from(adaptDesignRuntimeUrl(adaptDesignMath(original.toString(), math)))
        : name === manifest.runtime.file ? Buffer.from(original.toString() + '\n;' + math) : original
      assert.deepEqual(bytes, expected, name)
    }
  }
  const originalHtml = await readFile(resolve(source, 'index.html'), 'utf8')
  const originalCss = await readFile(resolve(source, /href="\.\/(assets\/[^"/]+\.css)"/.exec(originalHtml)[1]), 'utf8')
  const font = /data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(originalCss)
  assert.deepEqual(await readFile(resolve(output, manifest.styles.fallbackFont)), Buffer.from(font[1], 'base64'))
  const css = await readFile(resolve(output, manifest.styles.file), 'utf8')
  assert.equal(css.replace(`./${manifest.styles.fallbackFont.split('/').at(-1)}`, font[0])
    .replace(`./${manifest.styles.icons.split('/').at(-1)}`, `./${manifest.styles.originalIcons}`), originalCss)
  assert.ok(manifest.styles.bytes < manifest.styles.originalBytes)
  const html = await readFile(resolve(output, 'index.html'), 'utf8')
  assert.ok(html.includes(`rel="preload" as="script" href="__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/${manifest.runtime.file.split('/').at(-1)}"`))
  assert.throws(() => adaptDesignRuntimeUrl('unknown pinned source'), /runtime URL hook/)
  assert.match(html, /data-placeholder[^>]*>Loading…/)
  assert.match(html, /dc-babel-file/)
  assert.match(html, /fast-edit-worker-file/)
  assert.match(html, /__LINGXI_DESIGN_ASSET_ORIGIN__\/artifact-editor\/design-assets\/design-[a-f0-9]{64}\.js" integrity="sha256-/)
})
