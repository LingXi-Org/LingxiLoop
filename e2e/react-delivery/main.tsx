import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk } from 'assistant-stream'
import { harnessApi, type AgentRunTarget } from '../../src/features/chat/runtime/harness-api'
import { applyRunSnapshot } from '../../src/features/chat/runtime/run-updates'
import { EMPTY_CONVERSATION_CHAT_STATE } from '../../src/features/chat/runtime/store'
import { ConversationMessage } from '../../src/features/chat/components/ConversationMessage'
import type { AgentRunSnapshot } from '../../src/lib/agentRunSnapshot'
import { useAuth } from '../../src/stores/auth'
import type { ReactDeliveryHarness } from './contract'
import '../../src/styles/globals.css'

// Synthetic HTTP boundary only. Identity, decoder, reconciliation, native parts
// and message rendering remain the production implementations.
const streams = new Map<string, ReadableStreamDefaultController<AssistantStreamChunk>>()
const connections = new Map<string, AbortController>()
const history = new Map<string, AgentRunSnapshot>()
const key = (target: AgentRunTarget) => JSON.stringify([target.conversationId, target.agentId, target.runId, target.threadId ?? null])
const targets = new Map<string, AgentRunTarget>()
let received = 0
let rendered = 0
let mutations = 0
let streamConnections = 0
const originalFetch = window.fetch.bind(window)
useAuth.setState({ activeCompanyId: 'company' })

window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
  if (!url.pathname.startsWith('/api/')) return originalFetch(input, init)
  if (init?.method && init.method !== 'GET') {
    mutations++
    throw new Error('The recovery fixture forbids API mutations')
  }
  const target = [...targets.values()].find(candidate => {
    const suffix = `/channels/${encodeURIComponent(candidate.conversationId)}/agents/${encodeURIComponent(candidate.agentId)}/runs/${encodeURIComponent(candidate.runId)}`
    return (url.pathname.endsWith(suffix) || url.pathname.endsWith(`${suffix}/stream`))
      && (url.searchParams.get('threadId') ?? null) === (candidate.threadId ?? null)
  })
  if (!target) return new Response('Unknown synthetic target', { status: 404 })
  const identity = key(target)
  if (url.pathname.endsWith('/stream')) {
    streamConnections++
    return AssistantStream.toResponse(new ReadableStream<AssistantStreamChunk>({
      start(controller) { streams.set(identity, controller) },
      cancel() { streams.delete(identity) },
    }), new AssistantTransportEncoder())
  }
  const saved = history.get(identity)
  return saved ? Response.json(saved) : new Response('No saved synthetic history', { status: 404 })
}

function Message() {
  const id = useAuiState(state => state.message.id)
  const status = useAuiState(state => state.message.status?.type)
  return <section data-react-message={id} data-react-status={status}><ConversationMessage /></section>
}

async function waitFor(condition: () => boolean) {
  const deadline = performance.now() + 5000
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Synthetic stream did not reach the requested checkpoint')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function App() {
  const [state, setState] = useState(EMPTY_CONVERSATION_CHAT_STATE)
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => { rendered = count }, [count])
  useEffect(() => {
    const receive = (target: AgentRunTarget, snapshot: AgentRunSnapshot) => {
      setState(current => applyRunSnapshot(current, target, snapshot))
      setCount(++received)
    }
    const connect = async (target: AgentRunTarget) => {
      const identity = key(target)
      if (connections.has(identity)) return
      targets.set(identity, target)
      const controller = new AbortController()
      connections.set(identity, controller)
      void harnessApi.subscribe(target, snapshot => receive(target, snapshot), controller.signal)
        .catch(failure => { if (!controller.signal.aborted) setError(String(failure)) })
      await waitFor(() => streams.has(identity))
    }
    const disconnect = async (target: AgentRunTarget) => {
      const identity = key(target)
      connections.get(identity)?.abort()
      connections.delete(identity)
      await waitFor(() => !streams.has(identity))
    }
    const harness: ReactDeliveryHarness = {
      async push(frame) {
        await connect(frame.target)
        const previous = received
        streams.get(key(frame.target))!.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: frame.snapshot as never }] })
        await waitFor(() => received > previous && rendered === received)
      },
      async reconnect(target) { await disconnect(target); await connect(target) },
      async restore(frames) {
        for (const { target, snapshot } of frames) {
          targets.set(key(target), target)
          history.set(key(target), snapshot)
          receive(target, await harnessApi.read(target))
        }
        await waitFor(() => rendered === received)
      },
      async reset() {
        await Promise.all([...targets.values()].map(disconnect))
        targets.clear(); history.clear(); setState(EMPTY_CONVERSATION_CHAT_STATE); setError('')
        received = 0; mutations = 0; streamConnections = 0; setCount(0)
        await waitFor(() => connections.size === 0 && rendered === 0)
      },
      evidence: () => ({ received, rendered, mutations, streamConnections }),
    }
    window.reactDelivery = harness
    return () => { for (const controller of connections.values()) controller.abort(); delete window.reactDelivery }
  }, [])
  const runtime = useExternalStoreRuntime({ messages: state.messages, isRunning: Object.keys(state.activeRuns).length > 0, onNew: async () => {} })
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
    <input aria-label="响应检查" />
    {error && <p role="alert" data-react-fixture-error>{error}</p>}
    <div id="body"><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ AssistantMessage: Message }} /></AssistantRuntimeProvider></div>
    <output aria-label="合成恢复证据">{JSON.stringify({ received: count, mutations, streamConnections })}</output>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
