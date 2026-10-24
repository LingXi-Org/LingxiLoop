import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ComposerPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ComposerTriggers } from '@/features/chat/components/ComposerTriggers'
import { ComposerLexicalInput } from '@/features/chat/components/ComposerLexicalInput'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { useAuth } from '@/stores/auth'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from '@/features/chat/runtime/store'
import { chatLatency } from '@/features/chat/runtime/latency'
import { convertEnvelopeBatch } from '@/features/chat/runtime/converter'
import { messagesApi } from '@/features/chat/api'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { createNativeMessage } from '@/lib/nativeMessage'
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table'
import '@/styles/globals.css'

if (!import.meta.env.DEV) throw new Error('Synthetic development fixture only')
const theme = new URLSearchParams(location.search).get('theme') ?? 'light'
document.documentElement.classList.toggle('dark', theme === 'dark')
document.documentElement.dataset.theme = theme
useAuth.setState({ user: { id: 'me', name: '合成同学', email: 'synthetic@example.com', emailVerified: true, providers: [] }, activeCompanyId: 'synthetic-company' })
const participants = { agent: { id: 'agent', kind: 'agent' as const, name: '学习助手和需要完整显示的长中文名称', initial: '助', avatarBg: 'transparent', status: 'avail' as const } }
useParticipants.setState({ byId: participants, loaded: true })
useConversations.setState({ list: [{ id: 'visual-input', kind: 'group', title: '合成课堂', members: ['me', 'agent'] }] as never })
messagesApi.markRead = async () => ({ ok: true, latestSeq: 12 })
harnessApi.list = async () => []
const history = convertEnvelopeBatch(Array.from({ length: 12 }, (_, index) => ({ channelId: 'visual-input', channelType: 2, fromUid: index % 2 ? 'agent' : 'me',
  clientMsgNo: `history-${index}`, messageId: `history-${index}`, messageSeq: index + 1, timestamp: 1790899200 + index,
  payload: createNativeMessage({ id: `history-${index}`, role: index % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: `第${index + 1}步：${'保留自己的推导和学习阅读位置。'.repeat(7)}` }] }),
})), { participants, meId: 'me' })
useChatThreadStore.setState({ conversations: { 'visual-input': { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false, messages: history } } })
function App() {
  const [submitted, setSubmitted] = useState(0), [text, setText] = useState(''), [tail, setTail] = useState('初始正文')
  const insertMentionRef = useRef<() => void>(() => {})
  const [messages, setMessages] = useState(history)
  const runtime = useExternalStoreRuntime({ messages, onNew: async message => { setSubmitted(value => value + 1); setText(message.content.map(part => part.type === 'text' ? part.text : '').join('')) } })
  Object.assign(window, { visualInputRevise: () => {
    setMessages(current => current.map((message, index) => index === current.length - 1
      ? { ...message, content: message.content.map(part => part.type === 'text' ? { ...part, text: part.text.replace('有效首段', '修订首段') + '\n\n' + '新增解题说明。'.repeat(30) } : part) } : message))
  }, visualInputStream: async (replace = false) => {
    const run = 'synthetic-run'
    chatLatency.send(run); chatLatency.bind(run, run)
    const records: unknown[] = []
    const observer = new PerformanceObserver(list => { for (const item of list.getEntries()) if (item.name === 'lingxiloop.chat.latency') records.push((item as PerformanceMeasure).detail) })
    observer.observe({ entryTypes: ['measure'] })
    const answer = { ...history.at(-1)!, status: { type: 'running' as const },
      metadata: { ...history.at(-1)!.metadata, custom: { ...history.at(-1)!.metadata.custom, runId: run } },
      content: [{ type: 'text' as const, text: replace ? '修订后的有效首段。' : '有效首段：先解释已知条件。' }] }
    chatLatency.preview(run, 1, answer.content[0].text.length)
    setMessages([...history.slice(0, -1), answer])
    await new Promise(resolve => setTimeout(resolve, 120))
    const appended = { ...answer, content: [{ type: 'text' as const, text: `${answer.content[0].text}\n\n${'继续检查自己的推导。'.repeat(20)}` }] }
    chatLatency.preview(run, 2, appended.content[0].text.length)
    setMessages([...history.slice(0, -1), appended])
    await new Promise(resolve => setTimeout(resolve, 120))
    setMessages([...history.slice(0, -1), { ...appended, status: { type: 'complete' as const, reason: 'stop' as const } }])
    await new Promise(resolve => setTimeout(resolve, 120))
    chatLatency.completed(run)
    await new Promise(resolve => setTimeout(resolve, 0)); observer.disconnect(); return records
  } })
  return <TooltipProvider><main className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] gap-3 bg-background p-4 text-foreground">
    <div className="flex flex-wrap items-start gap-4"><section className="rounded-xl border bg-card p-3"><h1>合成课堂复核</h1><Table><TableBody><TableRow><TableCell>第1组</TableCell><TableCell>待教师确认</TableCell></TableRow></TableBody></Table></section>
      <button type="button" className="rounded-lg border bg-card p-3" onClick={() => setTail(value => `${value}\n\n${'正文增长后保持选中和阅读。'.repeat(15)}`)}>追加正文</button><p data-fixture-tail className="im-markdown im-markdown-agent max-w-md">{tail}</p></div>
    <AssistantRuntimeProvider runtime={runtime}><div className="min-h-0"><ConversationThread conversationId="visual-input" readOnly /></div>
      <ComposerPrimitive.Root className="chat-composer rounded-xl border bg-card p-3"><ComposerTriggers conversationId="visual-input" onOpenPoll={() => setText('已打开投票')}><ComposerLexicalInput conversationId="visual-input" insertMentionRef={insertMentionRef} aria-label="输入验收" className="min-h-12 p-2" /></ComposerTriggers><ComposerPrimitive.Send>发送</ComposerPrimitive.Send><output data-fixture-submitted={submitted}>{text}</output></ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
