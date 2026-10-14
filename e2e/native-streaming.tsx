import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk } from 'assistant-stream'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '../src/lib/nativeMessage'
import { harnessApi } from '../src/features/chat/runtime/harness-api'
import { applyRunSnapshot } from '../src/features/chat/runtime/run-updates'
import { EMPTY_CONVERSATION_CHAT_STATE } from '../src/features/chat/runtime/store'
import { NativeMessageContent } from '../src/features/chat/components/NativeMessageContent'
import { useAuth } from '../src/stores/auth'
import type { AgentRunSnapshot, RunDisplayState } from '../src/lib/agentRunSnapshot'
import '../src/styles/globals.css'

// Only this fixture supplies synthetic HTTP responses; the production decoder,
// store reconciliation, native parts, Markdown and runtime remain unchanged.
const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
useAuth.setState({ activeCompanyId: 'company' })
let wire: ReadableStreamDefaultController<AssistantStreamChunk>
const fetchOriginal = window.fetch
window.fetch = async (url, init) => String(url).endsWith('/runs/run/stream?')
  ? AssistantStream.toResponse(new ReadableStream<AssistantStreamChunk>({ start(controller) { wire = controller } }), new AssistantTransportEncoder())
  : fetchOriginal(url, init)

function App() {
  const [state, setState] = useState(EMPTY_CONVERSATION_CHAT_STATE)
  const [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    void harnessApi.subscribe(target, snapshot => setState(state => applyRunSnapshot(state, target, snapshot)), abort.signal)
      .catch(error => { if (!abort.signal.aborted) setError(String(error)) })
    const step = (event: Event) => {
      const { text, tool, done, cancelled } = (event as CustomEvent<{ text: string; tool?: boolean; done?: boolean; cancelled?: boolean }>).detail
      const activity = { providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }
      const message = createNativeMessage({ id: 'run-run', role: 'assistant', createdAt: '2026-10-14T00:00:00Z',
        content: [{ type: 'text', text, ...activity }, ...(tool ? [{ type: 'tool-call' as const, toolCallId: 'host:search', toolName: 'research.search', args: {}, argsText: '',
          result: { status: 'completed', sources: [] }, providerMetadata: { lingxiloop: { activity: { version: 1, id: 'host:search', kind: 'tool', label: '检索资料' } } } }] : [])],
        status: cancelled ? { type: 'incomplete', reason: 'cancelled' } : done ? { type: 'complete', reason: 'stop' } : { type: 'running' },
        custom: { runId: 'run', activityPresentation: { version: 1 }, harness: { ...createRunView('run'), requestVersion: 1, fence: 1,
          lifecycle: cancelled ? 'cancelled' : done ? 'succeeded' : 'leased', delivery: done ? 'delivered' : null, artifacts: [] } } })
      wire.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: { message } as never }] })
    }
    window.addEventListener('native-streaming-step', step)
    const snapshot = (event: Event) => {
      const value = (event as CustomEvent<AgentRunSnapshot>).detail
      const message = value.message, harness = message.metadata.custom.harness as RunDisplayState
      wire.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: { message: { ...message, id: 'run-run',
        metadata: { ...message.metadata, custom: { ...message.metadata.custom, runId: 'run', harness: { ...harness, runId: 'run' } } } } } as never }] })
    }
    window.addEventListener('native-streaming-snapshot', snapshot)
    return () => { abort.abort(); window.removeEventListener('native-streaming-step', step); window.removeEventListener('native-streaming-snapshot', snapshot) }
  }, [])
  const runtime = useExternalStoreRuntime({ messages: state.messages, isRunning: Object.keys(state.activeRuns).length > 0, onNew: async () => {} })
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
    <input aria-label="响应检查" />{error && <p role="alert">{error}</p>}
    <div id="body"><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ AssistantMessage: NativeMessageContent }} /></AssistantRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
