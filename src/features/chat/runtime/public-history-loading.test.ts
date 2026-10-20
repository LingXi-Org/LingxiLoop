import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '../../../lib/nativeMessage'
import type { ImEnvelope } from '@/lib/im/wukong'

// Written before the history consumer: loaded IM anchors, old stopped status,
// exactly-once hydration, and scope-generation cancellation (not recent scans).
test('initial, older and reload history discover only their loaded IM anchors', async () => {
  const calls: Array<{ sources: string[]; runs: string[] }> = [], reads: string[] = []
  let envelopes: ImEnvelope[] = []
  const envelope = (id: string, seq: number): ImEnvelope => ({ channelId: 'room',channelType: 2,fromUid: 'human',
    clientMsgNo: id,messageId: id,messageSeq: seq,timestamp: seq,payload: createNativeMessage({ id,role: 'user',content: [{ type: 'text',text: 'Source' }] }) })
  const old = { conversationId: 'room',agentId: 'agent',runId: 'old',status: 'cancelled',requestVersion: 1,fence: 1 }
  mock.module('@/api/core/realtime',{ namedExports: { ws: { connect: async () => {},on: () => () => {} } } })
  mock.module('@/features/agents/api',{ namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state',{ namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api',{ namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires',{ namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store',{ namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast',{ namedExports: { toastAction: () => {} } })
  mock.module('@/lib/workspaceSession',{ namedExports: { getWorkspaceSession: () => ({ companyId: 'company',projectId: 'project' }) } })
  mock.module('@/stores/auth',{ namedExports: { getMeId: () => 'human',getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/im/wukong',{ namedExports: { lingxiIm: { connect: async () => {},disconnect() {},subscribe: () => () => {},onConnected: () => () => {},
    setWorkspaceChannels() {},history: async () => envelopes } } })
  mock.module('./outbox',{ namedExports: { readChatOutbox: () => [],forgetChatOutbox() {},rememberChatOutbox() {} } })
  mock.module('./harness-api',{ namedExports: { harnessApi: { list: async () => [],
    history: async (_room: string, anchors: { sourceClientMsgNos: string[]; runIds: string[] }) => {
      calls.push({ sources: anchors.sourceClientMsgNos,runs: anchors.runIds })
      return anchors.sourceClientMsgNos.includes('old-source') ? [old] : []
    },
    read: async (target: typeof old) => { reads.push(target.runId); return { message: createNativeMessage({ id: 'run-old',role: 'assistant',createdAt: new Date(1000).toISOString(),
      content: [{ type: 'text',text: 'Published before cancellation.',providerMetadata: { lingxiloop: { activity: { version: 1,id: 'old-public',kind: 'commentary',label: '公开说明' } } } }],
      status: { type: 'incomplete',reason: 'cancelled' },custom: { runId: 'old',harness: { ...createRunView('old'),requestVersion: 1,fence: 1,lifecycle: 'cancelled',artifacts: [] } } }) } },
    subscribe: async () => { throw new Error('stopped history must not subscribe') },
  } } })
  Object.defineProperty(globalThis,'window',{ configurable: true,value: { setInterval: () => 1,setTimeout: () => 1,clearInterval() {},clearTimeout() {},addEventListener() {},removeEventListener() {} } })
  const { ChatTransport } = await import('./transport')
  const { useChatThreadStore,updateConversation } = await import('./store')
  const transport = new ChatTransport(); transport.boot(); transport.setWorkspaceChannels(['room'])
  try {
    envelopes = [envelope('recent-source',100)]
    await transport.loadConversation('room')
    assert.deepEqual(calls,[{ sources: ['recent-source'],runs: [] }],'history must query the loaded page, not just recent 20 runs')
    updateConversation('room',state => ({ ...state,hasMoreOlder: true }))
    envelopes = [envelope('old-source',1)]
    await transport.loadOlder('room')
    assert.deepEqual(calls.at(-1),{ sources: ['old-source'],runs: [] })
    const recovered = useChatThreadStore.getState().conversations.room.messages.filter(message => message.id === 'run-old')
    assert.equal(recovered.length,1); assert.deepEqual(recovered[0].status,{ type: 'incomplete',reason: 'cancelled' })
    assert.equal(recovered[0].content[0].type === 'text' && recovered[0].content[0].text,'Published before cancellation.')
    await transport.reloadConversation('room')
    assert.equal(useChatThreadStore.getState().conversations.room.messages.filter(message => message.id === 'run-old').length,1)
    assert.deepEqual(reads,['old','old'])
  } finally { transport.disconnect() }
})
