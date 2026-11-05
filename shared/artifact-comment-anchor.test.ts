import assert from 'node:assert/strict'
import test from 'node:test'
import { createNode, createPage } from './artifact-document.js'
import { encodeCommentAnchor, decodeCommentAnchor, commentPoint } from './artifact-comment-anchor.js'
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
