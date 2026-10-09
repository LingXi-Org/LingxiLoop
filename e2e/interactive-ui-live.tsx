import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import '@/styles/globals.css'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { createNativeMessage } from '@/lib/nativeMessage'
import type { ImEnvelope } from '@/lib/im/wukong'
import { convertEnvelope } from '@/features/chat/runtime/converter'
import { applyRunSnapshot } from '@/features/chat/runtime/run-updates'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { EMPTY_CONVERSATION_CHAT_STATE, mergeCanonicalMessages } from '@/features/chat/runtime/store'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import { useAuth } from '@/stores/auth'
import { http } from '@/api/core/http'

// This entry is built only by the isolated live test config; it never enters the product bundle.
const caseId = new URLSearchParams(location.search).get('case') ?? 'projectile'
interface Manifest { companyId: string; projectId: string; agentId: string; channelId: string; runs: { runId: string; sessionId: string; threadId?: string }[]; ready: boolean }
const manifest = await (await fetch(`/__ui_live/manifest?case=${encodeURIComponent(caseId)}`)).json() as Manifest
useAuth.setState({ activeCompanyId: manifest.companyId, ready: true })
setWorkspaceSession({ companyId: manifest.companyId, projectId: manifest.projectId })
const participant = { id: manifest.agentId, kind: 'agent' as const, name: '教学助手', initial: '助', avatarBg: '', status: 'avail' as const }

function LiveLesson() {
  const [chat, setChat] = useState(EMPTY_CONVERSATION_CHAT_STATE), [ready, setReady] = useState(false), [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  useEffect(() => {
    const cancellation = new AbortController(), streamed = new Set<string>()
    let loading = false
    let currentRuns = new Set(manifest.runs.map(run => run.runId)), currentAnswers = new Set<string>()
    let pending: { runs: Set<string>; answers: Set<string> } | null = null
    const originalFetch = window.fetch
    const observedFetch: typeof fetch = (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (method.toUpperCase() === 'POST' && path.startsWith(`/api/im/channels/${manifest.channelId}/`)
        && (path.endsWith('/actions') || path.endsWith('/messages/accept'))) {
        pending ??= { runs: new Set(currentRuns), answers: new Set(currentAnswers) }
        setReady(false)
      }
      return originalFetch.call(window, input, init)
    }
    // Observe real submissions without replacing responses or bypassing the product API.
    window.fetch = observedFetch
    const stream = async (run: Manifest['runs'][number]) => {
      streamed.add(run.runId)
      try {
        const target = { conversationId: manifest.channelId, agentId: manifest.agentId, runId: run.runId,
          ...(run.threadId ? { threadId: run.threadId } : {}) }
        await harnessApi.subscribe(target, snapshot => setChat(prior => applyRunSnapshot(prior, target, snapshot, participant)), cancellation.signal)
      } catch { if (!cancellation.signal.aborted) setError('消息流未完成') }
    }
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const state = await (await fetch(`/__ui_live/manifest?case=${encodeURIComponent(caseId)}`, { signal: cancellation.signal })).json() as Manifest
        const history = await http<ImEnvelope[]>(`/im/channels/${manifest.channelId}/messages?limit=100`, { signal: cancellation.signal })
        if (cancellation.signal.aborted) return
        for (const run of state.runs) if (!streamed.has(run.runId)) void stream(run)
        currentRuns = new Set(state.runs.map(run => run.runId))
        currentAnswers = new Set(history.filter(item => item.payload.role === 'assistant').map(item => item.payload.id))
        if (pending && [...currentRuns].some(id => !pending!.runs.has(id)) && [...currentAnswers].some(id => !pending!.answers.has(id))) pending = null
        const committed = history.map(item => convertEnvelope(item, { participants: { [participant.id]: participant }, meId: 'test-owner' }))
        setChat(prior => ({ ...prior, messages: mergeCanonicalMessages(prior.messages, committed) }))
        setReady(state.ready && !pending && state.runs.every(run => currentAnswers.has(`run-${run.runId}`)))
      } catch { if (!cancellation.signal.aborted) setError('消息读取失败') }
      finally { loading = false }
    }
    void load()
    const timer = setInterval(() => void load(), 750)
    return () => { cancellation.abort(); clearInterval(timer); if (window.fetch === observedFetch) window.fetch = originalFetch }
  }, [])
  const send = async (text: string) => {
    const id = crypto.randomUUID(), payload = createNativeMessage({ id, role: 'user', content: [{ type: 'text', text }], custom: { mentionedIds: [manifest.agentId] } })
    setReady(false)
    await http(`/im/channels/${manifest.channelId}/messages/accept`, { method: 'POST', body: JSON.stringify({ clientNonce: id, payload }) })
  }
  const runtime = useExternalStoreRuntime<ThreadMessage>({ messages: chat.messages, isRunning: !ready,
    onNew: async message => send(message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')) })
  return <main className="mx-auto max-w-3xl space-y-4 p-4">
    <h1 className="font-semibold">交互讲解产品链路验收</h1><p role="status">{ready ? '已就绪' : '正在生成'}</p>
    {error && <p role="alert">{error}</p>}
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message: NativeMessageContent }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
    <form onSubmit={event => { event.preventDefault(); void send(question).then(() => setQuestion('')).catch(() => setError('追问发送失败')) }}>
      <label htmlFor="followup">追问</label><input id="followup" className="w-full rounded border p-2" value={question} onChange={event => setQuestion(event.target.value)} />
      <button className="rounded border p-2" disabled={!ready || !question.trim()} type="submit">发送追问</button>
    </form>
  </main>
}
createRoot(document.getElementById('root')!).render(<LiveLesson />)
