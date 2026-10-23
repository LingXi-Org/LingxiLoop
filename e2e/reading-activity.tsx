import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import '@/styles/globals.css'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'

if (!import.meta.env.DEV) throw new Error('Isolated development fixture only')
const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const mode = params.get('mode') ?? 'ready'
const status = ['failed', 'cancelled', 'unknown'].includes(mode) ? mode : 'completed'
const attention = ['failed', 'cancelled', 'unknown', 'unavailable', 'approval'].includes(mode)
const annotation = (id: string, kind: 'tool' | 'answer' | 'attention') => ({ lingxiloop: { activity: { version: 1, id, kind, label: '阅读课程原文' } } })
const message = deserializeMessage(createNativeMessage({ id: 'reading-fixture', role: 'assistant',
  status: mode === 'approval' ? { type: 'requires-action', reason: 'tool-calls' } : { type: 'complete', reason: 'stop' },
  content: [
    { type: 'tool-call', toolCallId: 'reading-call', toolName: 'knowledge__read_source', args: { fields: [{ label: '资料', value: '合成公开手册' }] }, argsText: '',
      ...(mode === 'approval' ? { approval: { id: 'reading-approval' } } : { result: { status, sourceStatus: ['failed', 'cancelled', 'unknown'].includes(mode) ? 'ready' : mode,
        display: { title: '阅读课程原文', purpose: '核对当前请求已授权的课程资料。', summary: '公开记录摘要：已核对资料状态。' }, secretSourceText: 'PRIVATE_SOURCE_CANARY' },
        ...(mode === 'failed' ? { isError: true } : {}) }),
      providerMetadata: annotation('reading-call', attention ? 'attention' : 'tool') },
    { type: 'text', text: '有效正文与引用必须保留：[合成资料](https://example.com/reference)', providerMetadata: annotation('answer', 'answer') },
  ], custom: { activityPresentation: { version: 1 }, harnessControl: false },
}))
function Message() { return <MessagePrimitive.Root><NativeMessageContent /></MessagePrimitive.Root> }
function Fixture() {
  const runtime = useExternalStoreRuntime({ messages: [message], onNew: async () => {} })
  return <main className="mx-auto max-w-3xl p-4"><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message }} /></ThreadPrimitive.Root></AssistantRuntimeProvider></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
