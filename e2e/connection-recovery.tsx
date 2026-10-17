import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationRuntimeProvider } from '../src/features/chat/runtime/runtime'
import { ConversationThread } from '../src/features/chat/components/ConversationThread'
import { chatTransport } from '../src/features/chat/runtime/transport'
import { useChatThreadStore } from '../src/features/chat/runtime/store'
import { readChatOutbox, rememberChatOutbox } from '../src/features/chat/runtime/outbox'
import { createNativeMessage } from '../src/lib/nativeMessage'
import { lingxiIm } from '../src/lib/im/wukong'
import { useAuth } from '../src/stores/auth'
import { useParticipants } from '../src/features/agents/state'
import { useConversations } from '../src/features/conversations/store'
import { setWorkspaceSession } from '../src/lib/workspaceSession'
import { TooltipProvider } from '../src/components/ui/tooltip'
import '../src/styles/globals.css'

const query = Object.fromEntries(new URLSearchParams(location.search))
const fixture = await fetch('/api/__recovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query) }).then(response => response.json())
const { identity, other, room, payload, runId } = fixture
function select(value: typeof identity, channels: string[]) {
  useAuth.setState({ activeCompanyId: value.companyId, user: { id: value.userId, name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] } })
  setWorkspaceSession({ companyId: value.companyId, projectId: value.projectId })
  chatTransport.setWorkspaceChannels(channels)
}
select(identity, [room])
useParticipants.setState({ byId: { [identity.agentId]: { id: identity.agentId, kind: 'agent', name: '研究助手', initial: '助', avatarBg: 'transparent', status: 'avail' } } })
useConversations.setState({ list: [{ id: room, title: '断线恢复验收', members: [identity.userId, identity.agentId] } as never] })
if (!['lost-reply', 'denied'].includes(query.mode) && !query.mode?.startsWith('sse-')) rememberChatOutbox({ conversationId: room, clientMessageId: payload.id, payload, createdAt: payload.createdAt })
chatTransport.boot()
async function control(action: string) {
  await fetch('/api/__recovery/control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
}
function App() {
  const [facts, setFacts] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch('/api/__recovery/facts').then(response => response.json()).then(remote => {
        const outbox = readChatOutbox(), state = useChatThreadStore.getState().conversations[room]
        setFacts({ ...remote, outbox: outbox.length, blocked: outbox.filter(entry => entry.blockedReason).length,
          attachmentCount: state?.messages.find(message => message.metadata.custom.clientMessageId === payload.id)?.attachments?.length ?? 0,
          activeRuns: Object.keys(state?.activeRuns ?? {}).length,
          localLifecycle: state?.messages.find(message => message.metadata.custom.runId === runId)?.metadata.custom.harness?.lifecycle ?? null })
      }).catch(() => {})
    }, 250)
    return () => clearInterval(timer)
  }, [])
  const act = (action: () => Promise<unknown>) => { void action().catch(() => setError('操作暂未完成。')) }
  return <main className="mx-auto flex h-screen max-w-5xl flex-col gap-3 p-5">
    <h1>断线恢复验收</h1>
    <div className="flex flex-wrap gap-3 [&>button]:rounded [&>button]:border [&>button]:p-2">
      <button onClick={() => act(async () => {
        await control('restore')
        if (query.wake === 'online' || !query.wake) window.dispatchEvent(new Event('online'))
        if (query.wake === 'im') await lingxiIm.connect()
      })}>恢复服务</button>
      <button onClick={() => act(() => chatTransport.send(room, '保留这条测试消息和附件。', null, null, payload.id, payload))}>发送测试消息</button>
      <button onClick={() => act(async () => {
        const next = createNativeMessage({ id: `new-${crypto.randomUUID()}`, role: 'user', content: [{ type: 'text', text: '失败后的新消息。' }] })
        await chatTransport.send(room, '失败后的新消息。', null, null, next.id, next)
      })}>发送新消息</button>
      <button onClick={() => act(() => chatTransport.retry(room, payload.id))}>手动重试</button>
      <button onClick={() => { select(other, []); select(identity, [room]) }}>快速切换身份</button>
      <button onClick={() => act(() => control('interrupt'))}>中断运行连接</button>
      <button onClick={() => act(() => control('finish'))}>结束远端任务并恢复服务</button>
    </div>
    <pre id="facts" className="whitespace-pre-wrap text-xs">{JSON.stringify(facts)}</pre>
    {error && <p role="alert">{error}</p>}
    <div className="min-h-0 flex-1 border"><ConversationRuntimeProvider conversationId={room}>
      <ConversationThread conversationId={room} />
    </ConversationRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><App /></TooltipProvider>)
