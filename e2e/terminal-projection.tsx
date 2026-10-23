import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { ConversationMessage } from '@/features/chat/components/ConversationMessage'
import { convertEnvelope } from '@/features/chat/runtime/converter'
import { projectReplyBranches } from '@/features/chat/runtime/reply-branches'
import { mergeCanonicalMessages } from '@/features/chat/runtime/store'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { createNativeMessage } from '@/lib/nativeMessage'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/styles/globals.css'

if (!import.meta.env.DEV && import.meta.env.MODE !== 'interactive-test') throw new Error('This fixture requires the isolated test build')
const agent = { id: 'agent', kind: 'agent' as const, name: '合成助手', initial: '助', avatarBg: '', status: 'avail' as const }
useParticipants.setState({ byId: { agent } })
useConversations.setState({ list: [{ id: 'room', readOnly: false, members: ['human', 'agent'] }] as ReturnType<typeof useConversations.getState>['list'] })
function message(id: string, role: 'user' | 'assistant' | 'system', seq: number, text: string, custom: Record<string, unknown> = {}) {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: role === 'user' ? 'human' : 'agent',
    clientMsgNo: id, messageId: id, messageSeq: seq, timestamp: seq,
    payload: createNativeMessage({ id, role, createdAt: new Date(seq * 1000).toISOString(), content: text ? [{ type: 'text', text }] : [], custom }),
  }, { participants: { agent }, meId: 'human' })
}
const question = (id: string, seq: number) => message(`user-${id}`, 'user', seq, '二加二等于几？')
function run(id: string, seq: number, success = false) {
  return { ...message(`run-${id}`, 'assistant', seq, success ? '四是二加二的结果。' : '', {
    runId: id, sourceRef: `user-${id}`, refs: { agentId: 'agent' },
    ...(!success ? { terminalFeedback: { id: `feedback-${id}`, requestVersion: 1, status: 'failed', reason: 'model_unavailable', delivery: 'delivered' } } : {}),
    harness: { ...createRunView(id), lifecycle: success ? 'succeeded' : 'failed', requestVersion: 1, fence: 1, artifacts: [] },
  }), status: success ? { type: 'complete', reason: 'stop' } : { type: 'incomplete', reason: 'error' } } as ThreadMessage
}
const receipt = message('terminal-feedback-one', 'system', 3, '合成服务故障，已完成的操作会保留。',
  { runId: 'one', requestVersion: 1, terminalFeedbackId: 'feedback-one', terminalStatus: 'failed' })
const first = [question('one', 1), run('one', 2), receipt], next = [question('two', 4), run('two', 5, true)]
function Fixture() {
  const [canonical, setCanonical] = useState(() => [...first, ...(sessionStorage.getItem('issue-326-next') === '1' ? next : [])])
  const runtime = useExternalStoreRuntime({ messages: projectReplyBranches(canonical, {}), onNew: async () => {} })
  return <main className="mx-auto max-w-3xl space-y-4 p-4">
    <p>终态投影验收 · 合成数据</p>
    <nav className="flex gap-4">
      <button type="button" onClick={() => setCanonical(current => mergeCanonicalMessages(current, current))}>重放历史</button>
      <button type="button" onClick={() => { sessionStorage.setItem('issue-326-next', '1'); setCanonical(current => mergeCanonicalMessages(current, next)) }}>发送相同问题</button>
      <button type="button" onClick={() => setCanonical([receipt])}>仅显示终态回执</button>
    </nav>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message: ConversationMessage }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><Fixture /></TooltipProvider>)
