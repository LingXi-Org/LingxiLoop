import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createPage, createNode, validateArtifactDocument } from './artifact-document.js'
import { applyOperations, prepareBatch, ArtifactOperationConflict } from './artifact-operations.js'
import { duplicatePages, distributeNodes, resizeSelection, layoutSlide, drawingNode } from './artifact-editor-actions.js'

function fixture() {
  const doc = createDocument('slides', 'fixture'), page = createPage('first')
  const group = createNode('group', 'group'), text = { ...createNode('text', 'text'), parentId: 'group', x: 10, y: 20 }
  page.nodes = { group, text }; page.nodeOrder = ['group', 'text']; doc.pages.first = page; doc.pageOrder = ['first']
  return doc
}
test('duplicating selected pages remaps every descendant and keeps the originals immutable', () => {
  const doc = fixture(), original = structuredClone(doc)
  let count = 0
  const ops = duplicatePages(doc, ['first'], () => `copy-${++count}`)
  const result = applyOperations(doc, prepareBatch(doc, ops, 'duplicate'))
  const copy = result.document.pages['copy-1']!
  assert.equal(copy.nodes['copy-3']!.parentId, 'copy-2')
  assert.equal(copy.nodes['copy-3']!.text, '文本')
  assert.deepEqual(doc, original)
  const restored = applyOperations(result.document, prepareBatch(result.document, result.inverse, 'undo')).document
  assert.deepEqual(restored.pages, original.pages)
})
test('opposite resize edges keep their opposite anchor and scale selected geometry together', () => {
  const a = { ...createNode('shape', 'a'), x: 100, y: 80, width: 100, height: 40 }
  const b = { ...createNode('shape', 'b'), x: 300, y: 80, width: 100, height: 40 }
  const changes = resizeSelection([a, b], 'nw', -150, -40)
  assert.deepEqual(changes.map(n => [n.x, n.y, n.width, n.height]), [[-50, 40, 150, 80], [250, 40, 150, 80]])
})
test('distribution preserves endpoints, order and object sizes', () => {
  const nodes = [0, 30, 100].map((x, i) => ({ ...createNode('shape', `n${i}`), x, width: 10 }))
  assert.deepEqual(distributeNodes(nodes, 'horizontal').map(n => n.x), [0, 50, 100])
})
test('drawings normalize points into local coordinates and survive validation/history', () => {
  const doc = fixture(), node = drawingNode('draw', [{ x: 100, y: 50 }, { x: 125, y: 75 }, { x: 150, y: 50 }], 'pencil')
  const changed = applyOperations(doc, prepareBatch(doc, [{ type: 'node.insert', pageId: 'first', node }], 'draw'))
  assert.deepEqual(changed.document.pages.first!.nodes.draw!.points, [{ x: 0, y: 0 }, { x: 25, y: 25 }, { x: 50, y: 0 }])
  assert.equal(validateArtifactDocument(changed.document).pages.first!.nodes.draw!.type, 'drawing')
})
test('extended appearance and media are data, merge by field and reject injected CSS', () => {
  const doc = fixture()
  const appearance = { gradient: { type: 'linear' as const, angle: 90, stops: [{ color: '#ff0000', offset: 0 }, { color: '#0000ff', offset: 1 }] }, shadow: { x: 2, y: 4, blur: 8, spread: 0, color: '#00000040' }, letterSpacing: 2 }
  const a = prepareBatch(doc, [{ type: 'node.patch', pageId: 'first', nodeId: 'text', patch: { style: appearance, flipX: true } }], 'style')
  const b = prepareBatch(doc, [{ type: 'node.patch', pageId: 'first', nodeId: 'text', patch: { text: '保留文字' } }], 'text')
  const next = applyOperations(applyOperations(doc, a).document, b).document
  assert.equal(next.pages.first!.nodes.text!.style.gradient?.stops.length, 2)
  assert.equal(next.pages.first!.nodes.text!.text, '保留文字')
  assert.throws(() => applyOperations(next, a), ArtifactOperationConflict)
  assert.throws(() => validateArtifactDocument({ ...next, pages: { first: { ...next.pages.first, nodes: { ...next.pages.first!.nodes, text: { ...next.pages.first!.nodes.text, style: { gradient: { ...appearance.gradient, stops: [{ color: 'url(https://bad)', offset: 0 }] } } } } } } }))
})
test('slide layouts create editable native nodes without replacing existing content', () => {
  let count = 0
  const nodes = layoutSlide('title-body', createPage('p'), () => `layout-${++count}`)
  assert.equal(nodes.length, 2)
  assert.ok(nodes.every(node => node.type === 'text' && node.width > 0 && node.height > 0))
})
