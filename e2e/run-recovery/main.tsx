import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk } from 'assistant-stream'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '../../src/lib/nativeMessage'
import { useAuth } from '../../src/stores/auth'
import { ChatTransport } from '../../src/features/chat/runtime/transport'
import { applyRunSnapshot } from '../../src/features/chat/runtime/run-updates'
import { EMPTY_CONVERSATION_CHAT_STATE, updateConversation, useChatThreadStore } from '../../src/features/chat/runtime/store'
import { RUN_RECOVERY } from '../../src/features/chat/runtime/recovery'
import { ConversationMessage } from '../../src/features/chat/components/ConversationMessage'
import type { RunDisplayState } from '../../src/lib/agentRunSnapshot'
import '../../src/styles/globals.css'

// Synthetic HTTP only; production decoder, transport, timers, reconciliation and UI.
Object.assign(RUN_RECOVERY, { requestMs: 100, pollMs: 150, waitMs: 1600 })
useAuth.setState({ activeCompanyId: 'company' })
const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'replay'
const evidence = { streams: 0, reads: 0, mutations: 0, cancelled: 0 }
const snapshot = (lifecycle: RunDisplayState['lifecycle'], seq = 1) => ({ message: createNativeMessage({ id: 'run-run', role: 'assistant',
  content: [{ type: 'text', text: '已经保存的回复正文。' }], status: lifecycle === 'leased' ? { type: 'running' as const }
    : lifecycle === 'succeeded' ? { type: 'complete' as const, reason: 'stop' as const }
    : { type: 'incomplete' as const, reason: lifecycle === 'cancelled' ? 'cancelled' as const : 'error' as const },
  custom: { runId: 'run', harnessControl: true, harness: { ...createRunView('run'), lifecycle, requestVersion: 1, fence: 1, lastSeq: seq, artifacts: [] } },
}) })
window.fetch = async (url, init) => {
  if (!String(url).includes('/runs/run')) return Response.json({})
  if (init?.method && init.method !== 'GET') { evidence.mutations++; throw new Error('Reconnect attempted a mutation') }
  const stream = String(url).includes('/stream?')
  if (stream) evidence.streams++; else evidence.reads++
  const count = evidence.streams
  if (scenario === 'forbidden' || scenario === 'missing' || scenario === 'offline') return new Response('', { status: scenario === 'forbidden' ? 403 : scenario === 'missing' ? 404 : 503 })
  if (stream && scenario === 'headers' && count === 1) return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => { evidence.cancelled++; reject(init!.signal!.reason) }, { once: true }))
  const lifecycle = scenario === 'failed' ? 'failed' : scenario === 'cancelled' ? 'cancelled'
    : count >= 2 || scenario === 'headers' ? 'succeeded' : 'leased'
  if (!stream) return Response.json(snapshot(lifecycle, lifecycle === 'leased' ? 1 : 2))
  return AssistantStream.toResponse(new ReadableStream<AssistantStreamChunk>({
    start(controller) {
      if (scenario === 'snapshot' && count === 1) return
      const send = () => controller.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: snapshot(lifecycle, lifecycle === 'leased' ? 1 : 2) as never }] })
      send(); send()
      if (count === 1 && scenario === 'replay') setTimeout(() => controller.error(new Error('Synthetic EOF')), 20)
    },
    cancel() { evidence.cancelled++ },
  }), new AssistantTransportEncoder())
}
const transport = new ChatTransport()
function App() {
  const [state, setState] = useState(EMPTY_CONVERSATION_CHAT_STATE)
  const [, render] = useState(0)
  useEffect(() => {
    const unsubscribe = useChatThreadStore.subscribe(store => setState(store.conversations.room ?? EMPTY_CONVERSATION_CHAT_STATE))
    updateConversation('room', state => applyRunSnapshot(state, target, snapshot('leased')))
    void transport.refreshRun(target)
    const timer = setInterval(() => render(value => value + 1), 100)
    return () => { clearInterval(timer); unsubscribe(); transport.disconnect() }
  }, [])
  const runtime = useExternalStoreRuntime({ messages: state.messages, isRunning: Object.keys(state.activeRuns).length > 0, onNew: async () => {} })
  return <main style={{ maxWidth: 900, padding: 24 }}><AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Messages components={{ AssistantMessage: ConversationMessage }} />
  </AssistantRuntimeProvider><output aria-label="恢复证据">{JSON.stringify({ ...evidence, status: state.messages[0]?.status?.type,
    connection: state.messages[0]?.metadata.custom.runConnection, active: Object.keys(state.activeRuns).length })}</output></main>
}
createRoot(document.getElementById('root')!).render(<App />)
