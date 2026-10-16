import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationRuntimeProvider } from '../src/features/chat/runtime/runtime'
import { ConversationThread } from '../src/features/chat/components/ConversationThread'
import { chatTransport } from '../src/features/chat/runtime/transport'
import { resetChatThreadStore, useChatThreadStore } from '../src/features/chat/runtime/store'
import { useAuth } from '../src/stores/auth'
import { useParticipants } from '../src/features/agents/state'
import { setWorkspaceSession } from '../src/lib/workspaceSession'
import { TooltipProvider } from '../src/components/ui/tooltip'
import '../src/styles/globals.css'

// The browser uses ordinary product history/list/snapshot endpoints. Only login
// and workspace selection are supplied by the isolated authenticated API fixture.
const fixture = await fetch('/.e2e/error-recovery/fixture.json').then(response => response.json())
const { companyId, projectId, agentId, userId, conversationId, runId } = fixture
useAuth.setState({ activeCompanyId: companyId, user: { id: userId, name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] } })
setWorkspaceSession({ companyId, projectId })
useParticipants.setState({ byId: { [agentId]: { id: agentId, kind: 'agent', name: '研究助手', initial: '助', avatarBg: 'transparent', status: 'avail' } } })
chatTransport.setWorkspaceChannels([conversationId])
const observed: string[] = []
useChatThreadStore.subscribe(store => {
  const message = store.conversations[conversationId]?.messages.find(message => message.id === `run-${runId}`)
  if (message) observed.push(message.status!.type)
  document.getElementById('observed')!.textContent = JSON.stringify(observed)
})
function App() {
  const [open, setOpen] = useState(true)
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <nav className="flex gap-4 p-4">
      <button onClick={() => setOpen(false)}>离开对话</button>
      <button onClick={() => setOpen(true)}>重新进入</button>
      <button onClick={() => window.location.reload()}>刷新页面</button>
      <button onClick={() => { setOpen(false); resetChatThreadStore() }}>离开并清空缓存</button>
    </nav>
    <pre id="observed" aria-label="状态记录" />
    {open && <div className="min-h-0 flex-1"><ConversationRuntimeProvider conversationId={conversationId}>
      <ConversationThread conversationId={conversationId} readOnly />
    </ConversationRuntimeProvider></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><App /></TooltipProvider>)
