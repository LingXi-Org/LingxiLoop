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
  useParticipants.setState({ byId: { [value.agentId]: { id: value.agentId, kind: 'agent', name: '研究助手', initial: '助', avatarBg: 'transparent', status: 'avail' } } })
  useConversations.setState({ list: channels.includes(room) ? [{ id: room, title: '断线恢复验收', members: [value.userId, value.agentId] } as never] : [] })
  chatTransport.setWorkspaceChannels(channels)
}
select(identity, [room])
if (!['lost-reply', 'denied', 'manual'].includes(query.mode) && !query.mode?.startsWith('sse-') && !query.mode?.startsWith('runtime-')) rememberChatOutbox({ conversationId: room, clientMessageId: payload.id, payload, createdAt: payload.createdAt })
chatTransport.boot()
async function control(action: string,extra: Record<string,string> = {}) {
  const response = await fetch('/api/__recovery/control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action,...extra }) })
  if (!response.ok) throw new Error('Fixture control failed')
}
function App() {
  const [facts, setFacts] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch('/api/__recovery/facts').then(response => response.json()).then(remote => {
        const outbox = readChatOutbox(), state = useChatThreadStore.getState().conversations[room]
        setFacts({ ...remote, outbox: outbox.length, blocked: outbox.filter(entry => entry.blockedReason).length,
          outboxAttachments: outbox.flatMap(entry => entry.payload.attachments ?? []).length,
          attachmentCount: state?.messages.find(message => message.metadata.custom.clientMessageId === payload.id)?.attachments?.length ?? 0,
          activeRuns: Object.keys(state?.activeRuns ?? {}).length,
          localLifecycle: state?.messages.find(message => message.metadata.custom.runId === runId)?.metadata.custom.harness?.lifecycle ?? null })
      }).catch(() => {})
    }, 250)
    return () => clearInterval(timer)
  }, [])
  const act = (action: () => Promise<unknown>) => { void action().catch(() => setError('操作暂未完成。')) }
  return <main style={{ margin: '0 auto', height: '100vh', maxWidth: 1024, display: 'flex', flexDirection: 'column', gap: 12, padding: 20, fontFamily: 'system-ui' }}>
    <h1>断线恢复验收</h1>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
      <button onClick={() => {
        useAuth.getState().clear()
        useAuth.getState().setAuthenticated({ id: identity.userId, name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] }, identity.companyId)
        select(identity, [room]); chatTransport.boot()
      }}>快速退出并登录</button>
      <button onClick={() => act(() => control('interrupt'))}>中断运行连接</button>
      <button onClick={() => act(async () => { await control('finish'); await chatTransport.reloadConversation(room) })}>结束远端任务并恢复服务</button>
      {query.mode?.startsWith('runtime-') && <>
        <button onClick={() => act(() => chatTransport.reloadConversation(room))}>重新读取会话</button>
        <button onClick={() => act(async () => {
          const next = createNativeMessage({ id: `new-${crypto.randomUUID()}`,role: 'user',content: [{ type: 'text',text: '失败后的新消息。' }] })
          await chatTransport.send(room,'失败后的新消息。',null,null,next.id,next)
          await control('continue-runtime',{ messageId: next.id }); await chatTransport.reloadConversation(room)
        })}>发送新消息并完成任务</button>
      </>}
    </div>
    <pre id="facts" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.4 }}>{JSON.stringify(facts)}</pre>
    {error && <p role="alert">{error}</p>}
    <div style={{ minHeight: 0, flex: 1, border: '1px solid #ddd' }}><ConversationRuntimeProvider conversationId={room}>
      <ConversationThread conversationId={room} />
    </ConversationRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><App /></TooltipProvider>)
