import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImEnvelope } from '@/lib/im/wukong'

test('immutable handoff snapshots reconcile into one stable timeline card', async () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    },
  })
  const { fromIm, mergeFetchedMessages } = await import('./messageProjection')
  const envelope = (sequence: number, status: 'working' | 'completed'): ImEnvelope => ({
    messageId: `wukong-${sequence}`,
    messageSeq: sequence,
    clientMsgNo: `handoff:h:${status}`,
    channelId: 'room',
    channelType: 2,
    fromUid: 'agent',
    timestamp: 1_788_000_000 + sequence,
    payload: {
      version: 1,
      kind: 'handoff',
      clientMsgNo: `handoff:h:${status}`,
      refs: { handoffId: 'h' },
      data: { id: 'h', fromAgentId: 'agent', toAgentId: 'agent-2', title: 'Task', status, sharedPaths: [], browserTargets: [] },
    },
  })
  const initial = fromIm(envelope(10, 'working'))
  const merged = mergeFetchedMessages([initial], [fromIm(envelope(20, 'completed'))])
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.id, 'handoff-h')
  assert.equal(merged[0]?.handoff?.status, 'completed')
  assert.equal(merged[0]?.sequence, 10)
})

test('projects a visit-window Teacher Briefing without changing its system transport kind', async () => {
  const { fromIm } = await import('./messageProjection')
  const projected = fromIm({
    messageId: 'message-briefing', messageSeq: 21, clientMsgNo: 'briefing-1', channelId: 'teacher-room', channelType: 2,
    fromUid: 'pulse', timestamp: 1_788_000_021,
    payload: {
      version: 1, kind: 'system', clientMsgNo: 'briefing-1', body: '有 3 项更新，1 项需要关注。',
      refs: { briefingId: 'briefing-1', attentionItemIds: ['attention-1'] },
      data: { type: 'teacher_briefing', windowStartSequence: 10, windowEndSequence: 20, statistics: { eventCount: 3, attentionCount: 1, 'CASE.DETECTED': 2 }, attentionItemIds: ['attention-1'] },
    },
  })
  assert.equal(projected.kind, 'system')
  assert.deepEqual(projected.teacherBriefing, {
    briefingId: 'briefing-1', windowStartSequence: 10, windowEndSequence: 20,
    statistics: { eventCount: 3, attentionCount: 1, 'CASE.DETECTED': 2 }, attentionItemIds: ['attention-1'],
  })
})
