// Local browser regression fixture; uses the production renderer and assistant runtime.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import '../src/styles/globals.css'

function Text() { return <MarkdownText agent inlineCitations /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function App() {
  const [value, setValue] = useState<{ text: string; done: boolean; cancelled?: boolean }>({ text: '准备', done: false })
  useEffect(() => {
    const step = (event: Event) => setValue((event as CustomEvent<typeof value>).detail)
    window.addEventListener('streaming-text-step', step)
    return () => window.removeEventListener('streaming-text-step', step)
  }, [])
  const messages: ThreadMessage[] = [{ id: 'stable-reply', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text: value.text }], status: value.cancelled ? { type: 'incomplete', reason: 'cancelled' }
      : value.done ? { type: 'complete', reason: 'stop' } : { type: 'running' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }]
  const runtime = useExternalStoreRuntime({ messages, isRunning: !value.done && !value.cancelled, onNew: async () => {} })
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
    <div id="body"><AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages components={{ AssistantMessage: Message, UserMessage: Message }} />
    </AssistantRuntimeProvider></div>
  </main>
}
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') ?? 'light'
createRoot(document.getElementById('root')!).render(<App />)
