import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import '@/styles/globals.css'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { createNativeMessage, deserializeMessage, type NativeMessage } from '@/lib/nativeMessage'

if (!import.meta.env.DEV && import.meta.env.MODE !== 'interactive-test') throw new Error('This fixture requires the isolated test build')
const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const annotation = (id: string, kind: 'commentary' | 'tool' | 'answer' | 'attention', label: string) => ({ lingxiloop: { activity: { version: 1, id, kind, label } } })
function Message() { return <MessagePrimitive.Root><NativeMessageContent /></MessagePrimitive.Root> }
function Fixture() {
  const [mode, setMode] = useState('complete')
  const content: NativeMessage['content'] = [
    { type: 'text', text: '先核对题目的条件。\n\n```ts\nconst answer = 42\n```', providerMetadata: annotation('intro', 'commentary', '核对条件') },
    { type: 'reasoning', text: '公开解题说明：由 $a^2+b^2=c^2$ 计算边长。', providerMetadata: annotation('reason', 'commentary', '解题说明') },
    { type: 'generative-ui', spec: { root: { component: 'agent-plan', props: { title: '处理计划', steps: [{ id: 'read', label: '阅读题目' }, { id: 'solve', label: '解答问题' }], activeIndex: 1 } } }, providerMetadata: annotation('plan', 'commentary', '处理计划') },
    ...Array.from({ length: params.has('long') ? 300 : 2 }, (_, index) => `call-${index + 1}`).map((id, index) => ({ type: 'tool-call' as const, toolCallId: id, toolName: 'files.list', args: { fields: [] }, argsText: '',
      result: { status: 'completed', display: { title: `查看附件 ${index + 1}`, purpose: '检查本次请求已选择的附件。', summary: '已检查附件。' } },
      timing: { startedAt: 1000, completedAt: 1500 + index * 200 }, providerMetadata: annotation(id, 'tool', '查看附件') })),
    { type: 'text', text: '```mermaid\ngraph LR\n A[核对条件] --> B[计算结果]\n```', providerMetadata: annotation('diagram', 'commentary', '计算步骤') },
    ...(mode === 'complete' ? [] : [{ type: 'tool-call' as const, toolCallId: 'attention', toolName: 'documents.edit', args: {}, argsText: '',
      ...(mode === 'pending' ? { approval: { id: 'fixture-approval' } } : { isError: true, result: { status: 'failed' } }),
      providerMetadata: annotation('attention', 'attention', '需要处理') }]),
    { type: 'text', text: '最终答复始终可见。', providerMetadata: annotation('answer', 'answer', '答复') },
  ]
  const message = deserializeMessage(createNativeMessage({ id: 'fixture-run', role: 'assistant', content,
    status: mode === 'pending' ? { type: 'requires-action', reason: 'tool-calls' } : mode === 'failed' ? { type: 'incomplete', reason: 'error' } : { type: 'complete', reason: 'stop' },
    custom: { activityPresentation: { version: 1 }, harnessControl: false },
  }))
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: false, onNew: async () => {} })
  return <main className="mx-auto max-w-3xl space-y-4 p-4"><p>原生消息组件验收 · 合成数据</p>
    <nav className="flex gap-4">{[['complete', '完成'], ['pending', '等待确认'], ['failed', '失败']].map(([state, label]) => <button className="rounded border px-3 py-2 focus-visible:ring-2" type="button" key={state} onClick={() => setMode(state)}>{label}</button>)}</nav>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
