import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createPage, createNode, validateArtifactDocument } from './artifact-document.js'
import { applyOperations, prepareBatch, ArtifactOperationConflict } from './artifact-operations.js'
import { duplicatePages, distributeNodes, resizeSelection, layoutSlide, drawingNode, canvasShapeNode, ungroupNodes, appendDrawingPoint } from './artifact-editor-actions.js'

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
test('slide duplicates retain motion identity across repeated copies and undo without reusing node ids', () => {
  const doc = fixture(), before = structuredClone(doc)
  doc.pages.first!.transition = 'magic'
  let count = 0
  const first = applyOperations(doc, prepareBatch(doc, duplicatePages(doc, ['first'], () => `motion-${++count}`), 'first-copy'))
  const copied = first.document.pages['motion-1']!
  assert.equal(copied.transition, 'magic')
  assert.equal(copied.nodes['motion-3']!.motionId, 'text')
  const second = applyOperations(first.document, prepareBatch(first.document, duplicatePages(first.document, [copied.id], () => `motion-${++count}`), 'second-copy'))
  assert.equal(second.document.pages['motion-4']!.nodes['motion-6']!.motionId, 'text')
  assert.equal(validateArtifactDocument(JSON.parse(JSON.stringify(second.document))).pages['motion-4']!.transition, 'magic')
  assert.deepEqual(applyOperations(first.document, prepareBatch(first.document, first.inverse, 'undo-copy')).document.pages, doc.pages)
  assert.deepEqual(doc.pages.first!.nodes, before.pages.first!.nodes)
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
test('resizing a drawing changes its actual local point geometry',()=>{
  const node=drawingNode('d',[{x:0,y:0},{x:100,y:100}],'pencil')
  assert.deepEqual(resizeSelection([node],'se',100,100)[0].points,[{x:0,y:0},{x:200,y:200}])
})
test('ungrouping rotated mirrored objects preserves their world-space geometry',()=>{
  const group={...createNode('group','g'),x:100,y:200,width:200,height:100,rotation:90,flipX:true}
  const child={...createNode('shape','c'),parentId:'g',x:0,y:0,width:40,height:20,rotation:15}
  const result=ungroupNodes(group,[child])[0]
  assert.equal(result.rotation,75);assert.equal(result.flipX,true);assert.equal(result.parentId,null)
  assert.ok(Math.abs(result.x-220)<1e-9);assert.ok(Math.abs(result.y-320)<1e-9)
})
test('long stroke sampling keeps the gesture origin and latest point within its bound',()=>{
  let points=[{x:10,y:20}]
  for(let i=1;i<6000;i++) points=appendDrawingPoint(points,{x:10+i,y:20+i})
  assert.deepEqual(points[0],{x:10,y:20});assert.deepEqual(points.at(-1),{x:6009,y:6019});assert.ok(points.length<=2000)
})


test('canvas rectangles and ellipses preserve pointer bounds in every drag direction through persistence and undo',()=>{
  const doc=createDocument('design','canvas-shapes'),page=createPage('board');doc.pageOrder=[page.id];doc.pages[page.id]=page
  const start={x:-300,y:400}
  for(const end of [{x:-200,y:500},{x:-400,y:500},{x:-400,y:300},{x:-200,y:300}]){
    const node=canvasShapeNode('drawn','rect',start,end),result=applyOperations(doc,prepareBatch(doc,[{type:'node.insert',pageId:page.id,node}]))
    assert.deepEqual([node.x,node.y,node.width,node.height],[Math.min(start.x,end.x),Math.min(start.y,end.y),100,100])
    const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(result.document)))
    assert.deepEqual(reopened.pages[page.id]!.nodes.drawn,node)
    assert.deepEqual(applyOperations(result.document,prepareBatch(result.document,result.inverse)).document.pages,doc.pages)
  }
  assert.deepEqual([canvasShapeNode('rect','rect',start).width,canvasShapeNode('oval','ellipse',start).width],[120,96])
  const thin=canvasShapeNode('thin','rect',start,{x:-300,y:500});assert.equal(thin.width,2)
})
