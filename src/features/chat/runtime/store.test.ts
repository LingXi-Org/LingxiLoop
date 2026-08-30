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
    schema: 'lingxiloop.thread-message.v1', conversationId: 'room', clientMessageId: id,
    sequence, senderId: 'me', senderName: 'Me', senderKind: 'human', senderAvatarUrl: null,
    isMine: true, delivery, messageKind: 'text', runId: null, quotedMessageId: null, quote: null,
    reactions: [], receipts: [], replyCount: 0, threadRootId: null, groupStart: true, groupEnd: true,
    continuedFromPrevious: false, continuedToNext: false,
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

test('poll events replace canonical option-list state without retaining a second payload model', () => {
  resetChatThreadStore()
  const initial = {
    ...message('poll-message', 5),
    role: 'assistant',
    content: [{
      type: 'tool-call', toolCallId: 'poll:poll-message', toolName: 'option-list',
      args: { id: 'poll-poll-message', title: '旧标题', selectionMode: 'single', options: [{ id: 'a', label: 'A' }] },
      argsText: '{}',
    }],
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
  assert.equal(part?.type, 'tool-call')
  if (part?.type !== 'tool-call') return
  assert.deepEqual(part.args, {
    id: 'poll-poll-message',
    title: '新标题',
    selectionMode: 'multi',
    options: [{ id: 'a', label: '选项 A', description: '3 票' }],
    tallies: [{ optionId: 'a', count: 3, voterIds: ['u1', 'u2', 'u3'] }],
    closedAt: '2026-08-30T00:00:00Z',
    revision: 2,
  })
  assert.equal('poll' in (part.args as Record<string, unknown>), false)
})
