import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import '@/styles/globals.css'
import 'katex/dist/katex.min.css'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { createNativeMessage, deserializeMessage, type NativeMessage } from '@/lib/nativeMessage'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { createRunView } from '@lyyzka/lingxios/ui'

if (!import.meta.env.DEV && import.meta.env.MODE !== 'interactive-test') throw new Error('This fixture requires the isolated test build')
const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const annotation = (id: string, kind: 'commentary' | 'tool' | 'answer' | 'attention', label: string) => ({ lingxiloop: { activity: { version: 1, id, kind, label } } })
if (params.has('captured')) harnessApi.activity = async () => {
  const response = await fetch('/artifacts/issue215-public/captured-final-activity.json')
  if (!response.ok) throw new Error('Owning Worker history fixture is unavailable')
  return response.json()
}
if (params.has('paged')) harnessApi.activity = async (_target, offset, attentionOnly) => {
  const total = attentionOnly ? 110 : 1100, end = Math.min(total, offset + 40)
  return { total, nextOffset: end < total ? end : null, message: createNativeMessage({ id: 'history-fixture', role: 'assistant',
    content: Array.from({ length: end - offset }, (_, index) => ({ type: 'tool-call', toolCallId: `page-${offset + index}`, toolName: 'files.list', args: {}, argsText: '',
      result: { status: attentionOnly ? 'failed' : 'completed' }, ...(attentionOnly ? { isError: true } : {}),
      providerMetadata: annotation(`page-${offset + index}`, attentionOnly ? 'attention' : 'tool', `活动 ${offset + index + 1}`) })),
    custom: { runId: 'fixture', activityPresentation: { version: 1 }, harnessControl: false } }) }
}
function Message() { return <MessagePrimitive.Root><NativeMessageContent /></MessagePrimitive.Root> }
function Fixture() {
  const [mode, setMode] = useState(params.get('mode') ?? 'complete')
  const [publicText, setPublicText] = useState('已经核对条件，接下来检查资料。')
  const [captured, setCaptured] = useState<NativeMessage | null>(null)
  useEffect(() => {
    if (!params.has('captured')) return
    void fetch('/artifacts/issue215-public/captured-final-message.json').then(response => response.json()).then(setCaptured)
  }, [])
  const content: NativeMessage['content'] = [
    { type: 'text', text: '先核对题目的条件。\n\n```ts\nconst answer = 42\n```', providerMetadata: annotation('intro', 'commentary', '核对条件') },
    { type: 'reasoning', text: '公开解题说明：由 $a^2+b^2=c^2$ 计算边长。', providerMetadata: annotation('reason', 'commentary', '解题说明') },
    { type: 'generative-ui', spec: { root: { component: 'agent-plan', props: { title: '处理计划', steps: [{ id: 'read', label: '阅读题目' }, { id: 'solve', label: '解答问题' }], activeIndex: 1 } } }, providerMetadata: annotation('plan', 'commentary', '处理计划') },
    ...Array.from({ length: params.has('long') ? 300 : 2 }, (_, index) => `call-${index + 1}`).map((id, index) => ({ type: 'tool-call' as const, toolCallId: id, toolName: 'files.list', args: { fields: [] }, argsText: '',
      result: { status: 'completed', display: { title: `查看附件 ${index + 1}`, purpose: '检查本次请求已选择的附件。', summary: '已检查附件。' } },
      timing: { startedAt: 1000, completedAt: 1500 + index * 200 }, providerMetadata: annotation(id, 'tool', '查看附件') })),
    { type: 'text', text: params.has('public') ? publicText : '```mermaid\ngraph LR\n A[核对条件] --> B[计算结果]\n```', providerMetadata: annotation('diagram', 'commentary', '计算步骤') },
    ...(mode === 'complete' ? [] : [{ type: 'tool-call' as const, toolCallId: 'attention', toolName: 'documents.edit', args: {}, argsText: '',
      ...(mode === 'pending' ? { approval: { id: 'fixture-approval' } } : { isError: true, result: { status: 'failed' } }),
      providerMetadata: annotation('attention', 'attention', '需要处理') }]),
    ...(mode === 'running' ? [] : [{ type: 'text' as const, text: '最终答复始终可见。', providerMetadata: annotation('answer', 'answer', '答复') }]),
  ]
  const catalog = ['visualize__read_reference', 'chat.history', 'task.read_evidence', 'catalog.discover', 'research__search', 'memory__list', 'documents.rename', 'knowledge__search'].map((toolName, index) => ({
    type: 'tool-call' as const, toolCallId: `known-${index}`, toolName, args: { fields: [] }, argsText: '',
    ...(mode === 'running' ? {} : { result: { status: mode === 'failed' ? 'failed' : mode === 'cancelled' ? 'cancelled' : mode === 'unknown' ? 'unknown' : 'completed',
      display: { title: '处理任务', purpose: '历史通用说明', summary: '合成执行记录。' },
      ...(toolName === 'memory__list' ? { memory: { chips: [{ id: 'public-example', text: '公开偏好示例', version: 1, change: 'existing' }] } } : {}),
      ...(toolName === 'research__search' ? { sources: [{ title: '公开资料示例', url: 'https://example.com/reference', snippet: '合成来源摘要' }] } : {}),
    }, ...(['failed', 'unknown'].includes(mode) ? { isError: true } : {}) }),
    providerMetadata: annotation(`known-${index}`, 'tool', '处理任务'),
  }))
  const message = deserializeMessage(captured ? { ...captured,metadata: { ...captured.metadata,custom: { ...captured.metadata.custom,
    senderId: 'fixture-agent',conversationId: 'fixture-room' } } } : createNativeMessage({ id: 'fixture-run', role: 'assistant', content: params.has('catalog') ? catalog : content,
    status: mode === 'running' ? { type: 'running' } : mode === 'cancelled' ? { type: 'incomplete', reason: 'cancelled' } : mode === 'pending' ? { type: 'requires-action', reason: 'tool-calls' } : mode === 'failed' ? { type: 'incomplete', reason: 'error' } : { type: 'complete', reason: 'stop' },
    custom: { activityPresentation: { version: 1 }, harnessControl: false,
      ...(params.has('paged') ? { runId: 'fixture', senderId: 'fixture-agent', conversationId: 'fixture-room', activityHistory: { total: 1100, attention: 110 },
        harness: { ...createRunView('fixture'),requestVersion: 1,fence: 1,lastSeq: mode === 'pending' ? 1 : 2,
          lifecycle: mode === 'failed' ? 'failed' : mode === 'cancelled' ? 'cancelled' : 'leased' } } : {}) },
  }))
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: mode === 'running', onNew: async () => {} })
  return <main className="mx-auto max-w-3xl space-y-4 p-4"><p>原生消息组件验收 · 合成数据</p>
    {captured && <p>真实 Worker 合成输出已加载</p>}
    {params.has('bench') && <button id="receive-public-fixture" type="button" onClick={() => {
      performance.clearMarks('activity-fixture-trigger'); performance.clearMarks('activity-fixture-receive')
      performance.mark('activity-fixture-trigger'); setMode('running')
      setTimeout(() => {
        performance.mark('activity-fixture-receive')
        setPublicText(`公开说明增量 ${performance.now().toFixed(3)}`)
      }, 25)
    }}>接收公开说明（合成短测）</button>}
    <output id="activity-fixture-measurements" />
    <nav className="flex flex-wrap gap-4">{[['running', '运行中'], ['cancelled', '取消'], ['unknown', '结果待核对'], ['complete', '完成'], ['pending', '等待确认'], ['failed', '失败']].map(([state, label]) => <button className="rounded border px-3 py-2 focus-visible:ring-2" type="button" key={state} onClick={() => setMode(state)}>{label}</button>)}</nav>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
