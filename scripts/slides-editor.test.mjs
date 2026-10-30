import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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
  assert.equal(report.messageCount, 475)
  assert.ok(report.initial.bytes < report.original.bytes * 0.9)
  assert.ok(report.initial.gzip < report.original.gzip * 0.9)
  assert.ok(Object.keys(report.files).some(name => name.startsWith('pptx-library-')))
  assert.ok(Object.keys(report.files).some(name => name.startsWith('video-worker-source-')))
  const html = await readFile(resolve('server/assets/slides-editor/index.html'), 'utf8')
  assert.match(html, /lang="zh-CN"/)
  assert.match(html, /\/artifact-editor\/slides-assets\/editor-[A-Z0-9]+\.js/)
  assert.doesNotMatch(html, /index-BSIksl9u/)
})
