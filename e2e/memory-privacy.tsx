// Synthetic receipts exercise the production renderer/API seam; native persistence and authorization have owning integration coverage.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, deserializeMessage } from '../src/lib/nativeMessage'
import { toolDisplay } from '../src/lib/runActivity'
import { NativeMessageContent } from '../src/features/chat/components/NativeMessageContent'
import { harnessApi } from '../src/features/chat/runtime/harness-api'
import { Button } from '../src/components/ui/button'
import '../src/styles/globals.css'

const facts = [ { id: 'preference', text: '偏好中文回答', version: 1, change: 'added' as const },
  { id: 'goal', text: '更新后的学习目标', version: 2, change: 'updated' as const },
  { id: 'existing', text: '已有的学习背景', version: 1, change: 'existing' as const } ]
if (new URLSearchParams(location.search).has('reset')) localStorage.removeItem('memory-fixture-forgotten')
harnessApi.memory = async (_target, ids) => ({ chips: facts.filter(chip => ids.includes(chip.id) && chip.id !== localStorage.getItem('memory-fixture-forgotten')) })
harnessApi.readApproval = async id => ({ id, summary: '允许忘记指定范围内的记忆？', status: 'PENDING', action: { action: 'memory.forget' } })
harnessApi.forgetMemory = async (_target, id) => {
  await new Promise(resolve => setTimeout(resolve, 250))
  if (new URLSearchParams(location.search).get('mode') === 'forget-error') throw new Error('fixture failure')
  localStorage.setItem('memory-fixture-forgotten', id)
  return { ok: true }
}

function Message() { return <MessagePrimitive.Root className="p-4"><NativeMessageContent /></MessagePrimitive.Root> }

function Preview() {
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') ?? 'history')
  const methods = ['list', 'read', 'search', 'apply', 'history', 'restore', 'forget', 'reflect', 'doctor']
  const payload = createNativeMessage({ id: 'run-memory-fixture', role: 'assistant', custom: {
    activityPresentation: { version: 1 }, runId: 'memory-fixture', harness: { ...createRunView('memory-fixture'), artifacts: [] },
    harnessControl: mode !== 'readonly', senderId: 'agent', conversationId: 'room',
  }, status: mode === 'stream' ? { type: 'running' } : mode === 'failure' ? { type: 'requires-action', reason: 'tool-calls' } : { type: 'complete', reason: 'stop' }, content: [
    { type: 'text', text: '答复正文保持可见。' },
    ...methods.map(method => {
      const toolName = `memory.${method}`, failed = mode === 'failure' && method === 'restore', pending = mode === 'failure' && method === 'forget'
      return { type: 'tool-call' as const, toolCallId: method, toolName, args: { body: 'PRIVATE ARGUMENT' }, argsText: '{}',
        ...(mode === 'stream' && method === 'doctor' ? {} : { result: { status: failed ? 'failed' : pending ? 'awaiting-approval' : 'completed',
          ...(method === 'apply' ? { memory: { chips: facts.slice(0, 2) } } : method === 'read' ? { memory: { chips: [facts[2]] } } : {}) } }),
        ...(failed ? { isError: true } : {}), ...(pending ? { approval: { id: 'pending' } } : {}),
        providerMetadata: { lingxiloop: { activity: { version: 1, id: method, kind: failed || pending ? 'attention' : 'tool', label: toolDisplay(toolName).title } } } }
    }),
    ...(mode === 'mixed' ? [{ type: 'tool-call' as const, toolCallId: 'other', toolName: 'documents.read', args: {}, argsText: '{}', result: { status: 'completed' }, providerMetadata: { lingxiloop: { activity: { version: 1, id: 'other', kind: 'tool', label: '阅读文档' } } } }] : []),
  ] })
  const message = deserializeMessage(JSON.parse(JSON.stringify(payload)))
  const second = deserializeMessage({...payload,id:'memory-fixture-b',metadata:{...payload.metadata,custom:{...payload.metadata.custom,
    runId:'memory-fixture-b',conversationId:'room-b',harness:{...createRunView('memory-fixture-b'),artifacts:[]}}}})
  const runtime = useExternalStoreRuntime({ messages: mode==='pair'?[message,second]:[message], isRunning: mode === 'stream', onNew: async () => {} })
  return <main className="mx-auto flex h-dvh max-w-3xl flex-col p-4">
    <h1 className="mb-3 text-lg">记忆活动验收</h1>
    <div className="mb-4 flex gap-2">{['history', 'stream', 'mixed'].map(value => <Button key={value} onClick={() => {
      history.replaceState(null, '', `?mode=${value}`); setMode(value)
    }}>{value}</Button>)}</div>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="min-h-0 flex-1">
      <ThreadPrimitive.Viewport className="h-full overflow-y-auto rounded-xl border">
        <ThreadPrimitive.Messages components={{ Message }} />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
