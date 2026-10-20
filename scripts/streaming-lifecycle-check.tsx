// Test-only input controller; the renderer, part statuses and queue are real SDK code.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, useAuiState, type ThreadMessage, type TextMessagePartProps } from '@assistant-ui/react'
import { VisualizeText } from '../src/features/chat/visualize/VisualizeText'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import '../src/styles/globals.css'

type Input = { text: string; status: 'running' | 'complete' | 'cancelled' | 'error'; tool?: boolean; id?: string; partId?: string }
function Text() {
  const index = useAuiState(state => state.message.parts.indexOf(state.part))
  const status = useAuiState(state => state.part.status.type)
  const messageStatus = useAuiState(state => state.message.status?.type)
  return <section data-text-index={index} data-part-status={status} data-message-status={messageStatus}><MarkdownText agent /></section>
}
function OriginalText(part: TextMessagePartProps) { return <VisualizeText part={part} Text={Text} readOnly /> }
function Message() { return <MessagePrimitive.Parts components={{ Text: OriginalText }} /> }
function App() {
  const [input, setInput] = useState<Input>({ text: '准备', status: 'running' })
  useEffect(() => {
    const step = (event: Event) => setInput((event as CustomEvent<Input>).detail)
    window.addEventListener('streaming-lifecycle-step', step)
    return () => window.removeEventListener('streaming-lifecycle-step', step)
  }, [])
  const message: ThreadMessage = { id: input.id ?? 'same-message', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text: input.text, status: { type: 'running' },
      ...(input.partId ? { providerMetadata: { lingxiloop: { activity: { version: 1, id: input.partId, kind: 'answer', label: '答复' } } } } : {}) },
    ...(input.tool ? [{ type: 'tool-call' as const, toolCallId: 'following-tool', toolName: 'test', args: {}, argsText: '{}' }] : [])],
    status: input.status === 'running' ? { type: 'running' } : input.status === 'complete' ? { type: 'complete', reason: 'stop' }
      : { type: 'incomplete', reason: input.status },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: input.status === 'running', onNew: async () => {} })
  return <main data-original-part-id={input.partId} style={{ maxWidth: 900, margin: '24px auto' }}><AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Messages components={{ AssistantMessage: Message }} />
  </AssistantRuntimeProvider></main>
}
createRoot(document.getElementById('root')!).render(<App />)
