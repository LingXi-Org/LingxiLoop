import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { ConversationThread } from '../../src/features/chat/components/ConversationThread'
import { convertEnvelope } from '../../src/features/chat/runtime/converter'
import { useParticipants } from '../../src/features/agents/state'
import { useAuth } from '../../src/stores/auth'
import { createNativeMessage, deserializeMessage, serializeMessage } from '../../src/lib/nativeMessage'
import '../../src/styles/globals.css'

// Synthetic boundary evidence, deliberately independent of provider success.
const participants = Object.fromEntries([['trace', '溯源'], ['nova', '司南'], ['milo', '砺思']].map(([id, name]) =>
  [id, { id, name, kind: 'agent' as const, initial: name[0], avatarBg: '#abcdef', status: 'avail' as const }]))
useParticipants.setState({ byId: participants })
useAuth.setState({ user: { id: 'identity-user', name: '合成测试用户', email: 'identity@example.test', emailVerified: true, providers: [] } })
const fixtures = [
  { id: 'trace-intro', sender: 'trace', text: '我是溯源，负责错因诊断。' },
  { id: 'nova-plan', sender: 'nova', text: '我是司南，负责本节课的安排。' },
  { id: 'milo-practice', sender: 'milo', text: '我是砺思，负责解题陪练。' },
  { id: 'milo-wrong-body', sender: 'milo', text: '我（溯源）负责错因诊断。' },
]
const initial = fixtures.map((fixture, index) => convertEnvelope({ channelId: 'identity-fixture', channelType: 2,
  fromUid: fixture.sender, clientMsgNo: fixture.id, messageId: fixture.id, messageSeq: index + 1, timestamp: 1792828800,
  payload: createNativeMessage({ id: fixture.id, role: 'assistant', createdAt: '2026-10-24T08:00:00Z',
    content: [{ type: 'text', text: fixture.text }], status: { type: 'complete', reason: 'stop' } }),
}, { participants, meId: 'identity-user' }))

function App() {
  const [messages, setMessages] = useState(initial)
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async () => {} })
  return <main className="mx-auto grid h-dvh max-w-4xl grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
    <header><h1>身份边界合成验收</h1><p>末条故意使用错误自称，检查界面保留发送者与正文的区别。</p>
      <button type="button" onClick={() => setMessages(messages.map(message => deserializeMessage(serializeMessage(message))))}>回放持久消息</button></header>
    <AssistantRuntimeProvider runtime={runtime}><ConversationThread conversationId="identity-fixture" threadRootId="identity-root" readOnly /></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
