import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import type { Conversation } from '@/types'

mock.module('@/features/chat/runtime/store', { namedExports: { useChatThreadStore: (select: (state: { conversations: object }) => unknown) => select({ conversations: {} }) } })
mock.module('@/features/chat/runtime', { namedExports: { useConversationPresence: () => ({ typingAgentIds: [] }) } })
mock.module('@/features/agents/state', { namedExports: { useParticipants: (select: (state: { byId: object }) => unknown) => select({ byId: {} }) } })
mock.module('@/stores/auth', { namedExports: { useMe: () => 'me' } })
mock.module('@/features/conversations/store', { namedExports: { isMuted: (conversation: Conversation) => Boolean(conversation.muted) } })
mock.module('@/components/Avatar', { namedExports: { Avatar: () => null } })
const { ConversationListItemContent } = await import('./ConversationList')

test('title emphasis follows the actual pin value and retains semantic markers in selected/unread/long rows', () => {
  const conversation = { id: 'row', kind: 'group', title: '需要完整语义并继续正确截断的长中文课程会话标题'.repeat(3), members: [], preview: '原有消息预览', lastAt: '12:30' } as unknown as Conversation
  for (const selected of [false, true]) for (const unread of [0, 4]) for (const pinned of [true, false, true]) {
    const $ = load(renderToStaticMarkup(<ConversationListItemContent conversation={{ ...conversation, pinned, unread }} selected={selected} />))
    const title = $('[data-slot="item-title"]')
    assert.equal(title.text(), conversation.title)
    assert.equal(title.hasClass('font-semibold'), pinned)
    assert.equal(title.hasClass('font-medium'), !pinned)
    assert.ok(title.hasClass('truncate'))
    assert.equal($('[aria-label="已置顶"]').length, pinned ? 1 : 0)
    assert.match($.text(), /原有消息预览/)
  }
})

test('an unopened conversation exposes the authorized durable waiting summary without loading messages', () => {
  const conversation = { id: 'unopened', kind: 'group', title: '课程任务', members: [], leaderId: null, lastAtIso: '2026-10-24T12:30:00Z', preview: '已有消息', lastAt: '12:30',
    runSummary: { kind: 'waiting_input', actor: 'you', runId: 'run', requestVersion: 2, fence: 3 } } as Conversation
  const $ = load(renderToStaticMarkup(<ConversationListItemContent conversation={conversation} />))
  assert.equal($('[aria-label="任务状态：等你回答"]').length, 1)
  assert.match($.text(), /已有消息/)
})
