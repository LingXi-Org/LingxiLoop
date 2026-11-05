import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document'
import { withEmbedPreviews } from './embed-preview-snapshot'

test('two pages with the same local node id retain different captures without modifying the document', async () => {
  const document = createDocument('slides', 'document')
  for (const id of ['first', 'second']) {
    const page = createPage(id), node = { ...createNode('embed', 'n1'), embed: { source: id, format: 'html' as const, sourceHash: 'a'.repeat(64) } }
    page.nodes.n1 = node; page.nodeOrder = ['n1']; document.pages[id] = page; document.pageOrder.push(id)
  }
  const result = await withEmbedPreviews(document, async ({ pageId }) => `data:image/png;base64,${pageId === 'first' ? 'YWJj' : 'ZGVm'}`)
  const first = result.pages.first.nodes.n1.embed!.previewAssetId!, second = result.pages.second.nodes.n1.embed!.previewAssetId!
  assert.notEqual(first, second)
  assert.equal(result.assets[first].url, 'data:image/png;base64,YWJj')
  assert.equal(result.assets[second].url, 'data:image/png;base64,ZGVm')
  assert.deepEqual(document.assets, {})
  assert.equal(document.pages.first.nodes.n1.embed!.previewAssetId, undefined)
})
