import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GenUiCard } from '@/features/chat/visualize/zcode/gen-ui/components/GenUiCard'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'

// Historical document fixture: actual card, Web host, official guest and SDK.
// Only the API transport is local and deterministic; this is not a provider test.
useAuth.setState({ activeCompanyId: 'fixture-company', ready: true })
setWorkspaceSession({ companyId: 'fixture-company', projectId: 'fixture-project' })
const count = Number(new URLSearchParams(location.search).get('count') ?? 1)
const offscreen = new URLSearchParams(location.search).has('offscreen')
await fetch('/__visualize_fixture/reset')
function LoadingFixture() {
  const [session, setSession] = useState<string | null>(null)
  const enter = (value: string) => {
    performance.clearResourceTimings()
    performance.mark('conversation-entry')
    setSession(value)
  }
  return <main style={{ padding: 24 }}>
    <nav style={{ display: 'flex', gap: 12 }}>
      <button onClick={() => enter('A')}>进入 A</button>
      <button onClick={() => enter('B')}>进入 B</button>
      <button onClick={() => setSession(null)}>退出</button>
      <input aria-label="对话输入" placeholder="继续输入" />
    </nav>
    <p>对话正文始终可读，以下为已保存的完整交互内容。</p>
    <div style={{ display: 'grid', gridTemplateColumns: count > 1 && !offscreen ? 'repeat(3,minmax(0,1fr))' : '1fr', gap: offscreen ? 1100 : 16, maxWidth: 1100, margin: 'auto' }}>
      {session && Array.from({ length: count }, (_, index) => {
        const target = { workspacePath: 'fixture-project', workspaceIdentity: 'fixture-company', sessionId: `fixture-channel-${session}`, path: '/fixture/acceptance.html', instanceKey: `loading-${index}`, sourceMessageId: 'fixture-source' }
        return <GenUiCard key={`${session}:${index}`} target={target} reference={{ path: target.path, title: `交互内容 ${index + 1}` }} />
      })}
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<LoadingFixture />)
