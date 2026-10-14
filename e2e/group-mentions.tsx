import { createContext, useContext, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime, fromThreadMessageLike, type ThreadMessageLike } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { NativeMessageContent } from '../src/features/chat/components/NativeMessageContent'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import { Button } from '../src/components/ui/button'
import type { Participant } from '../src/types'
import { ComposerTriggers } from '../src/features/chat/components/ComposerTriggers'
import { ComposerLexicalInput } from '../src/features/chat/components/ComposerLexicalInput'
import { useParticipants } from '../src/features/agents/state'
import { useConversations } from '../src/features/conversations/store'
import '../src/styles/globals.css'

const roster: Participant[] = [
  { id: 'sage', name: '明理', kind: 'agent', initial: '明', avatarBg: '#1084fe', status: 'avail' },
  { id: 'long-member', name: '陈同学与非常长的显示名字一起参与项目复核和协作', kind: 'human', initial: '陈', avatarBg: '#1084fe', status: 'avail' },
]
const Members = createContext(roster)
useParticipants.setState({ byId: Object.fromEntries(roster.map(member => [member.id, member])), loaded: true })
useConversations.setState({ list: [{ id: 'fixture', kind: 'group', title: '群聊中的普通艾特', members: roster.map(member => member.id),
  leaderId: 'sage', lastAt: '', lastAtIso: '', preview: '' }], loaded: true })
function Text() {
  const agent = useAuiState(state => state.message.role === 'assistant')
  return <MarkdownText agent={agent} mentionTargets={useContext(Members)} />
}
function Message() {
  const role = useAuiState(state => state.message.role)
  return <MessagePrimitive.Root className="mb-5 min-w-0 rounded-xl border p-4">
    <p className="mb-2 text-xs text-muted-foreground">{role === 'user' ? '同学' : '智能助教'}</p>
    <NativeMessageContent Text={Text} />
  </MessagePrimitive.Root>
}
function Preview() {
  const [complete, setComplete] = useState(false), [renamed, setRenamed] = useState(false)
  const [submitted, setSubmitted] = useState(''), insertMentionRef = useRef<() => void>(() => {})
  const members = roster.map(member => member.id === 'sage' && renamed ? { ...member, name: '新的明理' } : member)
  const messages: ThreadMessageLike[] = [
    { id: 'human', role: 'user', content: [{ type: 'text', text: '请＠　明理先查资料，再@\u00a0sage核对。@long-member@所有人\n\n`@sage` 和 [@sage](https://example.org) 不触发协作。\n\n> @sage 引用的旧消息' }] },
    { id: 'agent', role: 'assistant', status: { type: 'complete', reason: 'stop' },
      metadata: { custom: { runId: 'agent', harness: { ...createRunView('agent'), artifacts: [] } } },
      content: [{ type: 'text', text: '资料已就绪，@sage 请检查出处。@sage@long-member@all' }] },
    { id: 'stream', role: 'assistant', status: complete ? { type: 'complete', reason: 'stop' } : { type: 'running' },
      content: [{ type: 'text', text: complete ? '下一步请@sage 复核。' : '下一步请@sag' }] },
    { id: 'legacy', role: 'assistant', content: [{ type: 'data', name: 'handoff', data: { title: '历史协作记录', task: '查证出处', result: '已查证并保留证据。' } }] },
  ]
  const runtime = useExternalStoreRuntime({ messages: messages.map(message => fromThreadMessageLike(message, message.id!, { type: 'complete', reason: 'stop' })), isRunning: !complete,
    onNew: async message => { setSubmitted(message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('').trim()) } })
  return <main className="mx-auto max-w-3xl p-4">
    <h1 className="mb-3 text-lg">群聊中的普通艾特</h1>
    <div className="mb-4 flex flex-wrap gap-2"><Button onClick={() => setComplete(true)}>流式完成</Button><Button onClick={() => setRenamed(true)}>修改名字</Button></div>
    <Members.Provider value={members}><AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root><ThreadPrimitive.Viewport><ThreadPrimitive.Messages components={{ Message }} /></ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="rounded-xl border p-3">
          <ComposerTriggers conversationId="fixture" onOpenPoll={() => {}}>
            <ComposerLexicalInput conversationId="fixture" insertMentionRef={insertMentionRef} aria-label="提及编辑器" className="min-h-12 p-2" />
          </ComposerTriggers>
          <ComposerPrimitive.Send>发送提及</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
        <output aria-label="已提交正文">{submitted}</output>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider></Members.Provider>
  </main>
}
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
createRoot(document.getElementById('root')!).render(<Preview />)
