import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime/runtime'
import { chatTransport } from '@/features/chat/runtime/transport'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'

if (!import.meta.env.DEV) throw new Error('Local synthetic fixture only')
const manifest = await (await fetch('/api/__group_wake/manifest')).json() as {
  companyId: string; projectId: string; channelId: string; agentIds: string[]
}
useAuth.setState({ user: { id: 'test-owner', name: '合成教师', email: 'synthetic@example.invalid', emailVerified: true, providers: [] }, activeCompanyId: manifest.companyId })
setWorkspaceSession({ companyId: manifest.companyId, projectId: manifest.projectId })
useParticipants.setState({ loaded: true, byId: Object.fromEntries([
  ...['test-owner', 'group-wake-peer'].map(id => [id, { id, kind: 'human' as const, name: id, initial: '师', avatarBg: 'transparent', status: 'avail' as const }]),
  ...manifest.agentIds.map(id => [id, { id, kind: 'agent' as const, name: id, initial: '助', avatarBg: 'transparent', status: 'avail' as const }]),
]) })
useConversations.setState({ loaded: true, list: [{ id: manifest.channelId, title: '合成教师群聊', kind: 'group', members: ['test-owner', 'group-wake-peer', ...manifest.agentIds] }] as never })
chatTransport.setWorkspaceChannels([manifest.channelId])

function App() {
  useEffect(() => {
    // This fixture verifies HTTP send, durable IM history and ordinary native
    // rendering. Polling replaces workspace WS notification only; it never
    // creates a run, fabricates a message, or calls runtime receive/ingest.
    const timer = setInterval(() => { void chatTransport.reloadConversation(manifest.channelId) }, 700)
    return () => { clearInterval(timer); chatTransport.disconnect() }
  }, [])
  return <TooltipProvider><main className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
    <h1 className="px-4 py-2 text-sm">群聊唤醒本地验收</h1>
    <p className="px-4 text-xs text-muted-foreground">普通消息由默认助教回复；@ 指定助教切换对象。仅合成数据，历史通过 HTTP 核对。</p>
    <ConversationRuntimeProvider conversationId={manifest.channelId}><div className="min-h-0 flex-1"><ConversationThread conversationId={manifest.channelId} /></div></ConversationRuntimeProvider>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
