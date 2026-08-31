import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfidenceMarker } from '@/components/confidence-marker'

test('ConfidenceMarker exposes the hovered grounded basis without layout movement', () => {
  const html = renderToStaticMarkup(createElement(ConfidenceMarker, {
    claims: [{ id: 'S1', text: '可引用片段', confidence: 'grounded', basis: '课程讲义' }],
    hoveredId: 'S1',
  }))

  assert.match(html, /data-slot="confidence-marker"/)
  assert.match(html, /aria-describedby=/)
  assert.match(html, /decoration-emerald-500\/50/)
  assert.match(html, /from a source · 课程讲义/)
  assert.match(html, /class="flex h-9 items-start"/)
})
