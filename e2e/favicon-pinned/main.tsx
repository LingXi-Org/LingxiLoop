import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationListItemContent } from '@/im/ConversationList'
import { Item } from '@/components/ui/item'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { conversationsApi } from '@/features/conversations/api'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'

if (!import.meta.env.DEV) throw new Error('Synthetic development fixture only')
useAuth.setState({ activeCompanyId: 'fixture-company', user: { id: 'fixture-user', name: '合成用户', email: 'fixture@example.invalid', emailVerified: true, providers: [] } })
setWorkspaceSession({ companyId: 'fixture-company', projectId: 'fixture-project' })
useParticipants.setState({ byId: {}, loaded: true })
await useConversations.getState().reload()
function App() {
  const rows = useConversations(state => state.list)
  const [selected, setSelected] = useState('ordinary')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ordered = [...rows.filter(row => row.pinned), ...rows.filter(row => !row.pinned)]
  return <main className="mx-auto max-w-3xl space-y-5 bg-background p-5 text-foreground">
    <h1 className="text-lg">实际图标资源与合成会话</h1>
    <div className="flex gap-4" aria-label="图标在深浅背景中">
      {['white', '#151515'].map(background => <div key={background} className="flex gap-3 p-3" style={{ background }}>
        {['favicon.svg', 'favicon-32.png', 'favicon.ico'].map(name => <img key={name} alt={name} width={32} height={32} src={`/${name}?v=rounded-20261024`} />)}
      </div>)}
    </div>
    <section className="w-full max-w-80 bg-sidebar p-2" aria-label="合成会话列表">
      {ordered.map(row => <div key={row.id} data-conversation-id={row.id}>
        <Item role="button" tabIndex={0} size="sm" variant={selected === row.id ? 'muted' : 'default'}
          aria-current={selected === row.id ? 'page' : undefined} onClick={() => setSelected(row.id)}
          className="mb-2 cursor-pointer flex-nowrap text-left hover:bg-muted focus-visible:ring-inset">
          <ConversationListItemContent conversation={row} selected={selected === row.id} />
        </Item>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await conversationsApi.togglePin(row.id, !row.pinned); await useConversations.getState().reload() }
          catch { setError('夹具状态更新失败') }
          finally { setBusy(false) }
        }}>{row.pinned ? '取消置顶' : '置顶'} {row.id}</Button>
      </div>)}
    </section>
    {error && <p role="alert">{error}</p>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
