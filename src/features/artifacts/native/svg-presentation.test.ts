import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createPage, createNode, isSafeArtifactSvg } from '../../../../shared/artifact-document'
import { presentSvg, inheritedSvgFont } from './svg-presentation'

test('SVG presentation maps known fonts and scopes paint IDs without altering text or source', () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150"><defs><linearGradient id="paint"><stop offset="0" stop-color="#123456" /></linearGradient></defs><text font-family="'Merriweather', serif" fill="url(#paint)">id="literal" font-family="Merriweather" url(#paint)</text></svg>`
  assert.equal(isSafeArtifactSvg(source), true)
  const result = presentSvg(source, 'page-node-')
  assert.match(result, /font-family="&quot;LingxiLoopEditor Merriweather&quot;, serif"/)
  assert.match(result, /id="page-node-paint"/)
  assert.match(result, /fill="url\(#page-node-paint\)"/)
  assert.ok(result.includes('>id="literal" font-family="Merriweather" url(#paint)</text>'))
  assert.ok(source.includes('font-family="\'Merriweather\', serif"'))
})

test('unsafe SVG remains rejected and custom system font data stays unchanged', () => {
  assert.equal(presentSvg('<svg><script>alert(1)</script></svg>'), '')
  assert.equal(presentSvg('<svg onload="alert(1)"></svg>'), '')
  const custom = '<svg><text font-family="User Font">原文</text></svg>'
  assert.equal(presentSvg(custom), custom)
})


test('SVG images inherit an authored group font while absent and explicit families stay distinct',()=>{
  const document=createDocument('design','fonts'),page=createPage('page','画板')
  const parent={...createNode('group','group'),style:{fontFamily:'Merriweather'}}
  const node={...createNode('svg','svg'),parentId:parent.id}
  page.nodes={[parent.id]:parent,[node.id]:node};page.nodeOrder=[parent.id,node.id];document.pages[page.id]=page;document.pageOrder=[page.id]
  assert.equal(inheritedSvgFont(node,page,document),'Merriweather')
  assert.equal(inheritedSvgFont({...node,style:{fontFamily:'Arial'}},page,document),'Arial')
  assert.equal(inheritedSvgFont({...node,parentId:null},page,document),undefined)
})
