import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import * as React from 'react'
import { createNativeMessage, userMessageSchema, type NativeMessage } from '@/lib/nativeMessage'

// Capture the real action handler without a browser: no quoted source message is
// loaded, so the durable IDs are the only available original-task relationship.
let custom: Record<string, unknown> = {}
const sends: Array<{ quote: string | null; payload: NativeMessage }> = []
mock.module('react', { namedExports: { ...React, useEffect() {}, useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, () => {}] } })
mock.module('@assistant-ui/react', { namedExports: {
  ActionBarMorePrimitive: { Root: 'div', Trigger: 'button', Content: 'div', Item: 'button' },
  ActionBarPrimitive: { Root: 'div', ExportMarkdown: 'div' }, MessagePrimitive: { Error: 'div' },
  useAui: () => ({}), useAuiState: (selector: (state: unknown) => unknown) => selector({
    message: { id: 'run-reply', metadata: { custom }, content: [{ type: 'text', text: 'answer' }], status: { type: 'complete' } },
    thread: { isRunning: false },
  }),
} })
mock.module('@/stores/conversationUi', { namedExports: { useConversationUi: () => () => {} } })
mock.module('@/features/conversations/store', { namedExports: { useConversations: () => false } })
mock.module('../runtime/transport', { namedExports: { chatTransport: {
  send: async (_room: string, _text: string, _attachment: null, quote: string | null, _id: string, payload: NativeMessage) => {
    sends.push({ quote, payload }); return true
  },
} } })
mock.module('./MessageActions', { namedExports: { copyMessageText() {}, useMessageCopyText: () => ({ rawText: 'answer', getText: () => 'answer' }) } })
const { AssistantMessageActions } = await import('./AssistantMessageActions')
function findRegenerate(value: React.ReactNode): (() => Promise<void>) | undefined {
  if (!React.isValidElement<Record<string, unknown>>(value)) return undefined
  if (value.props['aria-label'] === '重新生成回复') return value.props.onClick as () => Promise<void>
  for (const child of React.Children.toArray(value.props.children as React.ReactNode)) {
    const match = findRegenerate(child)
    if (match) return match
  }
}
test('cold failed-run retry explicitly targets the original request and preserves its thread', async () => {
  custom = { conversationId: 'room', senderId: 'agent', sequence: null, clientMessageId: 'run-reply',
    sourceRef: 'original-question', threadRootId: 'thread-root', reactions: [] }
  await findRegenerate(AssistantMessageActions())!()
  const { payload, quote } = sends.at(-1)!
  assert.equal(quote, 'original-question')
  assert.deepEqual(payload.metadata.custom, { replyToClientMsgNo: 'original-question', retryOfClientMsgNo: 'original-question',
    mentionedIds: ['agent'], threadRootClientMsgNo: 'thread-root' })
  assert.equal(userMessageSchema.safeParse(payload).success, true)
})
test('regeneration retains the stored reply branch target and original thread after history replay', async () => {
  custom = { conversationId: 'room', senderId: 'agent', sequence: 8, clientMessageId: 'stored-reply',
    sourceRef: 'original-question', threadRootId: 'regeneration-control', reactions: [],
    replyBranches: { rootId: 'original-reply', threadRootId: 'thread-root' } }
  await findRegenerate(AssistantMessageActions())!()
  assert.deepEqual(sends.at(-1)!.payload.metadata.custom, { replyToClientMsgNo: 'stored-reply',
    regenerateOfClientMsgNo: 'stored-reply', mentionedIds: ['agent'], threadRootClientMsgNo: 'thread-root' })
})
test('retry metadata rejects a mismatched target, mixed operation and missing agent', () => {
  for (const invalid of [
    { replyToClientMsgNo: 'other', retryOfClientMsgNo: 'original', mentionedIds: ['agent'] },
    { replyToClientMsgNo: 'original', retryOfClientMsgNo: 'original' },
    { replyToClientMsgNo: 'original', retryOfClientMsgNo: 'original', regenerateOfClientMsgNo: 'original', mentionedIds: ['agent'] },
  ]) {
    assert.equal(userMessageSchema.safeParse(createNativeMessage({ id: 'control', role: 'user',
      content: [{ type: 'text', text: 'retry' }], custom: invalid })).success, false)
  }
})
