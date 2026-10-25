// Real product surfaces; only data, send/cancel and attachment boundaries are local.

import { AssistantRuntimeProvider, type AttachmentAdapter, type ThreadMessage, useAui, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useParticipants } from '@/features/agents/state'
import { ConversationComposer } from '@/features/chat/components/ConversationComposer'
import { convertEnvelopeBatch } from '@/features/chat/runtime/converter'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from '@/features/chat/runtime/store'
import { chatTransport } from '@/features/chat/runtime/transport'
import { conversationsApi } from '@/features/conversations/api'
import { ConversationsPane } from '@/features/conversations/components/ConversationsPane'
import { useConversations } from '@/features/conversations/store'
import type { ConversationRunSummary } from '@/lib/conversationRunSummary'
import { createNativeMessage } from '@/lib/nativeMessage'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Conversation, Participant } from '@/types'
import '@/styles/globals.css'
import './fixture.css'

const participants: Record<string, Participant> = {
  self: { id: 'self', name: '本地学生', kind: 'human', initial: '学', avatarBg: '#687d9b', status: 'avail' },
  agent: { id: 'agent', name: '公开助教', kind: 'agent', initial: '助', avatarBg: '', status: 'avail' },
}
const statuses = [null, 'processing', 'waiting_input', 'waiting_approval', 'completed', 'failed'] as const
const conversations: Conversation[] = Array.from({ length: 140 }, (_, index) => ({
  id: `layout-${index}`, kind: 'group',
  title: index === 139 ? '最后一条 synthetic conversation 139' : `公开会话 ${index} — ${'需要省略的中文课程讨论标题'.repeat(5)}`,
  preview: '本地公开示例：' + '讨论解题步骤与下一次练习。'.repeat(12),
  members: ['self', 'agent'], leaderId: null, lastAt: '09:41', lastAtIso: '2026-10-25T09:41:00Z',
  pinned: index < 2, muted: index === 1 || index === 3, unread: index === 0 ? 127 : index < 5 ? 3 : 0,
  runSummary: index < statuses.length && statuses[index] ? { kind: statuses[index]!, actor: 'you' } : null,
}))
useAuth.setState({ user: { id: 'self', name: '本地学生', email: 'fixture@example.invalid', emailVerified: true, providers: [] } })
useParticipants.setState({ byId: participants, loaded: true, refresh: async () => {} })
useConversations.setState({ list: conversations, loaded: true, loading: false, error: null, load: async () => {}, reload: async () => {} })
useApp.setState({ selectedConversationId: 'layout-0', navigationReady: false })
useChatThreadStore.setState({ conversations: Object.fromEntries(conversations.map(conversation => [conversation.id, { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false }])) })
conversationsApi.emitTyping = async () => ({ ok: true })

function updateFirst(kind: ConversationRunSummary['kind'] | null, typing = false) {
  useConversations.setState(state => ({ list: state.list.map((item, index) => index ? item : { ...item, lastAt: kind ? '星期日' : '09:41', runSummary: kind ? { kind, actor: 'you' } : null }) }))
  useChatThreadStore.setState(state => ({ conversations: { ...state.conversations, 'layout-0': { ...state.conversations['layout-0'], typingAgentIds: typing ? ['agent'] : [] } } }))
}
function setCancelable(conversationId: string, active: boolean) {
  const messages = active ? convertEnvelopeBatch([{
    channelId: conversationId, channelType: 2, fromUid: 'agent', clientMsgNo: 'run-fixture-run', messageId: 'run-fixture-run', messageSeq: 1, timestamp: 1792915200,
    payload: createNativeMessage({ id: 'run-fixture-run', role: 'assistant', content: [{ type: 'text', text: '公开演示运行' }], status: { type: 'running' },
      custom: { runId: 'fixture-run', refs: { agentId: 'agent' }, controlPrincipalId: 'self', harness: { ...createRunView('fixture-run'), lifecycle: 'leased', requestVersion: 1, fence: 1, artifacts: [] } } }),
  }], { participants, meId: 'self' }) : []
  useChatThreadStore.setState(state => ({ conversations: { ...state.conversations, [conversationId]: { ...state.conversations[conversationId], messages } } }))
}
chatTransport.cancel = async conversationId => {
  document.documentElement.dataset.cancelled = conversationId
  setCancelable(conversationId, false)
}
const attachments: AttachmentAdapter = {
  accept: '*',
  async *add({ file }) { yield { id: 'local-file', name: file.name, type: 'document', contentType: file.type, file, status: { type: 'requires-action', reason: 'composer-send' } } },
  async send(attachment) { return { ...attachment, status: { type: 'complete' }, content: [] } },
  async remove() {},
}
function Controls({ compact, setCompact, conversationId, setConversationId, remount }: {
  compact: boolean; setCompact(value: boolean): void; conversationId: string; setConversationId(value: string): void; remount(): void
}) {
  const aui = useAui()
  const draft = useAuiState(state => state.composer.text)
  return <>
    <nav aria-label="本地测试控制" className="fixture-controls">
      <button onClick={() => setCompact(!compact)} aria-label="切换密度">{compact ? 'compact' : 'normal'}</button>
      <button onClick={() => setConversationId(conversationId === 'layout-0' ? 'layout-1' : 'layout-0')}>切换会话</button>
      <button onClick={remount}>重新挂载</button>
      <button onClick={() => aui.composer().setQuote({ messageId: 'public-quote', text: '公开引用：先写下自己的推导。' })}>准备引用</button>
      <button onClick={() => setCancelable(conversationId, true)}>准备停止</button>
      <label>状态 <select aria-label="首项任务状态" onChange={event => updateFirst((event.target.value || null) as ConversationRunSummary['kind'] | null)}>
        {statuses.map(status => <option key={status ?? 'none'} value={status ?? ''}>{status ?? 'none'}</option>)}
      </select></label>
      <button onClick={() => updateFirst('processing', true)}>正在输入</button>
    </nav>
    <output data-fixture-draft hidden>{draft}</output>
    <output data-fixture-conversation hidden>{conversationId}</output>
  </>
}
function ComposerSurface() {
  const [compact, setCompact] = useState(false)
  const [conversationId, setConversationId] = useState('layout-0')
  const [mount, setMount] = useState(0)
  const runtime = useExternalStoreRuntime<ThreadMessage>({ messages: [], adapters: { attachments }, onNew: async message => {
    document.documentElement.dataset.sent = JSON.stringify({ text: message.content.filter(part => part.type === 'text').map(part => part.text).join(''), attachmentCount: message.attachments?.length ?? 0 })
    document.documentElement.dataset.sendCount = String(Number(document.documentElement.dataset.sendCount ?? 0) + 1)
  } })
  return <AssistantRuntimeProvider runtime={runtime}>
    <Controls compact={compact} setCompact={setCompact} conversationId={conversationId} setConversationId={setConversationId} remount={() => setMount(value => value + 1)} />
    <section className="fixture-composer" aria-label="真实输入框">
      <div className="fixture-message-space">仅使用公开文本与本地数据的真实输入框</div>
      <ConversationComposer key={mount} conversationId={conversationId} compact={compact} />
    </section>
  </AssistantRuntimeProvider>
}
function App() {
  return <TooltipProvider><main className="fixture-shell bg-background text-foreground">
    <div className="fixture-list" aria-label="真实虚拟会话列表"><ConversationsPane /></div>
    <div className="fixture-right"><ComposerSurface /></div>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
