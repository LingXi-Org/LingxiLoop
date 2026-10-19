import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { harnessApi } from '../../src/features/chat/runtime/harness-api'
import { applyRunSnapshot } from '../../src/features/chat/runtime/run-updates'
import { EMPTY_CONVERSATION_CHAT_STATE } from '../../src/features/chat/runtime/store'
import { NativeMessageContent } from '../../src/features/chat/components/NativeMessageContent'
import { useAuth } from '../../src/stores/auth'
import '../../src/styles/globals.css'

// Synthetic local transport endpoint only; real decoder, reconciliation and
// product message rendering. This is not an authenticated whole-app benchmark.
useAuth.setState({ activeCompanyId: 'company' })
const originalFetch = window.fetch
window.fetch = (url, init) => originalFetch(String(url).includes('/runs/run/stream')
  ? '/perf-api/' + (new URLSearchParams(location.search).get('variant') === 'base' ? 'base' : 'candidate') : url, init)
function App() {
  const [state, setState] = useState(EMPTY_CONVERSATION_CHAT_STATE)
  const [started, setStarted] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (!started) return
    const cancellation = new AbortController()
    void harnessApi.subscribe({ conversationId: 'room', agentId: 'agent', runId: 'run' }, snapshot => {
      setState(previous => applyRunSnapshot(previous, { conversationId: 'room', agentId: 'agent', runId: 'run' }, snapshot))
    }, cancellation.signal).catch(error => { if (!cancellation.signal.aborted) setError(String(error)) })
    return () => cancellation.abort()
  }, [started])
  const runtime = useExternalStoreRuntime({ messages: state.messages, isRunning: Object.keys(state.activeRuns).length > 0, onNew: async () => {} })
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
    <label>响应检查<input aria-label="响应检查" /></label>
    <button type="button" disabled={started} onClick={() => { performance.mark('send'); setStarted(true) }}>发送合成流</button>
    {error && <p role="alert">{error}</p>}
    <div id="body"><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ AssistantMessage: NativeMessageContent, UserMessage: NativeMessageContent }} /></AssistantRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
