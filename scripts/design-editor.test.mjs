import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import test from 'node:test'
import { adaptDesignMath, buildDesignMathAssets } from './build-artifact-math.mjs'
import { adaptDesignHostCapabilities, adaptDesignRuntimeUrl, adaptVisibleDesignMount, adaptOnlineDesignMath, splitCriticalDesignSources, splitOptionalDesignSources, optimizeDesignBrowserRuntime, buildDesignEditor } from './build-design-editor.mjs'
import { runInNewContext, Script } from 'node:vm'
import { adaptDesignLayout, buildDesignLayout } from './build-design-layout.mjs'
import './design-flow-size.test.mjs'
import './design-startup.test.mjs'
import './design-browser-runtime.test.mjs'
import { translateDesign } from './design-copy.mjs'

test('Design omits direct agent requests and local design-system controls without disabling comments or themes', async () => {
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js', 'utf8')
  const adapted = adaptDesignHostCapabilities(original)
  assert.ok(!adapted.includes('sendRequest:x=>g.sendRequest(x)'))
  assert.ok(adapted.includes('openThread:(x,w)=>g.openThreadAt(x,w)'))
  assert.ok(adapted.includes('useThemeTab'))
  const control = /function r\(\)\{return null\}/.exec(adapted)?.[0]
  assert.ok(control)
  assert.equal(runInNewContext(`(${control})({system:{key:'builtin',title:'Builtin'}})`), null)
  assert.ok(!adapted.includes('dc-theme-system-link'))
})

test('Design reuses its prepared embedded runtime before the external and inline fallbacks', async () => {
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js', 'utf8')
  const adapted = adaptDesignRuntimeUrl(original)
  const section = adapted.slice(adapted.indexOf('function Fz('), adapted.indexOf('function Fz(') + 4000)
  const selector = /function w\(M\)\{[^}]+\}/.exec(section)[0]
  const select = (blobBlocked, fileBlocked, urls = { blob: 'blob:prepared-runtime', file: 'https://assets.test/runtime.js' }) =>
    new Function('m', 'f', `return (${selector})`)(blobBlocked, fileBlocked)({ urls })
  assert.equal(select(false, false), 'blob:prepared-runtime', 'normal startup needs no redundant external request')
  assert.equal(select(true, false), 'https://assets.test/runtime.js', 'a failed blob retains the external recovery path')
  assert.equal(select(false, true), 'blob:prepared-runtime')
  assert.equal(select(true, true), undefined, 'both failures retain the original inline program')
  assert.equal(select(false, false, { file: 'https://assets.test/runtime.js' }), 'https://assets.test/runtime.js', 'browsers without blob support retain the external route')
  assert.equal(select(false, false, {}), undefined)
})

test('only an acknowledged visible host skips the pinned presentation waits', async () => {
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js', 'utf8')
  const adapted = adaptVisibleDesignMount(original)
  const section = adapted.slice(adapted.indexOf('function GU('), adapted.indexOf('function WU('))
  const settle = /function K\(\$\)\{[^}]+\}/.exec(section)[0]
  const reveal = /function U\(\$\)\{[^}]+\}/.exec(section)[0]
  const [settleDelay, deadline] = new Function('n', 'u', 'b', 'w', `return [${settle},${reveal}]`)(300, 300, 900, (value, init) => Math.max(value, init ?? value))
  assert.equal(settleDelay({ flipAt: 100, now: 100 }), 0)
  assert.equal(deadline({ framed: true, mountedAt: 200, revealedAt: 100 }), 200)
  assert.equal(deadline({ framed: true, mountedAt: 200, revealedAt: 300 }), 300)
  assert.equal(settleDelay({ loadEnd: 100, now: 200 }), 200, 'standalone load settle remains')
  assert.equal(deadline({ framed: true, mountedAt: 200 }), undefined, 'no acknowledgement does not claim visible')
  assert.equal(deadline({ framed: false, mountedAt: 200 }), 1100, 'standalone path remains')
})

