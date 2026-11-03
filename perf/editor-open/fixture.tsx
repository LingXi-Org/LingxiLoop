// Host for the actual ArtifactEditorFrame (and, when present, the actual
// editor warm-up). Only grants and documents are synthetic.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArtifactEditorFrame } from '@/features/artifacts/components/ArtifactEditorFrame'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import { warmEditorWhenIdle } from 'perf-preload'
import '@/styles/globals.css'

useAuth.setState({ user: { id: 'perf-user', name: 'Performance fixture' } as never, activeCompanyId: 'perf-company', authenticated: true, ready: true })
setWorkspaceSession({ companyId: 'perf-company', projectId: 'perf-project' })
// As the product does: a conversation warms Design, the Slides library warms Slides.
const warm = new URLSearchParams(location.search).get('warm')
if (warm === 'design' || warm === 'slides') warmEditorWhenIdle(warm)

type Open = { kind: 'design' | 'slides'; id: string }
function Fixture() {
  const [open, setOpen] = useState<Open | null>(null)
  const targets: Open[] = [{ kind: 'design', id: 'board-a' }, { kind: 'design', id: 'board-b' }, { kind: 'slides', id: 'deck-a' }, { kind: 'slides', id: 'deck-b' }]
  return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <nav style={{ padding: 8, display: 'flex', gap: 12 }}>
      {targets.map(target => <button key={target.id} id={`open-${target.id}`} type="button" onClick={() => setOpen(target)}>{target.id}</button>)}
      <button id="close" type="button" onClick={() => setOpen(null)}>close</button>
    </nav>
    <div style={{ flex: 1, minHeight: 0 }}>
      {open && <ArtifactEditorFrame key={open.id} artifactId={open.id} kind={open.kind} title={open.id} />}
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
