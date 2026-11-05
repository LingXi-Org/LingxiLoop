import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document.js'
import { projectNativeSnapshot } from './native-projection.js'

test('read-only legacy conversion retains all pages without writing immutable page state', () => {
  const document = createDocument('slides', 'readonly')
  for (const id of ['one', 'two']) {
    const page = createPage(id), node = createNode('text', 'text')
    node.text = id; page.nodes.text = node; page.nodeOrder = ['text']
    document.pages[id] = page; document.pageOrder.push(id)
  }
  const snapshot = { document, history: { version: 0, undo: null, redo: null }, pageVersions: {}, original: { version: 'legacy', files: {}, warnings: [] } }
  const projected = projectNativeSnapshot(snapshot, ['one'])
  assert.deepEqual(projected.loadedPageIds, ['one', 'two'])
  assert.equal(projected.document.pages.two.nodes.text.text, 'two')
  const stored = projectNativeSnapshot({ ...snapshot, pageVersions: { one: 'hash1', two: 'hash2' } }, ['one'])
  assert.deepEqual(stored.loadedPageIds, ['one'])
  assert.deepEqual(stored.document.pages.two.nodes, {})
  assert.equal(stored.document.pages.two.title, document.pages.two.title)
})
