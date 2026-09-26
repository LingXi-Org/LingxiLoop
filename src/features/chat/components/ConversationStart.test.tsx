import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConversationStart } from './ConversationStart'

test('conversation start shows the first message date and time in the local timezone', () => {
  const createdAt = new Date(2026, 8, 21, 9, 5)
  const html = renderToStaticMarkup(<ConversationStart createdAt={createdAt} />)
  assert.ok(html.includes(`<time dateTime="${createdAt.toISOString()}">2026/09/21 09:05</time>`))
  assert.ok(html.includes(' · 会话开始'))
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 2)
})

test('conversation start omits missing or invalid timestamps', () => {
  assert.equal(renderToStaticMarkup(<ConversationStart />), '')
  assert.equal(renderToStaticMarkup(<ConversationStart createdAt={new Date(Number.NaN)} />), '')
  assert.equal(renderToStaticMarkup(<ConversationStart createdAt={new Date(0)} />), '')
  assert.equal(renderToStaticMarkup(<ConversationStart createdAt={new Date()} timestampMissing />), '')
})
