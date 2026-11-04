import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
mock.module('@/api/core/http', { namedExports: { http: () => { throw new Error('export must require a user click') } } })
const { ArchivedVisualizeReferences } = await import('./ArchivedVisualizeReferences')
const references = [{ path: '/work/diagram.html', title: '<script>alert(1)</script>', start: 0, end: 1, raw: 'reference' }]

test('historical cards are inert, escaped, and offer scoped export rather than a live guest', () => {
  const html = renderToStaticMarkup(<ArchivedVisualizeReferences references={references} conversationId="room" sourceMessageId="source" readOnly={false} />)
  assert.match(html, /交互功能已停用/)
  assert.match(html, /下载历史内容/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /\/work\/diagram.html/)
  assert.doesNotMatch(html, /<iframe|<script|srcdoc|follow.up|data-visualize-guest/)
  assert.match(html, /type="button"/)
})

test('read-only and not-yet-delivered references never expose an export action', () => {
  for (const props of [{ readOnly: true, conversationId: 'room', sourceMessageId: 'source' },
    { readOnly: false, conversationId: 'room' }, { readOnly: false, sourceMessageId: 'source' }]) {
    const html = renderToStaticMarkup(<ArchivedVisualizeReferences references={references} {...props} />)
    assert.match(html, /交互功能已停用/)
    assert.doesNotMatch(html, /<button/)
  }
})
