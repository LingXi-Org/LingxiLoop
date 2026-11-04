import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { create } from 'zustand'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import type { Conversation, Participant } from '@/types'

mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: { id: 'me' } })), useMe: () => 'me', getMeId: () => 'me', getActiveCompanyId: () => null } })
mock.module('@/features/chat/runtime/transport', { namedExports: { ChatTransport: class {}, chatTransport: {}, filterThreadMessages: (messages: unknown[]) => messages } })
mock.module('@/components/Avatar', { namedExports: { Avatar: ({ p, ringColor }: { p: Participant; ringColor: string }) => <span data-person={p.id} data-ring={ringColor} /> } })
mock.module('@/features/agents/state', { namedExports: { bootParticipants: () => {}, useParticipants: create(() => ({ byId: Object.fromEntries(['me', 'a', 'b', 'c', 'd'].map(id => [id, {
  id, kind: 'human', name: id, initial: id, avatarBg: 'transparent', status: 'avail',
} satisfies Participant])), loaded: true })) } })
const { ConversationAvatar, ConversationUnread, PinnedConversationContent } = await import('./ConversationList')

test('group portraits show two, three, then two plus the remaining count, excluding self', () => {
  for (const count of [2, 3, 4]) {
    const conversation = { kind: 'group', members: ['me', ...['a', 'b', 'c', 'd'].slice(0, count)] } as Conversation
    const $ = load(renderToStaticMarkup(<ConversationAvatar conversation={conversation} size={28} />))
    assert.equal($('[aria-label="2 位其他成员"]').length, count === 4 ? 1 : 0)
    assert.deepEqual($('[data-person]').map((_, element) => $(element).attr('data-person')).get(), count === 3 ? ['a', 'b', 'c'] : ['a', 'b'])
    assert.ok($('[data-person]').toArray().every(element => $(element).attr('data-ring') === 'transparent'))
    assert.equal($('[class~="ring-background"]').length, 0)
  }
})

test('pinned colors vary by conversation and remain stable across layouts and renders', () => {
  const colors = Array.from({ length: 9 }, (_, i) => {
    const conversation = { id: `fixture-${i}`, title: '会话', members: ['me', 'a'], unread: 0 } as Conversation
    const color = (mode: 'card' | 'tile') => load(renderToStaticMarkup(<PinnedConversationContent conversation={conversation} mode={mode} />))('span[aria-hidden]').first().attr('style')
    assert.equal(color('card'), color('tile'))
    assert.equal(color('card'), color('card'))
    return color('card')
  })
  assert.ok(new Set(colors).size >= 4)
  assert.ok(colors.every(color => color?.includes('background-color:#')))
})

test('unread caps its visible count but retains the actual count and muted state', () => {
  for (const [unread, muted, text, label] of [[0, false, '', undefined], [120, false, '99+', '120 条未读消息'], [4, true, '', '4 条未读消息，已静音']] as const) {
    const $ = load(renderToStaticMarkup(<ConversationUnread conversation={{ unread, muted } as Conversation} />))
    assert.equal($.text(), text)
    assert.equal($('[aria-label]').attr('aria-label'), label)
  }
})
