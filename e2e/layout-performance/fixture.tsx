// Public synthetic data, actual message/index/disclosure owners, no transport.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import { ConversationQuestionIndex } from '@/features/chat/components/ConversationQuestionIndex'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { RunActivity } from '@/components/assistant-ui/elements/run-activity'
import { TraceWaterfall } from '@/components/trace-waterfall/trace-waterfall'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { RunTrace } from '@/lib/runTrace'
import '@/styles/globals.css'

const frameHTML = '<!doctype html><html><body><p>Same synthetic source / version 1</p><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>'
function Text() {
  const text = useAuiState(state => state.part.type === 'text' ? state.part.text : '')
  const answer = useAuiState(state => state.message.id === 'answer')
  return <div>{answer && <iframe title="Retained PartFrame descendant" data-source-version="fixture:1" onLoad={event => { event.currentTarget.dataset.loaded = "true" }} srcDoc={frameHTML} sandbox="allow-scripts" />}<p className="whitespace-pre-wrap">{text}</p></div>
}
function Message() {
  const id = useAuiState(state => state.message.id)
  return <MessagePrimitive.Root data-msg-id={id} className="py-2"><NativeMessageContent Text={Text} /></MessagePrimitive.Root>
}
// Match ConversationThread's stable message-key boundary; upstream Messages
// defaults to index keys and is not the product's history-prepend renderer.
const components = { Message }
function Messages() {
  const messages = useAuiState(state => state.thread.messages)
  return messages.map((message, index) => <ThreadPrimitive.MessageByIndex key={message.id} index={index} components={components} />)
}
const question = (index: number): ThreadMessage => ({ id: `question-${index}`, role: 'user', createdAt: new Date(0), attachments: [],
  content: [{ type: 'text', text: `Question ${index}` }],
  metadata: { custom: { schema: 'lingxiloop.thread-message.v2', clientMessageId: `question-${index}` } },
}) as ThreadMessage
const baseQuestions = Array.from({ length: 256 }, (_, index) => question(index))
const trace: RunTrace = { version: 1, startedAt: Date.now(), timingBasis: 'execution', truncated: false, limitations: [], root: {
  id: 'fixture-run', name: 'Synthetic run', kind: 'agent', status: 'running', start: 0, end: null, durationMs: null,
  tokensIn: null, tokensOut: null, cost: null, costEstimated: false, children: [{ id: 'tool', name: 'Public read', kind: 'tool',
    workKind: 'tool', status: 'complete', start: 0, end: 100, durationMs: 100, tokensIn: null, tokensOut: null, cost: null, costEstimated: false, children: [] }],
} }
function Fixture() {
  const viewport = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [prepend, setPrepend] = useState(false)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const change = (event: Event) => {
      const value = (event as CustomEvent<number | 'prepend'>).detail
      if (value === 'prepend') setPrepend(true)
      else setStep(value)
    }
    window.addEventListener('layout-step', change)
    return () => window.removeEventListener('layout-step', change)
  }, [])
  const messages = useMemo(() => [...(prepend ? [question(-1)] : []), ...baseQuestions, {
    id: 'answer', role: 'assistant', createdAt: new Date(0), status: { type: 'running' },
    content: [{ type: 'text', text: `Complete synthetic body ${step}\n${'tail content\n'.repeat(step)}` }], metadata: { custom: {} },
  } as ThreadMessage], [step, prepend])
  const runtime = useExternalStoreRuntime({ messages, isRunning: true, onNew: async () => {} })
  return <TooltipProvider><main className="mx-auto max-w-4xl p-3" data-step={step}>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="flex gap-2" style={{ height: 384 }}>
      <ConversationQuestionIndex viewportRef={viewport} hasMoreOlder={false} isLoadingOlder={false} onLoadOlder={async () => false}
        onNavigate={id => viewport.current?.querySelector(`[data-msg-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })} />
      <div id="question-viewport" ref={viewport} className="min-w-0 flex-1 overflow-y-auto"><div><Messages /></div></div>
    </ThreadPrimitive.Root></AssistantRuntimeProvider>
    <section id="trace-surface"><RunActivity status="running" statusLabel="处理中" entries={[]} open={open} onOpenChange={setOpen} trace={<TraceWaterfall trace={trace} />} /></section>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
