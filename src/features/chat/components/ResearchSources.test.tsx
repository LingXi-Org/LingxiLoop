import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RunEvent } from '@lyyzka/lingxios/ui'
import { harnessToolParts } from '../runtime/harness'
import { ResearchSources } from './ResearchSources'

// Failure cases: lost/replayed results, foreign runs, unsafe URLs, leaked query/full
// text, a finished run showing an eternal spinner, and empty-result noise.
const events: RunEvent[] = [
  { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started', visibility: 'user', data: { toolCallId: 'host:search', name: 'research.search' } },
  { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed', visibility: 'user', data: { toolCallId: 'host:search', result: {
    status: 'completed', value: { provider: '360搜索', query: 'private query', text: 'full source text', results: [
      { title: '中文资料', url: 'https://www.gov.cn/article', snippet: '检索摘要', source: '360搜索', text: 'full source text' },
      { title: '危险网址', url: 'javascript:alert(1)' }, { title: '有凭据', url: 'https://user:secret@example.com' },
    ] },
  } } },
]

test('a single safe search source uses LinkPreview after completion, replay and reload', () => {
  const running = harnessToolParts('run', events.slice(0, 1))
  assert.match(renderToStaticMarkup(<ResearchSources calls={running} lifecycle="leased" />), /正在搜索/)
  const completed = harnessToolParts('run', events.slice(1), running)
  assert.deepEqual(completed, harnessToolParts('run', [...events].reverse()))
  assert.deepEqual(completed, harnessToolParts('run', events, completed))
  assert.deepEqual(completed, harnessToolParts('run', [{ ...events[0], runId: 'other' }], completed))
  assert.doesNotMatch(JSON.stringify(completed), /private query|full source text|javascript:|user:secret/)
  const html = renderToStaticMarkup(<ResearchSources calls={completed} lifecycle="succeeded" />)
  assert.match(html, /data-slot="link-preview"/)
  assert.doesNotMatch(html, /data-slot="citation"/)
  assert.match(html, /中文资料/)
  assert.match(html, /gov.cn/)
  assert.match(html, /检索摘要/)
  assert.match(html, /href="https:\/\/www.gov.cn\/article"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /<img|正在搜索/)
  const another = events.map(event => ({ ...event, seq: event.seq + 2, data: { ...event.data, toolCallId: 'host:second' } }))
  const both = harnessToolParts('run', another, completed)
  assert.equal(both.length, 2)
  assert.equal(new Set([...renderToStaticMarkup(<ResearchSources calls={both} lifecycle="succeeded" />).matchAll(/data-tool-ui-id="([^"]+)"/g)].map(match => match[1])).size, 2)
})

test('multiple sources use Citation while a deduplicated single source uses LinkPreview', () => {
  const source = { title: '资料甲', url: 'https://www.gov.cn/a', snippet: '摘要甲' }
  for (const [results, slot, count] of [
    [[source, { title: '资料乙', url: 'https://www.gov.cn/b', snippet: '摘要乙' }], 'citation', 2],
    [[source, source], 'link-preview', 1],
  ] as const) {
    const calls = harnessToolParts('run', [events[0], { ...events[1], data: { toolCallId: 'host:search', result: { status: 'completed', value: { results } } } }])
    const html = renderToStaticMarkup(<ResearchSources calls={calls} lifecycle="succeeded" />)
    assert.equal([...html.matchAll(new RegExp(`data-slot="${slot}"`, 'g'))].length, count)
    assert.doesNotMatch(html, new RegExp(`data-slot="${slot === 'citation' ? 'link-preview' : 'citation'}"`))
    assert.match(html, /摘要甲/)
  }
})

test('empty results are silent while failures, malformed results and cancellation stay visible', () => {
  const complete = (result: unknown, isError = false) => harnessToolParts('run', [events[0], { ...events[1], data: { toolCallId: 'host:search', result, isError } }])
  const empty = complete({ status: 'completed', value: { results: [] } })
  assert.equal(renderToStaticMarkup(<ResearchSources calls={empty} lifecycle="succeeded" />), '')
  for (const calls of [complete({ status: 'failed', error: 'secret provider error' }, true), complete({ status: 'completed', value: {} })]) {
    const html = renderToStaticMarkup(<ResearchSources calls={calls} lifecycle="succeeded" />)
    assert.match(html, /搜索失败/)
    assert.doesNotMatch(html, /secret provider error/)
  }
  const running = harnessToolParts('run', events.slice(0, 1))
  assert.match(renderToStaticMarkup(<ResearchSources calls={running} lifecycle="cancelled" />), /搜索已取消/)
  assert.match(renderToStaticMarkup(<ResearchSources calls={running} lifecycle="failed" />), /搜索未完成/)
})

test('single-source images survive replay and select the with-image preview; invalid images keep the text card', () => {
  for (const image of ['https://so.360tres.com/photo.jpg', undefined, 'javascript:alert(1)', 'data:image/svg+xml,bad', 'https://user:secret@example.com/image.jpg']) {
    const source = { title: '图文资料', url: 'https://www.gov.cn/article', snippet: '摘要', image }
    const completed = { ...events[1], data: { toolCallId: 'host:search', result: { status: 'completed', value: { results: [source] } } } }
    const calls = harnessToolParts('run', [events[0], completed])
    assert.deepEqual(harnessToolParts('run', [events[0], completed], calls), calls)
    const html = renderToStaticMarkup(<ResearchSources calls={calls} lifecycle="succeeded" />)
    assert.match(html, /data-slot="link-preview"/)
    assert.match(html, /图文资料/)
    if (image === 'https://so.360tres.com/photo.jpg') {
      assert.match(html, /<img[^>]+src="https:\/\/so.360tres.com\/photo.jpg"/)
      assert.match(html, /aspect-video/)
      assert.match(html, /loading="lazy"/)
    } else assert.doesNotMatch(html, /<img|javascript:|user:secret|data:image/)
  }
})
