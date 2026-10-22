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
