// Isolation failure modes: unconfirmed state enables submission; saved answers disappear
// without paginated history; double clicks POST twice; failed receipts fake success;
// refresh resubmits; unavailable/foreign-owner forms remain editable; errors cannot retry.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { BusinessMessagePart } from '@/features/chat/components/BusinessMessagePart'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'
import { useAuth } from '@/stores/auth'
import { useChatThreadStore } from '@/features/chat/runtime/store'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { HarnessDetails } from '@/features/chat/components/HarnessDetails'
import type { LingxiMessageMetadata } from '@/features/chat/runtime/model'
import '@/styles/globals.css'

if (!import.meta.env.DEV && import.meta.env.MODE !== 'questionnaire-test') throw new Error('Isolated fixture only')
const mode = new URLSearchParams(location.search).get('mode') ?? 'waiting'
const key = `questionnaire-fixture:${mode}`
let posts = Number(sessionStorage.getItem(`${key}:posts`) ?? 0), reads = 0
let refresh = () => {}
useAuth.setState({ user: { id: 'fixture-human' } as NonNullable<ReturnType<typeof useAuth.getState>['user']>, activeCompanyId: 'fixture-company' })
const question = { title: '补充学习目标', interactionId: 'fixture-question', items: [{ name: 'goal', prompt: '学习目标', required: true, input: { label: '学习目标' } }] }
const native = mode.startsWith('native-')
const messages = [deserializeMessage(createNativeMessage(native ? { id: 'run-fixture', role: 'assistant',
  status: { type: 'requires-action', reason: 'tool-calls' },
  content: [{ type: 'tool-call', toolCallId: 'host:history', toolName: 'chat.history', args: {}, argsText: '', result: { status: 'completed' } },
    { type: 'tool-call', toolCallId: 'host:ask', toolName: 'chat.ask', args: {}, argsText: '', interrupt: { type: 'human', payload: { prompt: '请补充信息' } } }],
  custom: { conversationId: 'fixture-room', senderId: 'fixture-agent', runId: 'fixture', harnessControl: true,
    harness: { ...createRunView('fixture'), lifecycle: 'waiting', requestVersion: 1, goalOutcome: { status: 'awaiting_input', question: '请补充信息' }, artifacts: [] },
    ...(mode === 'native-bound' ? { questionnaireWait: { questionId: 'fixture-question', requestVersion: 1 } } : {}),
  },
} : { id: 'fixture-question', role: 'assistant', content: [{ type: 'data', name: 'questionnaire', data: question }],
  custom: { conversationId: 'fixture-room', delivery: 'sent' } }))]
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  if (!String(input).includes('/api/im/channels/fixture-room/questionnaires/fixture-question')) return originalFetch(input, init)
  if (init?.method === 'POST') {
    posts++; sessionStorage.setItem(`${key}:posts`, String(posts)); refresh()
    await new Promise(resolve => setTimeout(resolve, 200))
    if (mode === 'retry' && posts === 1) return Response.json({ error: '提交失败，请重试' }, { status: 503 })
    const answers = JSON.parse(String(init.body)).answers
    sessionStorage.setItem(key, JSON.stringify(answers))
    if (mode === 'lost-receipt' && posts === 1) throw new TypeError('Synthetic lost HTTP response after save')
    const payload = createNativeMessage({ id: 'fixture-reply', role: 'user', content: [{ type: 'text', text: '问卷回复' }],
      custom: { ...(mode === 'retry' ? { replyToClientMsgNo: 'original-thread-root' } : {}), questionnaireReply: { questionId: 'fixture-question', answers } } })
    return Response.json({ status: 'accepted', duplicate: false, echo: { messageId: '123', messageSeq: 2, clientMsgNo: payload.id,
      channelId: 'fixture-room', channelType: 2, fromUid: 'fixture-human', timestamp: Date.now() / 1000, payload } })
  }
  reads++; refresh()
  if (mode === 'loading') await new Promise(resolve => setTimeout(resolve, 2000))
  if (mode === 'load-error' && reads === 1) return Response.json({ error: '状态暂不可用' }, { status: 503 })
  if (mode === 'pending' && !sessionStorage.getItem(key)) return Response.json({ status: 'pending', readOnly: true, answers: { goal: '冻结的答案' } })
  const answers = mode === 'submitted' ? { goal: '服务器已保存的目标' } : JSON.parse(sessionStorage.getItem(key) ?? 'null')
  return Response.json(answers ? { status: 'submitted', readOnly: true, answers } : { status: mode === 'unavailable' ? 'unavailable' : 'waiting', readOnly: mode === 'unavailable' || mode === 'readonly' })
}
function Card() {
  const metadata = useAuiState(state => state.message.metadata.custom) as LingxiMessageMetadata
  return <MessagePrimitive.Root>{native ? <><NativeMessageContent /><HarnessDetails metadata={metadata} /></>
    : <BusinessMessagePart type="data" name="questionnaire" data={question} readOnly={false} />}</MessagePrimitive.Root>
}
function Fixture() {
  const [, update] = useState(0)
  const echoes = useChatThreadStore(state => state.conversations['fixture-room']?.messages.length ?? 0)
  refresh = () => update(value => value + 1)
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async () => {} })
  return <main className="mx-auto max-w-xl p-6"><p>问卷验收：合成状态接口，历史中没有答案消息</p><div data-posts={posts} data-reads={reads} data-echoes={echoes} />
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message: Card }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
