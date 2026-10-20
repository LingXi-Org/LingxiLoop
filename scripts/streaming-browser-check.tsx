// Local browser regression fixture; uses the production renderer and assistant runtime.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import { StreamingText as OfficialStreamingText } from '../third_party/assistant-ui/streaming-text/upstream/elements/streaming-text'
import '../src/styles/globals.css'
import type { Participant } from '../src/types'

const mentionTargets: Participant[] = [{ id: 'fixture-colleague', kind: 'human', name: '同事', initial: '同', avatarBg: '#888', status: 'avail' }]
function Text() { return <MarkdownText agent inlineCitations mentionTargets={mentionTargets} /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
const params = new URLSearchParams(location.search)
function App() {
  const [value, setValue] = useState<{ text: string; done: boolean; cancelled?: boolean; failed?: boolean; id?: string }>({
    text: params.get('history') ? '历史正文 **保持 Markdown**，不重新播放。' : '准备', done: params.has('history'),
  })
  useEffect(() => {
    const step = (event: Event) => setValue((event as CustomEvent<typeof value>).detail)
    window.addEventListener('streaming-text-step', step)
    return () => window.removeEventListener('streaming-text-step', step)
  }, [])
  const messages: ThreadMessage[] = [{ id: value.id ?? 'stable-reply', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text: value.text }], status: value.cancelled || value.failed ? { type: 'incomplete', reason: value.failed ? 'error' : 'cancelled' }
      : value.done ? { type: 'complete', reason: 'stop' } : { type: 'running' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }]
  const streaming = !value.done && !value.cancelled && !value.failed
  const runtime = useExternalStoreRuntime({ messages, isRunning: streaming, onNew: async () => {} })
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
    {params.has('reference') && <section id="official"><h2>Official source · 736c07f5</h2>
      <OfficialStreamingText segments={[{ text: value.text }]} count={value.text.split(' ').length} streaming={streaming} />
      <h2>LingxiLoop · MarkdownText</h2></section>}
    <div id="body"><AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages components={{ AssistantMessage: Message, UserMessage: Message }} />
    </AssistantRuntimeProvider></div>
  </main>
}
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
createRoot(document.getElementById('root')!).render(<App />)
