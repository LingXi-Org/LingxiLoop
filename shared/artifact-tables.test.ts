import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage, validateArtifactDocument } from './artifact-document'
import { createTableNode } from './artifact-tables'
import { applyOperations, prepareBatch } from './artifact-operations'
import { artifactResolvedStyle } from './artifact-themes'
import { duplicatePages } from './artifact-editor-actions'
import { artifactPreviews } from './artifact-previews'

test('the insert action creates the reference three-by-three table with Chinese headings', () => {
  const page = { ...createPage('page'), width: 1920, height: 1080 }
  const node = createTableNode('table', page)
  assert.equal(node.tableHeader, true)
  assert.deepEqual(node.cells, [['列标题', '列标题', '列标题'], ['', '', ''], ['', '', '']])
  assert.equal(node.width, 900); assert.equal(node.x, 128)
  assert.ok(Math.abs(node.y + node.height / 2 - 540) < 1e-8)
  const style = artifactResolvedStyle(node.style, createDocument('slides', 'doc'))
  assert.equal(style.color, '#141413'); assert.match(style.fontFamily!, /^system-ui/)
  assert.equal(style.fontSize, 32); assert.equal(style.lineHeight, 1.4)
})

test('header state survives save, preview, duplicate and shared undo without rewriting old tables', () => {
  const document = createDocument('slides', 'doc'), page = createPage('page')
  const old = createNode('table', 'old'), table = createTableNode('new', page)
  page.nodes = { old, new: table }; page.nodeOrder = ['old', 'new']; document.pages.page = page; document.pageOrder = ['page']
  const original = structuredClone(document)
  const saved = validateArtifactDocument(JSON.parse(JSON.stringify(document)))
  assert.equal(saved.pages.page.nodes.new.tableHeader, true)
  assert.equal(saved.pages.page.nodes.old.tableHeader, undefined)
  assert.equal(artifactPreviews(saved).page.nodes.new.tableHeader, true)
  let copyId=0
  const copied=applyOperations(saved,prepareBatch(saved,duplicatePages(saved,['page'],()=>`copy-${++copyId}`),'copy')).document
  const copy=copied.pages['copy-1']
  assert.equal(Object.values(copy.nodes).find(node=>node.cells?.[0]?.[0]==='列标题')?.tableHeader,true)
  const changed = applyOperations(saved, prepareBatch(saved, [{ type: 'node.patch', pageId: 'page', nodeId: 'old', patch: { tableHeader: true } }], 'header'))
  const restored = applyOperations(changed.document, prepareBatch(changed.document, changed.inverse, 'undo')).document
  assert.deepEqual(restored.pages, original.pages)
  const themed = { ...document, themeId: 'theme', themes: { theme: { id: 'theme', name: '主题', tokens: { text: '#abcdef', 'font.sans': 'Arial' } } } }
  assert.equal(artifactResolvedStyle(table.style, themed).color, '#abcdef')
  assert.equal(artifactResolvedStyle(table.style, themed).fontFamily, 'Arial')
  assert.deepEqual(document, original)
})
