import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryChips } from './memory-chips'

test('memory chips are read-only, wrap full summaries and respect theme and reduced motion', () => {
  assert.equal(renderToStaticMarkup(<MemoryChips chips={[]} />), '')
  const text = '偏好完整的中文解释。'.repeat(25)
  for (const fresh of [false, true]) {
    const html = renderToStaticMarkup(<MemoryChips fresh={fresh} chips={[{ id: 'one', text }, { id: 'two', text: '<script>alert(1)</script>' }]} />)
    assert.ok(html.includes(text))
    assert.match(html, /<ul.*<li/s)
    assert.match(html, /overflow-wrap:anywhere/)
    assert.match(html, /motion-safe:animate-in/)
    assert.match(html, /dark:/)
    assert.match(html, /&lt;script&gt;/)
    assert.doesNotMatch(html, /<button|onForget|删除|移除|truncate|<script>/)
    assert.ok(html.includes(fresh ? '已记住 2 条' : '记忆'))
  }
  const unavailable = renderToStaticMarkup(<MemoryChips fresh chips={[]} unavailable />)
  assert.match(unavailable, /aria-label="记忆已更新"/)
  assert.match(unavailable, /记忆已更新，摘要暂不可用/)
})
