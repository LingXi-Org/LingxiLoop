import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import type { Conversation } from '@/types'
import { PinnedConversations } from './PinnedConversations'

for (const count of [0, 1, 2, 3, 4, 5, 8, 9]) {
  test(`${count} pinned conversations fit the prescribed grid and retain access to overflow`, () => {
    const conversations = Array.from({ length: count }, (_, i) => ({ id: String(i), title: `会话 ${i}` }) as Conversation)
    const $ = load(renderToStaticMarkup(<PinnedConversations conversations={conversations}
      renderConversation={(conversation, mode) => <button type="button" data-conversation={conversation.id} data-mode={mode}>{conversation.title}</button>} />))
    const grid = $('[data-pinned-grid]')
    assert.equal(grid.length, count === 0 ? 0 : 1)
    if (!count) return
    assert.equal(grid.attr('data-pinned-grid'), count > 4 ? 'tile' : count > 2 ? 'compact' : 'card')
    assert.equal(grid.find('[data-conversation]').length, count > 8 ? 7 : count)
    assert.equal(grid.find('button[aria-label="查看全部置顶会话"]').length, count > 8 ? 1 : 0)
    if (count > 8) assert.match(grid.text(), /\+2/)
  })
}