test('Design package preserves the agreed math runtime and optional executable bytes, extracts the exact fallback font and losslessly precompresses fixed resources', async () => {
  const manifest = await buildDesignEditor()
  const source = resolve(manifest.source), output = resolve('server/assets/design-editor')
  const entry = await readFile(resolve(output, manifest.entry.file), 'utf8')
  assert.doesNotMatch(entry, /sendRequest:x=>g\.sendRequest\(x\)/, 'unported direct agent requests must not be advertised')
  const math = await readFile('server/assets/artifact-math/math.js', 'utf8')
  const catalog = { ...JSON.parse(await readFile('third_party/baoyu-design/host/slides-zh-CN.json', 'utf8')), ...JSON.parse(await readFile('third_party/baoyu-design/host/design-zh-CN.json', 'utf8')) }
  const layout = await buildDesignLayout()
  const injected = adaptDesignMath('supportJs:e.dcSupportSource}', math)
  const fallback = JSON.parse(injected.slice('supportJs:e.dcSupportSource+'.length, -1))
  assert.equal(fallback, '\n;' + math, 'replacement tokens cannot corrupt the inline/blob math program')
  assert.doesNotThrow(() => new Script(fallback))
  const online = await buildDesignMathAssets()
  const critical = splitCriticalDesignSources(await readFile(resolve(source, manifest.entry.original), 'utf8'))
  const split = splitOptionalDesignSources(critical.source)
  const optimized = await optimizeDesignBrowserRuntime(translateDesign(adaptDesignHostCapabilities(adaptDesignLayout(adaptVisibleDesignMount(adaptDesignRuntimeUrl(adaptOnlineDesignMath(split.source, online, layout.guest, manifest.math.offlineFile, 'sha256-' + createHash('sha256').update(math).digest('base64')))), layout.host)), catalog))
  assert.ok(optimized.removedBindings > 5000)
  assert.deepEqual(manifest.browserRuntime.removedNames, optimized.removedNames)
  assert.ok(manifest.math.loaderBytes < 10_000, 'entry carries only the detector')
  assert.ok(!entry.includes('KaTeX_AMS'), 'online entry must not carry math fonts')
  assert.ok(manifest.files['assets/' + manifest.math.onlineFile])
  assert.ok(manifest.files['assets/' + manifest.math.offlineFile])
  assert.ok(!entry.includes(math), 'full offline program is assembled at export')
  for (const [name, sizes] of Object.entries(manifest.compressed)) {
    const bytes = await readFile(resolve(output, name))
    assert.deepEqual(brotliDecompressSync(await readFile(resolve(output, `${name}.br`))), bytes)
    assert.deepEqual(gunzipSync(await readFile(resolve(output, `${name}.gz`))), bytes)
    assert.ok(sizes.br < bytes.length)
    if (name.endsWith('.js')) {
      if (critical.files.has(name.replace('assets/', ''))) { assert.deepEqual(bytes, critical.files.get(name.replace('assets/', ''))); continue }
      if (split.files.has(name.replace('assets/', ''))) { assert.deepEqual(bytes, split.files.get(name.replace('assets/', ''))); continue }
      if (name === 'assets/' + manifest.math.offlineFile) { assert.equal(bytes.toString(), math); continue }
      if (online.files.has(name.replace('assets/', ''))) { assert.deepEqual(bytes, online.files.get(name.replace('assets/', ''))); continue }
      const original = await readFile(resolve(source, name === manifest.entry.file ? manifest.entry.original : name === manifest.runtime.file ? manifest.runtime.original : name))
      const expected = name === manifest.entry.file ? Buffer.from('await new Promise(resolve=>globalThis.__lingxiDesignStartup.run(resolve));\n' + optimized.source + '\nglobalThis.dispatchEvent(new Event("lingxi:design-runtime-ready"));\n')
        : name === manifest.runtime.file ? Buffer.from(original.toString() + '\n;' + layout.guest + ';(' + online.loader + ')(new URL(document.currentScript.src).origin);') : original
      assert.deepEqual(bytes, expected, name)
    }
  }
  const originalHtml = await readFile(resolve(source, 'index.html'), 'utf8')
  const originalCss = await readFile(resolve(source, /href="\.\/(assets\/[^"/]+\.css)"/.exec(originalHtml)[1]), 'utf8')
  const font = /data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(originalCss)
  assert.deepEqual(await readFile(resolve(output, manifest.styles.fallbackFont)), Buffer.from(font[1], 'base64'))
  const css = await readFile(resolve(output, manifest.styles.file), 'utf8')
  const productTheme = await readFile('third_party/baoyu-design/host/design-theme.css', 'utf8')
  const productFonts = (await readFile('src/styles/fonts.css', 'utf8')).replaceAll('/fonts/mingli/', './')
  assert.equal(css.replace(`./${manifest.styles.fallbackFont.split('/').at(-1)}`, font[0])
    .replace(`./${manifest.styles.icons.split('/').at(-1)}`, `./${manifest.styles.originalIcons}`), originalCss + '\n' + productFonts + '\n' + productTheme)
  for (const [, file] of (productFonts + productTheme).matchAll(/url\(['"]?\.\/([^'"\s)]+)/g)) {
    assert.ok(manifest.files[`assets/${file}`], `host font ${file} must be available offline`)
  }
  assert.ok(manifest.styles.bytes < manifest.styles.originalBytes)
  const html = await readFile(resolve(output, 'index.html'), 'utf8')
  assert.equal(html.split('data-lingxi-design-critical').length - 1, 2, 'only entry and blocking stylesheet own shell failure')
  assert.ok(!html.includes('rel="preload" as="script"'), 'the external fallback must not download on the embedded path')
  assert.ok(!Object.keys(manifest.files).includes('share-ui.js') && !html.includes('share-ui') && !html.includes('__share'), 'unported sharing UI is not shipped')
  assert.ok(html.includes(`name="dc-runtime-file" content="__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/${manifest.runtime.file.split('/').at(-1)}"`))
  assert.throws(() => adaptDesignRuntimeUrl('unknown pinned source'), /runtime URL hook/)
  assert.match(html, /<html lang="zh-CN"/)
  assert.match(html, /data-placeholder[^>]*>正在加载…/)
  assert.match(html, /dc-babel-file/)
  assert.match(html, /fast-edit-worker-file/)
  assert.match(html, /__LINGXI_DESIGN_ASSET_ORIGIN__\/artifact-editor\/design-assets\/design-[a-f0-9]{64}\.js" integrity="sha256-/)
})

test('unused capture, property-worker and offline-export programs leave the first-view source', async () => {
  const { splitOptionalDesignSources } = await import('./build-design-editor.mjs')
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js', 'utf8')
  const split = splitOptionalDesignSources(original)
  assert.deepEqual(Object.keys(split.programs).sort(), ['propertyScrubber', 'standaloneExport', 'svgCapture'])
  for (const [id, asset] of Object.entries(split.programs)) {
    const code = split.files.get(asset.file).toString()
    assert.equal(Buffer.byteLength(code), asset.bytes)
    assert.equal(createHash('sha256').update(code).digest('hex'), asset.sha256)
    assert.doesNotThrow(() => new Script(code), id)
    assert.ok(!split.source.includes(JSON.stringify(code)), id + ' must wait for its actual consumer')
  }
  assert.match(split.source, /await __lingxiDesignSource\("svgCapture"\)/)
  assert.match(split.source, /await __lingxiDesignSource\("propertyScrubber"\)/)
  assert.match(split.source, /await __lingxiDesignSource\("standaloneExport"\)/)
})
