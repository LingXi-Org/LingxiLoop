import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime/runtime'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from '@/features/chat/runtime/store'
import { applyRunSnapshot } from '@/features/chat/runtime/run-updates'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import type { AgentRunSnapshot, RunDisplayState } from '@/lib/agentRunSnapshot'
import '@/styles/globals.css'

if (!import.meta.env.DEV && !(import.meta.env.MODE === 'questionnaire-test' && location.hostname === '127.0.0.1')) throw new Error('Local synthetic fixture only')
const conversationId = 'answer-first-room', agentId = 'answer-first-agent'
const params = new URLSearchParams(location.search)
const draftUser = params.get('draftUser') ?? 'fixture-human', draftProject = params.get('draftProject') ?? 'fixture-project'
const draftThread = params.get('draftThread')
useAuth.setState({ user: { id: draftUser, name: '合成用户', email: 'fixture@example.com', emailVerified: true, providers: [] }, activeCompanyId: 'fixture-company' })
setWorkspaceSession({ companyId: 'fixture-company', projectId: draftProject })
useWorkspace.setState({ selectedId: draftProject })
useParticipants.setState({ byId: { [agentId]: { id: agentId, kind: 'agent', name: '学习助手', initial: '学', avatarBg: 'transparent', status: 'avail' } }, loaded: true })
useConversations.setState({ list: [{ id: conversationId, title: '本地合成会话', kind: 'group', members: ['fixture-human', agentId] }] as never })
useChatThreadStore.setState({ conversations: { [conversationId]: { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false } } })

function App() {
  const [error, setError] = useState('')
  const [received, setReceived] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const seed = await (await fetch('/__fixture/seed')).json() as AgentRunSnapshot
      const view = seed.message.metadata.custom.harness as RunDisplayState
      const target = { conversationId, agentId, runId: view.runId }
      await harnessApi.subscribe(target, snapshot => {
        useChatThreadStore.setState(state => ({ conversations: { ...state.conversations,
          [conversationId]: applyRunSnapshot(state.conversations[conversationId]!, target, snapshot) } }))
        setReceived(value => value + 1)
      }, controller.signal)
    })().catch(error => { if (!controller.signal.aborted) setError(String(error)) })
    return () => controller.abort()
  }, [])
  return <TooltipProvider><main data-fixture-received={received} className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
    {error && <p role="alert">{error}</p>}
    <ConversationRuntimeProvider conversationId={conversationId} threadRootId={draftThread}><div className="min-h-0 flex-1"><ConversationThread conversationId={conversationId} threadRootId={draftThread} /></div></ConversationRuntimeProvider>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
