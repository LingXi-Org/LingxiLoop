import assert from 'node:assert/strict'
import test from 'node:test'
import { translateDesign } from './design-copy.mjs'

test('translates UI literals while retaining identifiers and document data', () => {
  const source = 'const x={defaultMessage:"Export",label:"Export",title:flag?"Export":"Other",icon:"Export",key:"Export",value:"Export"};'
  assert.equal(translateDesign(source, { Export: '导出' }), 'const x={defaultMessage:"导出",label:"导出",title:flag?"导出":"Other",icon:"Export",key:"Export",value:"Export"};')
})
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

test('translated ICU messages preserve variables and parse', async () => {
  const source = await readFile('third_party/baoyu-design/upstream/claude-slides/scripts/editor/assets/index-kN-1njux.js', 'utf8')
  const tree = ts.createSourceFile('slides.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const formatter = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.getText(tree).includes('a(e,"createMessageFormatter"'))
  const namespace = runInNewContext(`const e={};function a(object,key,getter){Object.defineProperty(object,key,{get:getter})};${formatter.getText(tree)};${formatter.name.text}(e)();e`, { Intl, console })
  const catalog = JSON.parse(await readFile('third_party/baoyu-design/host/design-zh-CN.json', 'utf8'))
  const design = ts.createSourceFile('design.js', await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const shared = JSON.parse(await readFile('third_party/baoyu-design/host/slides-zh-CN.json', 'utf8'))
  Object.assign(shared, catalog)
  const messages = new Set(), properties = new Set()
  const copyProperties = new Set(['label', 'title', 'placeholder', 'tooltip', 'tip', 'children', 'aria-label', 'description'])
  function collect(node) {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(design).replaceAll('"', '')
      if (name === 'defaultMessage') messages.add(node.initializer.text)
      else if (copyProperties.has(name)) properties.add(node.initializer.text)
    }
    ts.forEachChild(node, collect)
  }
  collect(design)
  assert.deepEqual([...messages, ...properties].filter(message => !Object.hasOwn(shared, message)), [])
  assert.equal(messages.size, 2224)
  const failures = []
  for (const source of messages) {
    const translated = shared[source]
    const variables = new Set([...source.matchAll(/\{(\w+)[,}]/g)].map(match => match[1]))
    const actual = new Set([...translated.matchAll(/\{(\w+)[,}]/g)].map(match => match[1]))
    const shape = nodes => nodes.filter(node => typeof node !== 'string').map(node => ({ t: node.t, n: node.n, ...(node.o ? { o: Object.fromEntries(Object.entries(node.o).map(([key, value]) => [key, shape(value)])) } : {}), ...(node.c ? { c: shape(node.c) } : {}) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    try { if (Object.hasOwn(catalog, source) && JSON.stringify(shape(namespace.parseIcuMessage(source))) !== JSON.stringify(shape(namespace.parseIcuMessage(translated)))) { failures.push(source); continue } } catch { failures.push(source); continue }
    const args = Object.fromEntries([...variables].map(key => [key, 2]))
    Object.assign(args, { dim: text => text, strong: text => text })
    try { namespace.formatIcuMessage(translated, args, 'zh-CN') } catch (error) { failures.push(source + " :: " + error.message) }
  }
  assert.deepEqual(failures, [])
})


test('translates known UI helpers without changing saved page names or helper keys', () => {
  const source = 'const a=(0,e.lookPreviewFromColors)(e.ORIGINAL_LOOK,"Original look",{}),b=other("Original look");let Ii=Ws.find(ae=>ae.id===Yr)?.name??e.defaultCanvasPage.name;const p=Ws.length>0?Ho:[{id:"",name:e.defaultCanvasPage.name}];const model={id:"page-1",name:"Page 1"};(0,e.useLabel)("close","Close");(0,e.resolveLabel)(context,"nSelected","{count} selected");(0,e.useLabel)(key,flag?"Scroll back":"Scroll forward")'
  const expected = 'const a=(0,e.lookPreviewFromColors)(e.ORIGINAL_LOOK,"原始外观",{}),b=other("Original look");let Ii=Ws.find(ae=>ae.id===Yr)?.name??"第 1 页";const p=Ws.length>0?Ho:[{id:"",name:"第 1 页"}];const model={id:"page-1",name:"Page 1"};(0,e.useLabel)("close","关闭");(0,e.resolveLabel)(context,"nSelected","已选择 {count} 项");(0,e.useLabel)(key,flag?"向前滚动":"向后滚动")'
  assert.equal(translateDesign(source, { Close: '关闭', '{count} selected': '已选择 {count} 项', 'Scroll back': '向前滚动', 'Scroll forward': '向后滚动' }), expected)
})

test('translates only the Combobox empty-result fallback', () => {
  const source = 'function sj(){let W;const marker="data-cds-combobox-placeholder";W="No results";return W}function other(){let W;W="No results";return W}const value="No results";'
  assert.equal(translateDesign(source, {}), 'function sj(){let W;const marker="data-cds-combobox-placeholder";W="无搜索结果";return W}function other(){let W;W="No results";return W}const value="No results";')
})
