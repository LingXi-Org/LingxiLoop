import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { CanvasView } from '@/features/canvas/components/CanvasView'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { useCanvas } from '@/features/canvas/state'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'
import { useParticipants } from '@/features/agents/state'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import { ws } from '@/api/core/realtime'

useAuth.setState({ activeCompanyId: 'fixture-company', ready: true })
setWorkspaceSession({ companyId: 'fixture-company', projectId: 'fixture-project' })
useApp.setState({ selectedConversationId: 'fixture-conversation' })
useParticipants.setState({ byId: { teacher: { id: 'teacher', name: '测试助教', kind: 'agent', role: 'teacher', status: 'avail', initial: '教', avatarBg: '#7257d9', capabilities: ['canvas'] } } })
ws.connect = async () => undefined
const params = new URLSearchParams(location.search)
if (!params.has('restore')) await fetch('/__canvas/reset', { method: 'POST' })
function Fixture() {
  const [open, setOpen] = useState(true)
  return <GlobalInteractionProvider><div style={{ height: 'calc(100vh - 50px)' }}>{open && <CanvasView canvasId="fixture-canvas" onBack={() => setOpen(false)} />}</div><aside style={{ height: 50, padding: 8, display: 'flex', gap: 12 }}>
    <button onClick={async () => { const frame = await fetch('/__canvas/remote', { method: 'POST' }).then(r => r.json()); useCanvas.getState().applyEvent({ type: 'canvas.changed', companyId: 'fixture-company', canvasId: 'fixture-canvas', timestamp: new Date().toISOString(), kind: 'frame.updated', frame }) }}>Fixture remote edit</button>
    <button onClick={() => { useAuth.setState({ activeCompanyId: 'different-company' }) }}>Fixture switch company</button>
    <button onClick={() => setOpen(true)}>Fixture reopen canvas</button>
  </aside></GlobalInteractionProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
