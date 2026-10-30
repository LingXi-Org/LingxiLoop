import assert from 'node:assert/strict'
import { test, mock, before, after } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MessageResponseProps } from '../../components/ai-elements/message.js'

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
before(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'zh-CN' } } }))
after(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

mock.module('../../components/ai-elements/message.js', { namedExports: {
  MessageResponse: ({ children }: MessageResponseProps) => <p>{children}</p>,
} })
mock.module('./GenUiCard.js', { namedExports: { GenUiCard: () => <section data-testid="delivered-view" /> } })
const { GenUiMessageResponse } = await import('./GenUiMessageResponse.js')
const reference = '::visualize{"path":"/work/attention-flow.html"}'
const render = (props: Partial<MessageResponseProps & { completed: boolean; awaitingDelivery: boolean }> = {}) =>
  renderToStaticMarkup(<GenUiMessageResponse messageKey="answer" completed={false} {...props}>{props.children ?? reference}</GenUiMessageResponse>)

// A terminal partial reference must stop looking busy; only active generation
// and the complete-message handoff may show a loading skeleton.
test('streaming references reserve a responsive, accessible skeleton', () => {
  const html = render({ streaming: true })
  assert.match(html, /data-gen-ui-loading/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /role="status"/)
  assert.match(html, /class="sr-only"/)
  assert.match(html, /motion-reduce:animate-none/)
  assert.match(html, /w-full min-w-0/)
  assert.match(html, /sm:h-40/)
  assert.doesNotMatch(html, /delivered-view|::visualize/)
})

test('only a completed reference waiting for delivery shows the handoff skeleton', () => {
  assert.match(render({ completed: true, awaitingDelivery: true }), /data-gen-ui-loading/)
  const ready = render({ completed: true, workspacePath: 'project', sessionId: 'room', sourceMessageId: 'sent' })
  assert.match(ready, /delivered-view/)
  assert.doesNotMatch(ready, /data-gen-ui-loading|aria-busy="true"/)
})

test('stopped generation and malformed completed references remain truthful terminal states', () => {
  for (const children of [reference, '::visualize{"path":']) {
    const stopped = render({ children, streaming: false, completed: false })
    assert.doesNotMatch(stopped, /data-gen-ui-loading|aria-busy="true"/)
    assert.match(stopped, /本次回复未完成/)
  }
  const invalid = render({ completed: true, children: '::visualize{"path":"relative.html"}' })
  assert.match(invalid, /交互视图引用无效/)
  assert.doesNotMatch(invalid, /data-gen-ui-loading/)
})
