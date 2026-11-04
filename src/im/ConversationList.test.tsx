import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { create } from 'zustand'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import type { Conversation, Participant } from '@/types'

mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: { id: 'me' } })), useMe: () => 'me', getMeId: () => 'me', getActiveCompanyId: () => null } })
mock.module('@/features/chat/runtime/transport', { namedExports: { ChatTransport: class {}, chatTransport: {}, filterThreadMessages: (messages: unknown[]) => messages } })
const { useParticipants } = await import('@/features/agents/state')
const { ConversationAvatar, ConversationUnread } = await import('./ConversationList')
useParticipants.setState({ byId: Object.fromEntries(['me', 'a', 'b', 'c', 'd'].map(id => [id, {
  id, kind: 'human', name: id, initial: id, avatarBg: 'transparent', status: 'avail',
} satisfies Participant])), loaded: true })

test('group portraits show two, three, then two plus the remaining count, excluding self', () => {
  for (const count of [2, 3, 4]) {
    const conversation = { kind: 'group', members: ['me', ...['a', 'b', 'c', 'd'].slice(0, count)] } as Conversation
    const $ = load(renderToStaticMarkup(<ConversationAvatar conversation={conversation} size={28} />))
    assert.equal($('[aria-label="2 位其他成员"]').length, count === 4 ? 1 : 0)
    assert.equal($('img[alt="c"]').length, count === 3 ? 1 : 0)
    assert.equal($('img[alt="me"]').length, 0)
  }
})

test('unread caps its visible count but retains the actual count and muted state', () => {
  for (const [unread, muted, text, label] of [[0, false, '', undefined], [120, false, '99+', '120 条未读消息'], [4, true, '', '4 条未读消息，已静音']] as const) {
    const $ = load(renderToStaticMarkup(<ConversationUnread conversation={{ unread, muted } as Conversation} />))
    assert.equal($.text(), text)
    assert.equal($('[aria-label]').attr('aria-label'), label)
  }
})
