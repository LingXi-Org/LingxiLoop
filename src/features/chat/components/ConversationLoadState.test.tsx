import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ConversationLoadState } from './ConversationLoadState'

// Failure model: the library hides Empty while loading; an unrequested room
// flashes empty; error/retry disappears with messages; streaming uses history dots.
test('history, empty, error, and streaming have distinct accessible states', () => {
  const render = (props: Partial<Parameters<typeof ConversationLoadState>[0]>) => renderToStaticMarkup(createElement(ConversationLoadState, {
    loading: false, empty: true, running: false, error: null, onRetry() {}, ...props,
  }))
  assert.match(render({ loading: true }), /role="status"[\s\S]*正在加载对话消息/)
  assert.match(render({ loading: true }), /data-slot="skeleton"/)
  assert.doesNotMatch(render({ loading: true }), /开始一段新对话/)
  assert.match(render({}), /开始一段新对话/)
  assert.match(render({ error: '加载失败' }), /role="alert"[\s\S]*重试/)
  assert.match(render({ empty: false, error: '加载失败' }), /role="alert"/)
  assert.match(render({ empty: false, running: true }), /正在回复/)
  assert.match(render({ recovering: true }), /正在同步任务状态/)
  assert.doesNotMatch(render({ recovering: true }), /开始一段新对话/)
  assert.equal(render({ empty: false }), '')
})
