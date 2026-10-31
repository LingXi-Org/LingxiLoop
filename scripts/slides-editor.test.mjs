import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { buildSlidesEditor, translateSlides } from './build-slides-editor.mjs'

test('native copy translation preserves icon names, enums, shortcuts and document values', () => {
  const source = 'const ui={label:busy?other:"Download",title:label(kind==="Text"?"Text":"Body"),icon:{name:"Text"},onKeyDown:event=>event.key==="Delete",value:"auto",children:"Text"};'
  assert.equal(translateSlides(source, { Download: '下载', Text: '文本', Body: '正文', Delete: '删除', auto: '自动' }).source,
    'const ui={label:busy?other:"下载",title:label(kind==="Text"?"文本":"正文"),icon:{name:"Text"},onKeyDown:event=>event.key==="Delete",value:"auto",children:"文本"};')
  assert.throws(() => translateSlides('const message={defaultMessage:"New upstream message"}', {}), /Missing Slides translation/)
})

test('every translated ICU message parses and formats using the bundled formatter', async () => {
  const source = await readFile(new URL('../third_party/baoyu-design/upstream/claude-slides/scripts/editor/assets/index-BSIksl9u.js', import.meta.url), 'utf8')
  const catalog = JSON.parse(await readFile(new URL('../third_party/baoyu-design/host/slides-zh-CN.json', import.meta.url), 'utf8'))
  const tree = ts.createSourceFile('slides.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const formatter = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.getText(tree).includes('a(e,"createMessageFormatter"'))
  assert.ok(formatter)
  const namespace = runInNewContext(`const e={};function a(object,key,getter){Object.defineProperty(object,key,{get:getter})};${formatter.getText(tree)};${formatter.name.text}(e)();e`, { Intl, console })
  let count = 0
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'defaultMessage' && ts.isStringLiteral(node.initializer)) {
      const translated = catalog[node.initializer.text]
      assert.ok(translated)
      const variables = new Set([...node.initializer.text.matchAll(/\{(\w+)[,}]/g)].map(match => match[1]))
      const args = Object.fromEntries([...variables].map(key => [key, 2]))
      Object.assign(args, { dim: text => text, strong: text => text })
      for (const [, variable] of translated.matchAll(/\{(\w+)[,}]/g)) assert.ok(variables.has(variable), variable)
      assert.doesNotThrow(() => namespace.formatIcuMessage(translated, args, 'zh-CN'), node.initializer.text)
      count++
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(count >= 475)
})

test('native build keeps export libraries lazy and reduces initial JavaScript', async () => {
  const report = await buildSlidesEditor()
  assert.equal(report.messageCount, 499)
  assert.equal(report.modules + report.removedModules.length, 321)
  assert.ok(report.inputs.every(path => path.startsWith('third_party/baoyu-design/slides-source/')))
  assert.ok(report.inputs.some(path => path.endsWith('/modules/editor-app.js')))
  assert.ok(report.inputs.some(path => path.endsWith('/modules/compiler-html.js')))
  assert.ok(report.initial.bytes < report.original.bytes * 0.9)
  assert.ok(report.initial.gzip < report.original.gzip * 0.9)
  assert.ok(Object.keys(report.files).some(name => name.startsWith('pptx-library-')))
  assert.ok(Object.keys(report.files).some(name => name.startsWith('exports-')))
  assert.ok(!Object.keys(report.files).some(name => name.includes('video')))
  assert.ok(!report.inputs.some(path => /video-(?:worker|encoder|playback|providers)/.test(path)))
  const html = await readFile(resolve('server/assets/slides-editor/index.html'), 'utf8')
  assert.match(html, /lang="zh-CN"/)
  assert.match(html, /\/artifact-editor\/slides-assets\/editor-[A-Z0-9]+\.js/)
  assert.doesNotMatch(html, /index-BSIksl9u/)
  assert.ok(html.includes(report.styles.file))
  const css = await readFile(resolve('server/assets/slides-editor/assets', report.styles.file), 'utf8')
  assert.ok(css.includes(report.styles.fallbackFont))
  assert.doesNotMatch(css, /data:font\/woff2;base64/)
  const originalCss = await readFile(resolve('third_party/baoyu-design/slides-source/editor.css'), 'utf8')
  const originalFont = Buffer.from(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(originalCss)[1], 'base64')
  assert.deepEqual(await readFile(resolve('server/assets/slides-editor/assets', report.styles.fallbackFont)), originalFont)
  for (const name of Object.keys(report.compressed)) {
    const path = resolve('server/assets/slides-editor/assets', name), bytes = await readFile(path)
    assert.deepEqual(brotliDecompressSync(await readFile(`${path}.br`)), bytes, name)
    assert.deepEqual(gunzipSync(await readFile(`${path}.gz`)), bytes, name)
  }
})

test('complete upstream distributions retain every pinned byte and license', async () => {
  for (const folder of ['baoyu-design', 'assistant-ui-with-artifacts']) {
    const directory = resolve('third_party', folder)
    const manifest = JSON.parse(await readFile(resolve(directory, 'complete-manifest.json'), 'utf8'))
    assert.ok(manifest.files.some(file => file.path === 'LICENSE'))
    assert.equal(manifest.files.length, folder === 'baoyu-design' ? 319 : 14)
    for (const file of manifest.files) {
      const bytes = await readFile(resolve(directory, file.path))
      assert.equal(bytes.length, file.bytes, file.upstreamPath)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.upstreamPath)
    }
  }
})

test('rebuilt compiler preserves pinned format behavior, ids, notes, tables, images and design-system includes', async () => {
  const require = createRequire(import.meta.url)
  const rebuilt = require('../server/assets/slides-editor/node/compiler.cjs').runtime
  const pinned = require('../third_party/baoyu-design/upstream/claude-slides/scripts/editor/node/compiler.cjs').runtime
  const examples = [
    '<section id="old-slide"><h1>Mixed case 原稿</h1><p>Keep my text</p><aside>Speaker notes 保留</aside></section>',
    '<section id="data"><table><tr><td>A</td><td>B</td></tr></table><svg width="50" height="50"><rect width="40" height="40"/></svg></section>',
    '<style>h1{color:#246;font-family:Arial}</style><section id="image"><h1>Image</h1><img src="/_blob/1234567890abcdef1234567890abcdef" width="640" height="360"/></section>',
    '<link rel="stylesheet" href="ds/example/styles.css"><section id="theme"><h1>Theme</h1></section>',
    '<section id="legacy"><video src="/_blob/1234567890abcdef1234567890abcdef" aria-label="Legacy media"></video><img data-video-youtube="abcdefghijk" alt="Old link"/></section>',
  ]
  for (const html of examples) assert.deepEqual(rebuilt.compileSlideHtml(html), pinned.compileSlideHtml(html))
  for (const retired of ['VideoElement', 'videoEmbedUrl', 'videoWatchUrl', 'withVideoStill', 'videoStillNeedsRefresh']) {
    assert.equal(Object.hasOwn(rebuilt, retired), false, retired)
  }
})
