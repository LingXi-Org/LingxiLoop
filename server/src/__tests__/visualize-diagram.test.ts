import assert from 'node:assert/strict'
import test from 'node:test'
import { renderSequenceDiagram } from '../im/visualize-diagram.js'

const diagram = { kind: 'sequence', title: 'Process', nodes: [{ id: 'start', label: 'Start', detail: 'First input' }, { id: 'finish', label: 'Finish', detail: 'Actual result' }] }
test('sequence frames and adjacent connectors share document order and natural text layout', () => {
  const rendered = renderSequenceDiagram({ ...diagram, edges: [{ from: 'start', to: 'finish', label: 'Then' }] })
  assert.deepEqual(rendered.summary, { kind: 'sequence', nodeIds: ['start', 'finish'], edges: [{ from: 'start', to: 'finish', label: 'Then' }], layout: 'vertical-document-flow' })
  assert.ok(rendered.html.indexOf('First input') < rendered.html.indexOf('Then'))
  assert.ok(rendered.html.indexOf('Then') < rendered.html.indexOf('Actual result'))
  assert.match(rendered.html, /overflow-wrap:anywhere/)
  assert.match(rendered.html, /minmax\(0,1fr\)/)
  assert.doesNotMatch(rendered.html, /position:|height:|overflow:hidden|text-overflow|<script|<svg|https?:|href=/i)
  assert.equal((rendered.html.match(/class="lx-sequence-node"/g) ?? []).length, 2)
  assert.equal((rendered.html.match(/class="lx-sequence-connector"/g) ?? []).length, 1)
})
test('all labels remain inert complete text, including long words, Chinese and line breaks', () => {
  const attack = '</script><img src=x onerror="alert(1)">&\n长中文说明'
  const detail = '无空格'.repeat(200)
  const result = renderSequenceDiagram({ ...diagram, title: attack, nodes: [{ id: 'start', label: attack, detail }, diagram.nodes[1]], edges: [{ from: 'start', to: 'finish', label: attack }] })
  assert.match(result.html, /&lt;\/script&gt;/); assert.match(result.html, /&quot;/)
  assert.ok(result.html.includes(detail)); assert.match(result.html, /white-space:pre-wrap/)
  assert.doesNotMatch(result.html, /<img|<script|onerror="alert/i)
})
test('nonlinear, incomplete or ambiguous diagrams and model geometry are rejected', () => {
  for (const bad of [
    { ...diagram, nodes: [diagram.nodes[0], diagram.nodes[0]] }, { ...diagram, nodes: [diagram.nodes[0]] },
    { ...diagram, nodes: Array.from({ length: 13 }, (_, i) => ({ id: 'n' + i, label: 'N' })) },
    { ...diagram, edges: [] }, { ...diagram, edges: [{ from: 'finish', to: 'start' }] },
    { ...diagram, edges: [{ from: 'start', to: 'missing' }] }, { ...diagram, edges: [{ from: 'start', to: 'start' }] },
    { ...diagram, edges: [{ from: 'start', to: 'finish' }, { from: 'start', to: 'finish' }] },
    { ...diagram, nodes: [{ ...diagram.nodes[0], x: 0, width: 100 }, diagram.nodes[1]] },
    { ...diagram, nodes: [{ ...diagram.nodes[0], detail: 'a'.repeat(1601) }, diagram.nodes[1]] },
    { ...diagram, nodes: [{ id: ' ', label: 'empty' }, diagram.nodes[1]] }, { ...diagram, css: 'position:absolute' },
  ]) assert.throws(() => renderSequenceDiagram(bad))
})
test('default adjacent edges follow node order and cancellation stays cancellation', () => {
  const rendered = renderSequenceDiagram(diagram)
  assert.deepEqual(rendered.summary.edges, [{ from: 'start', to: 'finish' }])
  const controller = new AbortController(); controller.abort()
  assert.throws(() => renderSequenceDiagram(diagram, controller.signal), { name: 'AbortError' })
})

test('explicitly absent optional edge label is not escaped as non-text', () => {
  const result = renderSequenceDiagram({ ...diagram, edges: [{ from: 'start', to: 'finish', label: undefined }] })
  assert.doesNotMatch(result.html, /undefined/)
})
