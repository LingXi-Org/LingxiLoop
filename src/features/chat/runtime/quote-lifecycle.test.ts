import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { AppendMessage } from '@assistant-ui/react'
import { userMessageSchema, type NativeMessage } from '@/lib/nativeMessage'
import type { ImEnvelope } from '@/lib/im/wukong'

// Exercise the production composer, outbox JSON persistence, converter and thread
// filter together. The selected source is intentionally outside loaded history.
test('explicit quotes retain their target and thread through first send, failed-send reload and retry', async () => {
  const storage = new Map<string, string>(), sent: NativeMessage[] = [], statusIds: string[] = []
  let failSend = true, sequence = 0, historyReads = 0
  const echo = (payload: NativeMessage): ImEnvelope => ({ channelId: 'room', channelType: 2, fromUid: 'human',
    clientMsgNo: payload.id, messageId: `im-${payload.id}`, messageSeq: ++sequence, timestamp: 1, payload })
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {}, on: () => () => {} } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction() {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: {} } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId: 'project' }) } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { disconnect() {}, setWorkspaceChannels() {},
    history: async () => { historyReads++; return [] },
    sendStatus: async (id: string) => { statusIds.push(id); return { status: 'missing' } },
    send: async (_conversationId: string, payload: NativeMessage) => {
      sent.push(payload)
      if (failSend) throw new Error('synthetic transport failure')
      return echo(payload)
    },
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: () => 1, clearTimeout() {}, localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  } })
  const { ChatTransport, filterThreadMessages } = await import('./transport')
  const { readChatOutbox } = await import('./outbox')
  const { updateConversation, useChatThreadStore } = await import('./store')
  const { convertEnvelope } = await import('./converter')
  const transport = new ChatTransport()
  const append = (quoteId?: string): AppendMessage => ({ parentId: null, sourceId: null, role: 'user', createdAt: new Date(0),
    content: [{ type: 'text', text: 'Use the source fact after character 240.' }], attachments: [],
    metadata: { custom: quoteId ? { quote: { messageId: quoteId, text: 'display preview only' } } : {} },
    runConfig: {},
  })
  try {
    await transport.sendAppend('room', { ...append('older-source'), attachments: [{ id: 'uploaded-notes', type: 'document',
      name: 'notes.txt', contentType: 'text/plain', status: { type: 'complete' },
      content: [{ type: 'file', data: 'uploaded-notes', sourceType: 'id', filename: 'notes.txt', mimeType: 'text/plain' }],
    }] }, 'thread-root')
    const original = sent[0]
    assert.equal(original.metadata.custom.replyToClientMsgNo, 'older-source')
    assert.equal(original.metadata.custom.threadRootClientMsgNo, 'thread-root')
    assert.equal(userMessageSchema.safeParse(original).success, true)
    assert.doesNotMatch(JSON.stringify(original), /display preview only/)
    assert.equal(useChatThreadStore.getState().conversations.room.messages[0].metadata.custom.delivery, 'failed')
    const persisted = readChatOutbox()[0]
    assert.deepEqual(persisted.payload, original)

    // A new transport has no in-memory composer/source message to consult.
    transport.disconnect()
    const restored = new ChatTransport()
    failSend = false
    await restored.retry('room', persisted.clientMessageId)
    assert.deepEqual(statusIds, [original.id])
    assert.deepEqual(sent[1], original)
    assert.equal(readChatOutbox().length, 0)
    const canonical = useChatThreadStore.getState().conversations.room.messages[0]
    assert.equal(canonical.metadata.custom.quotedMessageId, 'older-source')
    assert.equal(canonical.metadata.custom.threadRootId, 'thread-root')
    assert.deepEqual(filterThreadMessages([canonical], 'thread-root').map(message => message.id), [original.id])

    // History JSON replay retains both IDs even without the source history page.
    const history = convertEnvelope(JSON.parse(JSON.stringify(echo(original))), { participants: {}, meId: 'human' })
    assert.equal(history.metadata.custom.quotedMessageId, 'older-source')
    assert.equal(history.metadata.custom.threadRootId, 'thread-root')
    assert.deepEqual(history.metadata.custom.quote, { messageId: 'older-source', authorId: '', authorName: null, text: '', sequence: null })
    updateConversation('room', state => ({ ...state, loaded: true }))
    await restored.ensureThread('room', 'thread-root')
    assert.equal(historyReads, 0, 'an already loaded thread reply must not reload unrelated history')

    await restored.sendAppend('room', append(), 'thread-root')
    assert.equal(sent[2].metadata.custom.replyToClientMsgNo, 'thread-root')
    await restored.sendAppend('room', append('older-source'), null)
    assert.equal(sent[3].metadata.custom.replyToClientMsgNo, 'older-source')
    assert.equal(sent[3].metadata.custom.threadRootClientMsgNo, undefined)
    await restored.sendAppend('room', append(), null)
    assert.equal(sent[4].metadata.custom.replyToClientMsgNo, undefined)
    restored.disconnect()
  } finally {
    transport.disconnect()
    Reflect.deleteProperty(globalThis, 'window')
  }
})
