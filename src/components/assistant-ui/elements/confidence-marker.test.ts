import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Streamdown } from 'streamdown'
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

test('ConfidenceMarker annotates the answer inline and previews evidence in a tiny native surface', () => {
  const html = renderToStaticMarkup(createElement(ConfidenceMarker, {
    claims: [{ id: 'S1', text: '', confidence: 'grounded', basis: '课程讲义 · 证据片段' }],
    hoveredId: 'S1',
    variant: 'inline',
  }, '发布日期是 10 月 4 日'))
  assert.match(html, /发布日期是 10 月 4 日/)
  assert.match(html, /decoration-emerald-500\/50/)
  assert.match(html, /<button type="button"/)
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /bg-emerald-500\/10/)
  const source = readFileSync(new URL('../../confidence-marker.tsx', import.meta.url), 'utf8')
  assert.match(source, /<PopoverContent/)
  assert.match(source, /whitespace-pre-wrap break-words/)
  assert.doesNotMatch(source, /line-clamp/)
})

test('Streamdown keeps the native confidence link inline in prose and Markdown lists', () => {
  const link = (rawProps: object) => {
    const props = rawProps as Record<string, unknown>
    const href = ((props.node as { properties?: Record<string, unknown> } | undefined)?.properties?.href)
    assert.equal(href, '#cite-S1')
    return createElement(ConfidenceMarker, {
      claims: [{ id: 'S1', text: '', confidence: 'grounded', basis: '课程讲义' }],
      hoveredId: '',
      variant: 'inline',
    }, props.children as ReactNode)
  }
  const html = renderToStaticMarkup(createElement(Streamdown, {
    mode: 'streaming',
    components: { a: link },
  }, '[发布日期是 10 月 4 日](#cite-S1)。'))
  assert.match(html, /<p><button type="button" data-slot="confidence-marker"[^>]*>发布日期是 10 月 4 日<\/button>。<\/p>/)
  assert.doesNotMatch(html, /cite-S1|<a/)

  const listHtml = renderToStaticMarkup(createElement(Streamdown, {
    mode: 'streaming',
    components: { a: link },
  }, '- [**图工程**属于系统设计](#cite-S1)。'))
  assert.match(listHtml, /<li[^>]*><button type="button" data-slot="confidence-marker"[^>]*><span[^>]*>图工程<\/span>属于系统设计<\/button>。<\/li>/)
  assert.doesNotMatch(listHtml, /<p><button type="button" data-slot="confidence-marker"/)
})
