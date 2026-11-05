import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DesignWorkspace } from '@/features/design/DesignWorkspace'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'
import '@/features/design/design-workspace.css'

useAuth.setState({ user: { id: 'perf-user', name: 'Performance fixture' } as never, activeCompanyId: 'perf-company', authenticated: true, ready: true })
setWorkspaceSession({ companyId: 'perf-company', projectId: 'perf-project' })
document.documentElement.style.cssText = 'height:100%;'
document.body.style.cssText = 'height:100%;margin:0;'
document.getElementById('root')!.style.cssText = 'height:100%;'

function Fixture() {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState('a')
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <nav style={{ padding: 8, display: 'flex', gap: 16 }}>
      <button id="open" type="button" onClick={() => { performance.mark('fixture:open'); setOpen(true) }}>打开</button>
      <button id="close" type="button" onClick={() => setOpen(false)}>收起</button>
      <button id="switch" type="button" onClick={() => { setOpen(false); setScope(s => s === 'a' ? 'b' : 'a') }}>切换会话</button>
    </nav>
    <div style={{ flex: 1, minHeight: 0 }}>
      {<DesignWorkspace key={scope} design={open ? { artifactId: `board-${scope}`, title: `性能样稿 ${scope}` } : null} onClose={() => setOpen(false)}>
        <main><p>对话正文</p><textarea aria-label="消息" /></main>
      </DesignWorkspace>}
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
