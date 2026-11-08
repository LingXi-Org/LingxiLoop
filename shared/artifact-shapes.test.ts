import assert from 'node:assert/strict'
import test from 'node:test'
import { artifactShapeGeometry } from './artifact-shapes.js'
import {
  createDocument,
  createNode,
  createPage,
  validateArtifactDocument,
} from './artifact-document.js'
import { applyOperations, prepareBatch } from './artifact-operations.js'

test('non-square rounded rectangles and ellipses use document units without shrinking the fill', () => {
  assert.deepEqual(artifactShapeGeometry('rect', 180, 80, 12), {
    tag: 'rect',
    attributes: { x: 0, y: 0, width: 180, height: 80, rx: 12 },
  })
  assert.deepEqual(artifactShapeGeometry('ellipse', 180, 80), {
    tag: 'ellipse',
    attributes: { cx: 90, cy: 40, rx: 90, ry: 40 },
  })
})

test('directional arrows retain the upstream silhouette when their dimensions differ', () => {
  assert.deepEqual(artifactShapeGeometry('arrow-right', 200, 80), {
    tag: 'polygon',
    attributes: { points: '0,24 120,24 120,8 200,40 120,72 120,56 0,56' },
  })
  assert.deepEqual(artifactShapeGeometry('arrow-up', 80, 200), {
    tag: 'polygon',
    attributes: { points: '24,200 24,80 8,80 40,0 72,80 56,80 56,200' },
  })
})

test('new arrow directions save, reopen and undo through the existing operations', () => {
  const doc = createDocument('slides', 'shape-fixture'),
    page = createPage('page')
  doc.pages.page = page
  doc.pageOrder = ['page']
  for (const shape of ['arrow-right', 'arrow-left', 'arrow-up', 'arrow-down'] as const) {
    const node = { ...createNode('shape', shape), shape }
    const result = applyOperations(
      doc,
      prepareBatch(doc, [{ type: 'node.insert', pageId: 'page', node }], shape),
    )
    assert.equal(
      validateArtifactDocument(JSON.parse(JSON.stringify(result.document))).pages.page.nodes[shape]
        .shape,
      shape,
    )
    assert.deepEqual(
      applyOperations(
        result.document,
        prepareBatch(result.document, result.inverse, `undo-${shape}`),
      ).document.pages.page.nodes,
      {},
    )
  }
})
