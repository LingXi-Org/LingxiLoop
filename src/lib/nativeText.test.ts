import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NativeMessage } from './nativeMessage'
import { nativeText } from './nativeMessage'

// Failure model: a process-only text copied from the answer would leak activity
// into the substantive answer; an explicit result or unknown legacy text must remain.
test('copy text includes answers and results, excludes explicit process, and retains unknown legacy text', () => {
  const part = (text: string, kind: string, purpose?: string) => ({ type: 'text', text,
    providerMetadata: { lingxiloop: { activity: { version: 1, id: text, label: text, kind, ...(purpose ? { purpose } : {}) } } } })
  const message = { content: [part('说明', 'commentary'), part('执行摘要', 'tool', 'process'),
    part('答复', 'answer'), part('结果', 'result', 'result'), { type: 'text', text: '旧正文' }] } as Pick<NativeMessage, 'content'>
  assert.equal(nativeText(message), '答复\n结果\n旧正文')
})

// Native v3 sources concatenate exact UTF-16 slices. Adding legacy separators
// corrupts copy text, citation positions and the native committed body hash.
test('v3 source text is copied byte-for-byte without separators; unrelated messages stay separate', () => {
  const part = (text: string, start: number, segmentId: string, messageId = 'answer:run:v1') => ({ type: 'text', text,
    providerMetadata: { lingxiloop: { activity: { version: 1, id: segmentId, label: '答复', kind: 'answer' },
      answerSegment: { version: 3, messageId, segmentId, partId: segmentId, start, end: start + text.length } } } })
  const a = '中文😀 ', b = '[依据](#cite-S1)', c = '\n\n最后一段。'
  const message = { content: [part(a, 0, 'a'),part(b, a.length, 'b'),part(c, a.length + b.length, 'c')] } as Pick<NativeMessage, 'content'>
  assert.equal(nativeText(message), a + b + c)
  assert.equal(nativeText({ content: [...message.content, part(a, 0, 'a', 'answer:other:v1')] } as Pick<NativeMessage, 'content'>), a + b + c + '\n' + a)
})
