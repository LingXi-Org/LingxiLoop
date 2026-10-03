import assert from 'node:assert/strict'
import test from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { getLingxiMessageMetadata, type LingxiMessageMetadata } from './model'
import {
  mergeCanonicalMessages,
  replacePollData,
  resetChatThreadStore,
  setConversationMessages,
  useChatThreadStore,
} from './store'

function message(id: string, sequence: number | null, delivery: LingxiMessageMetadata['delivery'] = 'sent'): ThreadMessage {
  const metadata: LingxiMessageMetadata = {
    schema: 'lingxiloop.thread-message.v2', conversationId: 'room', clientMessageId: id,
    sequence, senderId: 'me', senderName: 'Me', senderKind: 'human', senderAvatarUrl: null,
    isMine: true, delivery, messageKind: 'text', presentation: 'conversation', runId: null, quotedMessageId: null, quote: null,
    reactions: [], replyCount: 0, threadRootId: null, groupStart: true, groupEnd: true,
    continuedFromPrevious: false, continuedToNext: false, clusterChromeAt: null,
  }
  return { id, role: 'user', content: [{ type: 'text', text: id }], attachments: [], createdAt: new Date(sequence ?? 99), metadata: { custom: metadata } }
}

test('canonical merge replaces optimistic messages by client identity and preserves pagination order', () => {
  const optimistic = message('temp-1', null, 'sending')
  const committed = { ...message('server-1', 3), metadata: { custom: { ...getLingxiMessageMetadata(optimistic), sequence: 3, delivery: 'sent' as const } } } as ThreadMessage
  const merged = mergeCanonicalMessages([message('later', 4), optimistic], [message('older', 2), committed])
  assert.deepEqual(merged.map((item) => item.id), ['older', 'server-1', 'later'])
  assert.equal(merged.some((item) => item.id === 'temp-1'), false)
})

test('invalid receipts cannot replace a known send time and later valid receipts repair missing times', () => {
  const valid = { ...message('one', 1), createdAt: new Date('2026-09-26T10:00:00Z') }
  const missing = { ...valid, createdAt: new Date('2026-09-26T11:00:00Z'),
    metadata: { custom: { ...getLingxiMessageMetadata(valid), timestampMissing: true } } } as ThreadMessage
  for (const [before, after] of [[valid, missing], [missing, valid]]) {
    const [result] = mergeCanonicalMessages([before!], [after!])
    assert.equal(result!.createdAt.getTime(), valid.createdAt.getTime())
    assert.ok(!getLingxiMessageMetadata(result!).timestampMissing)
  }
})

test('poll events replace canonical assistant-ui form state without retaining a second payload model', () => {
  resetChatThreadStore()
  const initial = {
    ...message('poll-message', 5),
    role: 'assistant',
    content: [{ type: 'data', name: 'poll', data: { poll: { question: '旧标题', mode: 'single', options: [{ id: 'a',text: 'A' }] }, pollTallies: [], revision: 1 } }],
  } as ThreadMessage
  setConversationMessages('room', [initial], 'replace')
  replacePollData(
    'room',
    'poll-message',
    2,
    { question: '新标题', mode: 'multi', options: [{ id: 'a', text: '选项 A' }], closedAt: '2026-08-30T00:00:00Z' },
    [{ optionId: 'a', count: 3, voterIds: ['u1', 'u2', 'u3'] }],
  )
  const part = useChatThreadStore.getState().conversations.room?.messages[0]?.content[0]
  assert.deepEqual(part, { type: 'data', name: 'poll', data: {
    poll: { question: '新标题', mode: 'multi', options: [{ id: 'a',text: '选项 A' }], closedAt: '2026-08-30T00:00:00Z' },
    pollTallies: [{ optionId: 'a',count: 3,voterIds: ['u1','u2','u3'] }], revision: 2,
  } })
})
