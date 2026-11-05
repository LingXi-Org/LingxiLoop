import './slides-debug.test.mjs'
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
import './slides-math.test.mjs'

test('native copy translation preserves icon names, enums, shortcuts and document values', () => {
  const source = 'const ui={label:busy?other:"Download",title:label(kind==="Text"?"Text":"Body"),icon:{name:"Text"},onKeyDown:event=>event.key==="Delete",value:"auto",children:"Text"};'
  assert.equal(translateSlides(source, { Download: '下载', Text: '文本', Body: '正文', Delete: '删除', auto: '自动' }).source,
    'const ui={label:busy?other:"下载",title:label(kind==="Text"?"文本":"正文"),icon:{name:"Text"},onKeyDown:event=>event.key==="Delete",value:"auto",children:"文本"};')
  assert.throws(() => translateSlides('const message={defaultMessage:"New upstream message"}', {}), /Missing Slides translation/)
})

test('every translated ICU message parses and formats using the bundled formatter', async () => {
  const source = await readFile(new URL('../third_party/baoyu-design/upstream/claude-slides/scripts/editor/assets/index-kN-1njux.js', import.meta.url), 'utf8')
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
  assert.ok(count >= 1446)
})

test('native build keeps export libraries lazy and reduces initial JavaScript', async () => {
  const report = await buildSlidesEditor()
  assert.equal(report.messageCount, 1446)
  assert.equal(report.modules + report.removedModules.length, 332)
  assert.ok(report.inputs.every(path => path === 'shared/artifact-recovery.ts' || path.startsWith('third_party/baoyu-design/slides-source/') ||
    ['node_modules/katex/dist/katex.mjs', 'node_modules/katex/contrib/auto-render/splitAtDelimiters.ts'].includes(path)))
  assert.ok(report.inputs.some(path => path.endsWith('/modules/editor-app.js')))
  assert.ok(report.inputs.some(path => path.endsWith('/modules/compiler-html.js')))
  assert.ok(report.initial.bytes < report.original.bytes * 0.9)
  assert.ok(report.initial.gzip < report.original.gzip * 0.9)
  const browserEntry = await readFile(resolve('server/assets/slides-editor/assets', report.entry.file), 'utf8')
  assert.ok(!browserEntry.includes('"buildBootErrorPresentation"'), 'Unused browser runtime getters must be pruned on every build platform')
  assert.ok(Object.keys(report.files).some(name => name.startsWith('pptx-library-')))
  assert.ok(Object.keys(report.files).some(name => name.startsWith('exports-')))
  assert.ok(!Object.keys(report.files).some(name => name.includes('video')))
  assert.ok(!report.inputs.some(path => /video-(?:worker|encoder|playback|providers)/.test(path)))
  const html = await readFile(resolve('server/assets/slides-editor/index.html'), 'utf8')
  assert.match(html, /lang="zh-CN"/)
  assert.match(html, /\/artifact-editor\/slides-assets\/editor-[A-Z0-9]+\.js/)
  assert.doesNotMatch(html, /index-kN-1njux/)
  assert.ok(html.includes(report.styles.file))
  assert.deepEqual(Object.keys(report.features).sort(), ['exports', 'math', 'pptx', 'presentation', 'properties', 'templates', 'woff2'])
  assert.ok(!report.initial.inputs.some(path => path.endsWith('/modules/files-debug-panel.js')), 'disabled file debugger stays out of first view')
  assert.ok(report.inputs.some(path => path.endsWith('/modules/files-debug-panel.js')), 'enabled debugger remains packaged')
  assert.ok(report.features.properties.some(file => file.startsWith('properties-')))
  assert.ok(!report.initial.inputs.some(path => /\/(?:ui-selection-inspector|design-system-theme-panel|ui-segmented-property|ui-sides-property)\.js$/.test(path)), 'closed property panels stay out of first view')
  assert.ok(report.features.presentation.some(file => file.startsWith('presentation-')))
  assert.ok(!report.initial.inputs.some(path => /\/(?:presentation-view|presentation-speaker-panel)\.js$/.test(path)), 'presentation view stays out of first view')
  assert.ok(report.features.templates.some(file => file.startsWith('templates-')))
  assert.ok(!report.initial.inputs.some(path => /\/(?:editor-templates|editor-template-restyling)\.js$/.test(path)), 'template data/picker/restyling stay out of first view')
  assert.ok(report.features.math.some(file => file.startsWith('math-')))
  assert.ok(!report.features.exports.some(file => file.startsWith('math-')), 'plain exports do not load the TeX renderer')
  assert.match(html, /name="lingxi-editor-features"/)
  const css = await readFile(resolve('server/assets/slides-editor/assets', report.styles.file), 'utf8')
  assert.doesNotMatch(css, /KaTeX_|\.katex\{/, 'ordinary decks do not download formula CSS')
  assert.ok(!report.initial.inputs.some(path => path.includes('katex/dist/katex')), 'TeX renderer stays outside the first view')
  assert.ok(Object.keys(report.files).some(name => name.startsWith('math-')), 'first formula has a separate hashed module')
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
    assert.equal(manifest.files.length, folder === 'baoyu-design' ? 542 : 14)
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

test('Slides formula sources and monospace semantics survive existing-format save/reopen', () => {
  const require = createRequire(import.meta.url)
  const runtime = require('../server/assets/slides-editor/node/compiler.cjs').runtime
  const source = String.raw`<section id="formula"><p>\[\begin{aligned}a&amp;=b\\c&amp;=d\end{aligned}\]</p><p style="font-family:monospace">\(x_i^2\)</p><table><tr><td>\(\frac{1}{2}\)</td></tr></table></section>`
  const compiled = runtime.compileSlideHtml(source)
  assert.deepEqual(compiled.errors, [])
  const nodes = [...runtime.iterateDeckTextNodes(Object.values(compiled.content.slides))]
  assert.ok(nodes.some(node => node.style?.fontFamily === 'mono' && node.text === String.raw`\(x_i^2\)`))
  const saved = runtime.serializeDeckHtml(compiled.content, 'Math')
  assert.doesNotMatch(saved, /class="katex/)
  assert.deepEqual(runtime.compileSlideHtml(saved).content, compiled.content)
})

test('new deck templates use persisted source-derived style, including after a blank page', async () => {
  const require = createRequire(import.meta.url)
  const runtime = require('../server/assets/slides-editor/node/compiler.cjs').runtime
  const builtin = JSON.parse(await readFile('third_party/baoyu-design/slides-source/builtin-style.json', 'utf8'))
  const memory = runtime.parseRestyleMemory(builtin.style)[0]
  for (const template of runtime.SLIDE_TEMPLATES) {
    const original = template.make()
    const styled = runtime.createTemplateRestyler({ slides: [], typeStyles: [], theme: 'neutral', style: builtin.style })(original)
    assert.equal(styled.bg, '#f5f4ed', template.id)
    for (const node of runtime.iterateDeckTextNodes([styled])) {
      const expected = memory.text[node.role]
      assert.ok(expected, node.role)
      const combo = runtime.nodeTypographyCombo(node, 'neutral')
      assert.equal(combo.fontSize, expected.fontSize, node.role)
      assert.equal(combo.fontWeight, expected.fontWeight, node.role)
      assert.equal(combo.lineHeight, expected.lineHeight, node.role)
      assert.notEqual(combo.fontFamily, 'helvetica', node.role)
    }
    const blank = { v: 1, id: 'blank', bg: '#123456', frames: [] }
    const afterBlank = runtime.createTemplateRestyler({ current: blank, slides: [blank],
      typeStyles: runtime.inferDeckTypographyStyles([blank], 'neutral'), theme: 'neutral', style: builtin.style })(original)
    assert.equal(afterBlank.bg, '#123456')
    for (const node of runtime.iterateDeckTextNodes([afterBlank])) {
      assert.equal(runtime.nodeTypographyCombo(node, 'neutral').fontSize, memory.text[node.role].fontSize)
    }
  }
})

test('built-in color and type data match the pinned Slides implementation', async () => {
  const require = createRequire(import.meta.url)
  const pinned = require('../third_party/baoyu-design/upstream/claude-slides/scripts/editor/node/compiler.cjs').runtime
  const builtin = JSON.parse(await readFile('third_party/baoyu-design/slides-source/builtin-style.json', 'utf8'))
  assert.deepEqual(Object.fromEntries(builtin.tokens.color.tokens.map(({ name, value }) => [name, value])), pinned.namedSlideColors)
  const memory = pinned.parseRestyleMemory(builtin.style)[0]
  for (const style of builtin.tokens.type.groups[0].styles) {
    const expected = pinned.anthropicTypeScale[style.name]
    assert.equal(style.fontSize, expected.fontSize)
    assert.equal(style.fontWeight, expected.fontWeight)
    assert.equal(style.lineHeight, expected.lineHeight)
    assert.equal(memory.text[style.name].fontSize, expected.fontSize)
    assert.equal(memory.text[style.name].family.generic, expected.serifDisplay ? 'serif' : 'sans')
  }
})

test('new pages inherit edited look memory and observed typography after a file roundtrip', async () => {
  const require = createRequire(import.meta.url)
  const runtime = require('../server/assets/slides-editor/node/compiler.cjs').runtime
  const builtin = JSON.parse(await readFile('third_party/baoyu-design/slides-source/builtin-style.json', 'utf8'))
  const memory = runtime.parseRestyleMemory(builtin.style)
  memory[0].colors.background = '#223344'
  memory[0].colors.text = '#faf9f5'
  memory[0].text.h2 = { ...memory[0].text.h2, fontSize: 84, family: { name: 'Arial', generic: 'sans' } }
  const style = runtime.serializeRestyleMemory(memory)
  const original = runtime.SLIDE_TEMPLATES.find(t => t.id === 'two-col').make()
  const first = runtime.createTemplateRestyler({ slides: [], typeStyles: [], theme: 'neutral', style })(original)
  const deck = { theme: 'neutral', slides: { [first.id]: first }, order: [first.id], assets: {} }
  const reopened = runtime.compileSlideHtml(runtime.serializeDeckHtml(deck, 'Edited')).content
  const slides = Object.values(reopened.slides)
  const restyle = runtime.createTemplateRestyler({ current: slides[0], slides,
    typeStyles: runtime.inferDeckTypographyStyles(slides, 'neutral'), theme: 'neutral', style })
  const next = restyle(runtime.SLIDE_TEMPLATES.find(t => t.id === 'title-body').make())
  assert.equal(next.bg, '#223344')
  const heading = [...runtime.iterateDeckTextNodes([next])].find(n => n.role === 'h2')
  assert.equal(runtime.nodeTypographyCombo(heading, 'neutral').fontSize, 84)
  assert.equal(runtime.nodeTypographyCombo(heading, 'neutral').fontFamily.family, 'Arial')
  assert.equal(heading.color, '#faf9f5')
})

test('legacy decks have no automatic default and saved HTML retains authored styles', async () => {
  const require = createRequire(import.meta.url)
  const runtime = require('../server/assets/slides-editor/node/compiler.cjs').runtime
  const original = runtime.SLIDE_TEMPLATES[1].make()
  assert.equal(runtime.createTemplateRestyler({ slides: [], typeStyles: [], theme: 'neutral' })(original), original)
  const blank = { v: 1, id: 'old-blank', bg: '#123456', frames: [] }
  const added = runtime.createTemplateRestyler({ current: blank, slides: [blank],
    typeStyles: runtime.inferDeckTypographyStyles([blank], 'neutral'), theme: 'neutral' })(original)
  assert.equal(added.bg, '#123456')
  assert.deepEqual(added.frames, original.frames)
  const html = '<section id="custom" style="background:#123456"><h1 style="font-family:Georgia;font-size:72px;color:#fedcba">Original</h1></section>'
  const content = runtime.compileSlideHtml(html).content
  const reopened = runtime.compileSlideHtml(runtime.serializeDeckHtml(content, 'History')).content
  assert.deepEqual(reopened.slides, content.slides)
})

test('upstream theme variants parse and restyle slides', async () => {
  const runtime = createRequire(import.meta.url)('../server/assets/slides-editor/node/compiler.cjs').runtime
  const themes = JSON.parse(await readFile('third_party/baoyu-design/host/builtin-themes.json', 'utf8'))
  assert.deepEqual(themes.map(theme => theme.namespace), ['baoyu-ember', 'baoyu-seazar'])
  const slide = runtime.SLIDE_TEMPLATES.find(template => template.id === 'title-body').make()
  for (const theme of themes) {
    const palette = runtime.parseDesignTokens(theme.tokens, { title: theme.title })
    assert.ok(palette.colors.length > 0 && palette.type.length > 0)
    const system = runtime.analyzeDesignSystem(theme.tokens, { key: theme.namespace, title: theme.title })
    assert.deepEqual(system.themes.map(variant => variant.id), theme.tokens.color.themes.map(variant => variant.id))
    for (const variant of system.themes) {
      const background = runtime.themeColorsWithRole(variant, 'background')[0]
      assert.ok(background, `${theme.title}: ${variant.id}`)
      const analysis = runtime.analyzeDeckRestyle([slide], undefined, undefined)
      const plan = runtime.planSystemRestyle(analysis, system, undefined, { theme: variant.id })
      const styled = runtime.createSlideRestyler(plan, { slides: [slide], declared: new Set() })(slide)
      assert.equal((runtime.namedSlideColors[styled.bg] ?? styled.bg).toLowerCase(), background.value.toLowerCase())
    }
    assert.equal(slide.bg, 'white')
  }
})

test('a hidden retained Slides frame suspends its heartbeat and resumes the latest context only for its parent nonce', async () => {
  const { connectWorkspace } = await import('../third_party/baoyu-design/slides-source/workspace-bridge.js')
  const listeners = new Map(), sent = [], timers = new Set()
  const parent = { postMessage: message => sent.push(message) }
  const runtime = {}
  const window = { parent, getSelection: () => null, addEventListener: (type, callback) => listeners.set(type, callback), dispatchEvent() {} }
  const document = { documentElement: { dataset: {} } }
  runInNewContext(`(${connectWorkspace.toString()})(runtime)`, { runtime, window, parent, document, location: { hash: '#workspace=trusted' }, URLSearchParams,
    setInterval: callback => { timers.add(callback); return callback }, clearInterval: callback => timers.delete(callback) })
  runtime.reportNativeEditorContext({ slideId: 'one', mode: 'edit', dirty: false })
  assert.equal(sent.length, 1)
  const receive = listeners.get('message')
  receive({ source: parent, data: { type: 'slides:visibility', nonce: 'wrong', visible: false } })
  assert.equal(timers.size, 1)
  receive({ source: parent, data: { type: 'slides:visibility', nonce: 'trusted', visible: false } })
  assert.equal(timers.size, 0)
  runtime.reportNativeEditorContext({ slideId: 'two', mode: 'edit', dirty: true })
  assert.equal(sent.length, 1)
  receive({ source: parent, data: { type: 'slides:visibility', nonce: 'trusted', visible: true } })
  assert.equal(timers.size, 1)
  assert.equal(sent.at(-1).context.slideId, 'two')
})

test('progressive first edit preserves unloaded files and native CAS', async () => {
  const {checkProgressiveFiles} = await import('./slides-progressive.test.mjs')
  await checkProgressiveFiles()
})

test('progressive themed deck waits for tokens and preserves their native model and CAS', async () => {
  const {checkProgressiveFiles} = await import('./slides-progressive.test.mjs')
  await checkProgressiveFiles({systems:true})
  await checkProgressiveFiles({systems:true,changedTokens:true})
  await checkProgressiveFiles({systems:true,changedFont:true})
  await checkProgressiveFiles({systems:true,write:false})
  await checkProgressiveFiles({systems:true,narrowed:true})
})

test('progressive editing respects read-only, narrowed listings and revoked reads', async () => {
  const {checkProgressiveFiles} = await import('./slides-progressive.test.mjs')
  await checkProgressiveFiles({write:false})
  await checkProgressiveFiles({narrowed:true})
  await checkProgressiveFiles({revoke:true})
  await checkProgressiveFiles({downgrade:true})
  await checkProgressiveFiles({concurrent:true})
  await checkProgressiveFiles({deleted:true})
})
