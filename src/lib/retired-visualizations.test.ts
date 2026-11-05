import assert from 'node:assert/strict'
import test from 'node:test'
import { retiredVisualizationRanges } from './retired-visualizations'

test('historical references are isolated without exposing internal paths', () => {
  const text = '前文 ::visualize{path="/private/old.html" title="含 } 标题"} 后文 visualize/private/other.html'
  assert.deepEqual(retiredVisualizationRanges(text).map(({ start, end }) => text.slice(start, end)), [
    '::visualize{path="/private/old.html" title="含 } 标题"}', 'visualize/private/other.html',
  ])
})

test('quoted source in inline and fenced code remains literal', () => {
  const text = '`::visualize{path="example"}`\n\n~~~html\n::visualize{path="example"}\n~~~\n\n普通正文'
  assert.deepEqual(retiredVisualizationRanges(text), [])
})

test('unfinished historical references cannot expose internal parameters', () => {
  assert.deepEqual(retiredVisualizationRanges('文字 ::visualize{path="/private'), [{ start: 3, end: 29 }])
})
