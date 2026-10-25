import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNativeMessage } from '../im/message-types.js'
import type { ImMessageEnvelope } from '../im/messages-application.js'
import { resolveRequestReferences, requestTextWithReferences } from '../agent-runtime/request-references.js'

function message(id: string, text: string, custom: Record<string, unknown> = {}, role: 'user' | 'assistant' = 'user'): ImMessageEnvelope {
  return { messageId: `server-${id}`, clientMsgNo: id, messageSeq: 1, channelId: 'room', fromUid: role === 'user' ? 'human' : 'agent', timestamp: 1,
    payload: createNativeMessage({ id, role, content: [{ type: 'text', text }], custom }) }
}
function reader(records: ImMessageEnvelope[], calls: string[][] = []) {
  return async (ids: string[]) => { calls.push(ids); return records.filter(item => ids.includes(item.clientMsgNo) || ids.includes(item.messageId)) }
}

test('first quote and retry/regeneration recover full committed bodies and original request from stable IDs', async () => {
  const source = message('A', '前文'.repeat(300) + '唯一事实：蓝宝石447'), question = message('B', '请解释唯一事实', { replyToClientMsgNo: 'server-A' })
  const reply = message('C', '旧答复', { sourceRef: 'B', replyToClientMsgNo: 'thread-root' }, 'assistant')
  for (const current of [question, message('retry', '请重试这条消息', { replyToClientMsgNo: 'B', retryOfClientMsgNo: 'B' }),
    message('regenerate', '请重新生成这条回复', { replyToClientMsgNo: 'C', regenerateOfClientMsgNo: 'C', threadRootClientMsgNo: 'thread-root' })]) {
    const result = await resolveRequestReferences(current, reader([source, question, reply]))
    const input = requestTextWithReferences(current, result)
    assert.ok(input)
    assert.ok(input.includes('唯一事实：蓝宝石447'))
    assert.ok(input.includes('请解释唯一事实'))
    assert.ok(input.includes('human'))
    assert.ok(!input.includes('"clientMsgNo":"thread-root"'))
    if (current !== question) assert.equal(result.originalRequestId, 'B')
  }
})

test('unavailable and cross-channel references never substitute a preview or another conversation body', async () => {
  const current = message('B', '当前问题', { replyToClientMsgNo: 'A', quote: { text: '伪造预览' } })
  for (const records of [[], [{ ...message('A', '其他会话秘密'), channelId: 'other' }]]) {
    const result = await resolveRequestReferences(current, reader(records))
    const input = requestTextWithReferences(current, result)
    assert.ok(input)
    assert.match(input, /unavailable/)
    assert.ok(!input.includes('其他会话秘密') && !input.includes('伪造预览'))
    assert.equal(result.messages.length, 0)
  }
})

test('ordinary messages remain unchanged and quote lookups are bounded and cycle-safe', async () => {
  const calls: string[][] = [], plain = message('plain', '正常消息')
  assert.equal(requestTextWithReferences(plain, await resolveRequestReferences(plain, reader([], calls))), '正常消息')
  assert.equal(calls.length, 0)
  const chain = Array.from({ length: 20 }, (_, i) => message(String(i), `正文${i}`, { replyToClientMsgNo: String(i + 1) }))
  const result = await resolveRequestReferences(chain[0]!, reader(chain, calls))
  assert.ok(calls.length <= 8)
  assert.match(requestTextWithReferences(chain[0]!, result)!, /limit_reached/)
  const cyclic = message('cycle', '循环正文', { replyToClientMsgNo: 'cycle' })
  assert.match(requestTextWithReferences(cyclic, await resolveRequestReferences(cyclic, reader([cyclic])))!, /cycle/)
})

test('large authoritative references explicitly disclose truncation within the published ingress text limit', async () => {
  const source = message('A', '正文\\"\n'.repeat(50_000)), current = message('B', '请分析', { replyToClientMsgNo: 'A' })
  const input = requestTextWithReferences(current, await resolveRequestReferences(current, reader([source])))
  assert.ok(input)
  assert.ok(input.length <= 100_000)
  assert.match(input, /"truncated":true/)
  assert.match(input, /"textLength":/)
})

test('a committed assistant can recover its source from the product run binding when historical sourceRef is absent', async () => {
  const source = message('A', '原事实'), question = message('B', '原问题', { replyToClientMsgNo: 'A' })
  const reply = message('C', '原答复', { runId: 'run-C', replyToClientMsgNo: 'A' }, 'assistant')
  const current = message('regen', '重新生成', { replyToClientMsgNo: 'C', regenerateOfClientMsgNo: 'C' })
  const result = await resolveRequestReferences(current, reader([source, question, reply]), async target => target === reply ? 'B' : undefined)
  assert.equal(result.originalRequestId, 'B')
  assert.match(requestTextWithReferences(current, result)!, /原问题/)
})

test('a missing original task is unavailable, never inferred from the assistant thread root', async () => {
  const root = message('A', '线程根不是原问题'), reply = message('C', '原答复', { replyToClientMsgNo: 'A' }, 'assistant')
  const current = message('regen', '重新生成', { replyToClientMsgNo: 'C', regenerateOfClientMsgNo: 'C' })
  const result = await resolveRequestReferences(current, reader([root, reply]))
  assert.equal(result.originalRequestId, undefined)
  assert.match(requestTextWithReferences(current, result)!, /"relation":"original_request","status":"unavailable"/)
  assert.ok(!requestTextWithReferences(current, result)?.includes('线程根不是原问题'))
})
