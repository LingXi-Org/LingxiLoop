// Failure cases: SDK transport fields leak into native messages; a run snapshot loops;
// malformed native content is accepted.
import { Component, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import WKSDK, { Message, Channel } from 'wukongimjssdk'
import { createRunView } from '@lyyzka/lingxios/ui'
import { LingxiImClient } from '../src/lib/im/wukong'
import { createNativeMessage } from '../src/lib/nativeMessage'
import { convertEnvelope } from '../src/features/chat/runtime/converter'
import { ConversationThread } from '../src/features/chat/components/ConversationThread'
import { useParticipants } from '../src/features/agents/state'
import { useAuth } from '../src/stores/auth'
import '../src/styles/globals.css'

const participants = { agent: { id: 'agent', kind: 'agent' as const, name: '研究助手', initial: '助', avatarBg: 'transparent', status: 'avail' as const } }
useParticipants.setState({ byId: participants })
useAuth.setState({ user: { id: 'me', name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] } })
const client = new LingxiImClient()
client.setWorkspaceChannels(['fixture'])
const result = { status: '运行中', checks: [] as string[], error: '' }
function report() { document.getElementById('result')!.textContent = JSON.stringify(result, null, 2) }
class Boundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  componentDidCatch(error: Error) { result.status = '失败'; result.error = error.message; report() }
  render() { return this.state.error ? <p role="alert">{this.state.error}</p> : this.props.children }
}
function App() {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async () => {}, convertMessage: message => message })
  useEffect(() => {
    const unsubscribe = client.subscribe(envelope => setMessages(current => [...current, convertEnvelope(envelope, { participants, meId: 'me' })]))
    function receive(payload: ReturnType<typeof createNativeMessage>, sender: string) {
      const message = new Message()
      message.channel = new Channel('fixture', 2); message.messageID = payload.id; message.clientMsgNo = payload.id
      message.messageSeq = 1; message.timestamp = 1790899200; message.fromUID = sender
      message.content = WKSDK.shared().getMessageContent(1001)
      message.content.decode(new TextEncoder().encode(JSON.stringify({ ...payload, type: 1001 })))
      WKSDK.shared().chatManager.notifyMessageListeners(message)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      receive(createNativeMessage({ id: 'hello', role: 'user', createdAt: '2026-10-02T00:00:00Z', content: [{ type: 'text', text: '你好' }] }), 'me')
      result.checks.push('真实 SDK 接收带 type=1001 的用户消息')
      const malformed = WKSDK.shared().getMessageContent(1001)
      let rejected = false
      try { malformed.decode(new TextEncoder().encode(JSON.stringify({ type: 1001, invalid: true }))); WKSDK.shared().chatManager.notifyMessageListeners(Object.assign(new Message(), { channel: new Channel('fixture', 2), content: malformed })) } catch { rejected = true }
      if (!rejected) throw new Error('未拒绝无效原生消息')
      result.checks.push('严格拒绝无效原生消息')
      receive(createNativeMessage({ id: 'run-recovery', role: 'assistant', createdAt: '2026-10-02T00:00:00Z', content: [{ type: 'text', text: '你好，我可以帮你学习。' }], status: { type: 'complete', reason: 'stop' }, custom: { runId: 'recovery', refs: { agentId: 'agent' }, controlPrincipalId: 'me', harness: { ...createRunView('recovery'), lifecycle: 'succeeded', goalOutcome: { status: 'satisfied', requestVersion: 1, verification: 'passed' }, artifacts: [] } } }), 'agent')
      timer = setTimeout(() => {
        if (result.status === '失败') return
        const text = document.getElementById('conversation')!.textContent ?? ''
        if (!text.includes('你好，我可以帮你学习。') || !text.includes('你好')) { result.status = '失败'; result.error = '消息未呈现' }
        else { result.status = '通过'; result.checks.push('用户消息与任务回复稳定呈现，无更新循环') }
        report()
      }, 1500)
    } catch (error) { result.status = '失败'; result.error = String(error); report() }
    return () => { unsubscribe(); if (timer) clearTimeout(timer) }
  }, [])
  return <AssistantRuntimeProvider runtime={runtime}><ConversationThread conversationId="fixture" readOnly /></AssistantRuntimeProvider>
}
document.getElementById('root')!.innerHTML = '<h1>聊天崩溃回归验收</h1><button id="export">导出结果</button><pre id="result"></pre><div id="conversation" style="height:75vh"></div>'
document.getElementById('export')!.onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'chat-recovery-result.json'; link.click(); URL.revokeObjectURL(url)
}
report()
createRoot(document.getElementById('conversation')!).render(<Boundary><App /></Boundary>)
