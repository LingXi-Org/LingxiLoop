import assert from 'node:assert/strict'
import test from 'node:test'
import { createNode, createPage } from './artifact-document.js'
import { encodeCommentAnchor, decodeCommentAnchor, commentPoint, commentAnchorAtPoint } from './artifact-comment-anchor.js'
test('native comment anchors round trip and follow nested node geometry', () => {
  const page = createPage('page'), parent = { ...createNode('group', 'parent'), x: 100, y: 200, rotation: 0 }
  page.nodes.parent = parent; page.nodes.child = { ...createNode('text', 'child'), parentId: 'parent', x: 20, y: 30, width: 80, height: 40 }
  const anchor = { pageId: page.id, nodeId: 'child', x: .5, y: .5 }
  assert.deepEqual(decodeCommentAnchor(encodeCommentAnchor(anchor)), anchor)
  assert.deepEqual(commentPoint(anchor, page), { x: 160, y: 250 })
  page.nodes.child.x += 10
  assert.deepEqual(commentPoint(anchor, page), { x: 170, y: 250 })
  delete page.nodes.child
  assert.equal(commentPoint(anchor, page), null)
})
test('legacy and malformed anchors do not become native location fields', () => {
  for (const value of ['old-label', 'native:%', 'native:{}', 'native:' + encodeURIComponent(JSON.stringify({ pageId: 'p', x: -1, y: 0 })), 'native:' + encodeURIComponent(JSON.stringify({ pageId: 'p', x: 0, y: 0, file: '/etc/passwd' }))]) assert.equal(decodeCommentAnchor(value), null)
})
test('pinning a point on a rotated mirrored nested node inverts every transform',()=>{
  const page=createPage('p'),group={...createNode('group','g'),x:130,y:210,rotation:35,flipX:true}
  page.nodes.g=group;page.nodes.t={...createNode('text','t'),parentId:'g',x:30,y:40,width:80,height:60,rotation:-20,flipY:true}
  const original={pageId:'p',nodeId:'t',x:.2,y:.7},point=commentPoint(original,page)!
  const restored=commentAnchorAtPoint(page,'t',point)
  assert.ok(Math.abs(restored.x-original.x)<1e-10);assert.ok(Math.abs(restored.y-original.y)<1e-10)
})
