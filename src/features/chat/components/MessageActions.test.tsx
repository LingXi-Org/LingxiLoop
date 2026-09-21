import assert from 'node:assert/strict'
import test from 'node:test'
import { AssistantRuntimeProvider, ThreadPrimitive, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toast } from 'sonner'
import { copyMessageText, MessageActions } from './MessageActions'

function ActionsThread({ isRunning }: { isRunning: boolean }) {
  const messages: ThreadMessage[] = [{ id: 'message', role: 'user', createdAt: new Date(0),
    content: [{ type: 'text', text: 'hello' }], attachments: [], status: { type: 'complete', reason: 'stop' },
    metadata: { custom: {} } }]
  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    onNew: async () => {},
  })
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Messages components={{ Message: () => <MessageActions isMine getText={() => 'hello'} /> }} />
  </AssistantRuntimeProvider>
}

test('hover actions only offer reply and copy, and disappear while the agent runs', () => {
  const idle = renderToStaticMarkup(<ActionsThread isRunning={false} />)
  assert.match(idle, /aria-label="回复"/)
  assert.match(idle, /aria-label="复制"/)
  assert.equal((idle.match(/<button /g) ?? []).length, 2)
  const running = renderToStaticMarkup(<ActionsThread isRunning />)
  assert.doesNotMatch(running, /role="toolbar"|<button /)
})

test('copy reports success only after the clipboard write succeeds', async (t) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  t.after(() => {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })
  const writeText = t.mock.fn(async (_text: string) => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  assert.equal(await copyMessageText('完整消息'), true)
  assert.deepEqual(writeText.mock.calls[0]?.arguments, ['完整消息'])

  const error = t.mock.method(toast, 'error', () => 0)
  writeText.mock.mockImplementation(async () => { throw new Error('clipboard denied') })
  assert.equal(await copyMessageText('完整消息'), false)
  assert.deepEqual(error.mock.calls[0]?.arguments, ['复制失败，请重试'])
})
