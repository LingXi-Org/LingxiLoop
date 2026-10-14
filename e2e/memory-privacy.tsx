// Synthetic legacy history and live snapshots exercise the actual normalization and renderer.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, deserializeMessage } from '../src/lib/nativeMessage'
import { NativeMessageContent } from '../src/features/chat/components/NativeMessageContent'
import { Button } from '../src/components/ui/button'
import '../src/styles/globals.css'

function Message() {
  return <MessagePrimitive.Root className="p-4"><NativeMessageContent /></MessagePrimitive.Root>
}

function Preview() {
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') ?? 'history')
  const memory = { chips: [{ id: 'private', text: 'PRIVATE SUMMARY' }], calls: {}, revision: 1 }
  const tool = (toolName: string) => ({ type: 'tool-call' as const,toolCallId: toolName,toolName,args: { body: 'PRIVATE ARGUMENT' },argsText: '{}',result: 'PRIVATE RESULT' })
  const payload = createNativeMessage({ id: 'run-memory-fixture',role: 'assistant',custom: {
    activityPresentation: { version: 1 },runId: 'memory-fixture',harness: { ...createRunView('memory-fixture'),artifacts: [] },memory,
  },status: mode === 'stream' ? { type: 'running' } : { type: 'complete',reason: 'stop' },content: [
    { type: 'text',text: '答复正文保持可见。' },tool('memory.apply'),tool('memory__read'),
    { ...tool('memory.restore'),isError: true },{ ...tool('memory.forget'),approval: { id: 'old-approval' } },
    ...(mode === 'mixed' ? [{ type: 'tool-call' as const,toolCallId: 'other',toolName: 'documents.read',args: {},argsText: '{}',result: { status: 'completed' },providerMetadata: { lingxiloop: { activity: { version: 1,id: 'other',kind: 'tool',label: '阅读文档' } } } }] : []),
  ] })
  const message = deserializeMessage(JSON.parse(JSON.stringify(payload)))
  const runtime = useExternalStoreRuntime({ messages: [message],isRunning: mode === 'stream',onNew: async () => {} })
  return <main className="mx-auto flex h-dvh max-w-3xl flex-col p-4">
    <h1 className="mb-3 text-lg">消息隐私验收</h1>
    <div className="mb-4 flex gap-2">{['history','stream','mixed'].map(value => <Button key={value} onClick={() => {
      history.replaceState(null,'',`?mode=${value}`); setMode(value)
    }}>{value}</Button>)}</div>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="min-h-0 flex-1">
      <ThreadPrimitive.Viewport className="h-full overflow-y-auto rounded-xl border">
        <ThreadPrimitive.Messages components={{ Message }} />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
