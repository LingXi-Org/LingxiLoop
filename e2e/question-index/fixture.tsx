import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime/runtime'
import { convertEnvelopeBatch } from '@/features/chat/runtime/converter'
import { EMPTY_CONVERSATION_CHAT_STATE, mergeCanonicalMessages, updateConversation, useChatThreadStore } from '@/features/chat/runtime/store'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { messagesApi } from '@/features/chat/api'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { createNativeMessage } from '@/lib/nativeMessage'
import { lingxiIm, type ImEnvelope } from '@/lib/im/wukong'
import '@/styles/globals.css'

const parameters = new URLSearchParams(location.search)
const fullHistory = parameters.has('turns')
const turnCount = Math.max(1, Math.min(500, Number(parameters.get('turns')) || 60))

const participants = {
  me: { id: 'me', kind: 'human' as const, name: '测试用户', initial: '测', avatarBg: '#7257d9', status: 'avail' as const },
  agent: { id: 'agent', kind: 'agent' as const, name: '测试助手', initial: '助', avatarBg: '#0f766e', status: 'avail' as const },
}
useAuth.setState({ user: { id: 'me', name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] }, activeCompanyId: 'fixture' })
useParticipants.setState({ byId: participants, loaded: true })
useConversations.setState({ list: [{ id: 'questions', title: '历史提问', kind: 'direct', members: ['me', 'agent'] }, { id: 'other', title: '另一段对话', kind: 'direct', members: ['me', 'agent'] }] as never })
const envelope = (index: number, role: 'user' | 'assistant', room = 'questions'): ImEnvelope => {
  const id = `${role === 'user' ? 'q' : 'a'}-${index}`, attachmentOnly = role === 'user' && index === 23
  return { channelId: room, channelType: 2, fromUid: role === 'user' ? 'me' : 'agent', clientMsgNo: id, messageId: id,
    messageSeq: index * 2 - (role === 'user' ? 1 : 0), timestamp: 1790899200 + index * 60,
    payload: createNativeMessage({ id, role, createdAt: new Date((1790899200 + index * 60) * 1000).toISOString(),
      content: attachmentOnly ? [] : [{ type: 'text', text: role === 'user' ? `第${index}次提问：${index === 22 ? '这是需要截断的长问题。'.repeat(30) : '请解释这个概念。'}` : `第${index}次答复。\n\n${'这是一段用于验证阅读位置的回答。'.repeat(fullHistory ? 2 : 25)}` }],
      ...(attachmentOnly ? { attachments: [{ id: 'notes', type: 'document', name: '研究笔记.pdf', contentType: 'application/pdf', status: { type: 'complete' }, content: [{ type: 'file', data: 'notes', sourceType: 'id', mimeType: 'application/pdf', filename: '研究笔记.pdf' }] }] } : {}),
      ...(role === 'assistant' ? { status: { type: 'complete', reason: 'stop' } } : {}),
    }) }
}
const history = Array.from({ length: turnCount }, (_, i) => [envelope(i + 1, 'user'), envelope(i + 1, 'assistant')]).flat()
const convert = (rows: ImEnvelope[]) => convertEnvelopeBatch(rows, { participants, meId: 'me' })
useChatThreadStore.setState({ conversations: {
  questions: { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: !fullHistory, messages: convert(fullHistory ? history : history.slice(40)) },
  other: { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false, messages: convert([envelope(101, 'user', 'other'), envelope(101, 'assistant', 'other')]) },
} })
let failHistory = false
lingxiIm.history = async (_room, limit, before) => {
  await new Promise(resolve => setTimeout(resolve, 100))
  if (failHistory) { failHistory = false; throw new Error('Synthetic history failure') }
  return history.filter(row => !before || row.messageSeq < before).slice(-(limit ?? 80))
}
harnessApi.list = async () => []
messagesApi.markRead = async () => ({ ok: true, latestSeq: 122 })
window.addEventListener('question-index-step', ((event: CustomEvent<string>) => {
  if (event.detail === 'fail-history') { failHistory = true; return }
  if (event.detail === 'append') {
    updateConversation('questions', state => ({ ...state, messages: mergeCanonicalMessages(state.messages, convert([envelope(61, 'user'), envelope(61, 'assistant')])) }))
  } else if (event.detail === 'receipt') {
    updateConversation('questions', state => ({ ...state, messages: mergeCanonicalMessages(state.messages, convert([envelope(61, 'user')])) }))
  } else if (event.detail === 'math') {
    updateConversation('questions', state => ({ ...state, messages: state.messages.map(message =>
      message.metadata.custom.clientMessageId === 'a-60'
        ? { ...message, content: [{ type: 'text', text: '公式尺寸变化。\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$' }] } : message) }))
  } else if (event.detail === 'stream') {
    updateConversation('questions', state => ({ ...state, activeRuns: { stream: { id: 'stream', agentId: 'agent', messageId: 'a-60', lastSequence: null, state: 'running' } },
      messages: state.messages.map(message => message.metadata.custom.clientMessageId === 'a-60' && message.role === 'assistant'
        ? { ...message, status: { type: 'running' }, content: [{ type: 'text', text: '持续输出的新内容。\n\n'.repeat(150) }] } : message) }))
  }
}) as EventListener)

function App() {
  const [room, setRoom] = useState('questions')
  return <TooltipProvider><main className="flex h-dvh flex-col bg-background text-foreground">
    <header className="flex shrink-0 gap-4 border-b p-2"><button type="button" onClick={() => setRoom('questions')}>历史提问</button><button type="button" onClick={() => setRoom('other')}>另一段对话</button></header>
    <div className="min-h-0 flex-1"><ConversationRuntimeProvider key={room} conversationId={room}><ConversationThread conversationId={room} /></ConversationRuntimeProvider></div>
  </main></TooltipProvider>
}
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') ?? 'light'
document.documentElement.classList.toggle('dark', document.documentElement.dataset.theme === 'dark')
createRoot(document.getElementById('root')!).render(<App />)

window.addEventListener('chrome-perf-step', () => {
  updateConversation('questions', state => ({ ...state,
    activeRuns: { stream: { id:'stream',agentId:'agent',messageId:`a-${turnCount}`,lastSequence:null,state:'running' } },
    messages: state.messages.map(message => message.metadata.custom.clientMessageId === `a-${turnCount}` && message.role === 'assistant'
      ? { ...message, status: {type:'running'}, content:[{type:'text',text:message.content.flatMap(part=>part.type==='text'?[part.text]:[]).join('')+'新增一段实质正文。'}] } : message),
  }))
})
