import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import * as officialAui from '@assistant-ui/react'
import { AssistantRuntimeProvider, ThreadPrimitive, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toast } from 'sonner'
import { create } from 'zustand'

type AuiState = Parameters<Parameters<typeof officialAui.useAuiState>[0]>[0]
let copySelectors: ((state: AuiState) => unknown)[] = []
let captureCopySelectors = false
mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: null })) } })
mock.module('@assistant-ui/react', { namedExports: { ...officialAui,
  useAuiState: function useObservedAuiState<T>(selector: (state: AuiState) => T): T {
    if (captureCopySelectors) copySelectors.push(selector)
    return officialAui.useAuiState(selector)
  },
} })
const { copyMessageText, MessageActions, useMessageCopyText } = await import('./MessageActions')

function observeCopy(message: ThreadMessage) {
  let result: ReturnType<typeof useMessageCopyText> | undefined
  copySelectors = []
  function CopyProbe() {
    captureCopySelectors = true
    try { result = useMessageCopyText({ current: null }) }
    finally { captureCopySelectors = false }
    return null
  }
  function Thread() {
    const runtime = useExternalStoreRuntime({ messages: [message], onNew: async () => {} })
    return <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages components={{ Message: CopyProbe }} />
    </AssistantRuntimeProvider>
  }
  renderToStaticMarkup(<Thread />)
  assert.ok(result)
  return { ...result, selectors: [...copySelectors] }
}

type AssistantMessage = Extract<ThreadMessage, { role: 'assistant' }>
function copyMessage(content: AssistantMessage['content']): AssistantMessage {
  return { id: 'answer', role: 'assistant', createdAt: new Date(0), content,
    status: { type: 'complete', reason: 'stop' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }
}

// These selectors read only the message scope; unrelated SDK scopes stay absent.
function copySnapshot(message: ThreadMessage): AuiState { return { message } as AuiState }

// The SDK evaluates selectors on every notification even when Object.is prevents
// a render. Exercise the actual registered selectors, not a second test reducer.
test('unrelated notifications do not scan unchanged copy content', () => {
  let scans = 0
  const content = new Proxy([{ type: 'text' as const, text: '完整历史正文' }], {
    get(target, key, receiver) {
      if (key === Symbol.iterator || key === 'find') scans++
      return Reflect.get(target, key, receiver)
    },
  })
  const message = copyMessage(content)
  const { rawText, getText, selectors } = observeCopy(message)
  assert.equal(rawText, '完整历史正文')
  assert.equal(getText(), rawText)
  assert.ok(selectors.length > 0)
  const initial = selectors.map(select => select(copySnapshot(message)))
  scans = 0
  for (let tick = 0; tick < 240; tick++) {
    const unrelated = { ...message, metadata: { ...message.metadata, custom: { timer: tick } } }
    selectors.forEach((select, index) => { assert.ok(Object.is(select(copySnapshot(unrelated)), initial[index])) })
  }
  assert.equal(scans, 0, 'unchanged content must not be walked in subscription selectors')
})

test('copy subscriptions retain ordered sources and update replacements and purpose metadata', () => {
  const segment = (text: string, start: number, id: string) => ({ type: 'text' as const, text,
    providerMetadata: { lingxiloop: {
      activity: { version: 1, id, kind: 'answer', label: '答复', purpose: 'result' },
      answerSegment: { version: 3, messageId: 'answer:run:v1', segmentId: id, partId: id, start, end: start + text.length },
    } } })
  const first = segment('中文😀 ', 0, 'first'), second = segment('后续正文', first.text.length, 'second')
  const original = copyMessage([first, second])
  const observed = observeCopy(original)
  assert.equal(observed.getText(), first.text + second.text)
  const initial = observed.selectors.map(select => select(copySnapshot(original)))
  const replacement = segment('修订正文', first.text.length, 'replacement')
  const process = { ...second, providerMetadata: { lingxiloop: { ...second.providerMetadata.lingxiloop,
    activity: { ...second.providerMetadata.lingxiloop.activity, purpose: 'process' },
  } } }
  for (const [content, expected] of [
    [[first, replacement], first.text + replacement.text],
    [[first, process], first.text],
    [[second, first], second.text + '\n' + first.text],
  ] as const) {
    const changed = copyMessage(content)
    assert.ok(observed.selectors.some((select, index) => !Object.is(select(copySnapshot(changed)), initial[index])))
    assert.equal(observeCopy(changed).getText(), expected)
  }
})

test('copy subscriptions see citation-only changes and keep run citation mode independent of content', () => {
  const text = { type: 'text' as const, text: '正文' }
  const claims = [{ id: 'claim', text: '正文', confidence: 'grounded', start: 0, end: 2 }]
  const original = copyMessage([text, { type: 'data', name: 'citation-claims', data: { claims } }])
  const observed = observeCopy(original)
  assert.deepEqual(observed.confidenceClaims, claims)
  const initial = observed.selectors.map(select => select(copySnapshot(original)))
  const changedClaims = [{ ...claims[0], id: 'replacement-claim' }]
  const changed = copyMessage([text, { type: 'data', name: 'citation-claims', data: { claims: changedClaims } }])
  assert.ok(observed.selectors.some((select, index) => !Object.is(select(copySnapshot(changed)), initial[index])))
  assert.deepEqual(observeCopy(changed).confidenceClaims, changedClaims)
  const withRun = { ...original, metadata: { ...original.metadata, custom: { runId: 'run' } } }
  assert.ok(observed.selectors.some((select, index) => !Object.is(select(copySnapshot(withRun)), initial[index])))
})

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
