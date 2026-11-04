// Real product conversation text/workspace, backed only by a public saved-model snapshot.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, type TextMessagePartProps, type ThreadMessage } from '@assistant-ui/react'
import { AnswerText } from '@/features/chat/components/AnswerText'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { DesignWorkspace } from '@/features/design/DesignWorkspace'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'
import '@/features/design/design-workspace.css'

interface Snapshot { canvasId: string; title: string; text: string[] }
useAuth.setState({ user: { id: 'public-snapshot-user', name: 'Public snapshot fixture' } as never,
  activeCompanyId: 'public-snapshot-company', authenticated: true, ready: true })
setWorkspaceSession({ companyId: 'public-snapshot-company', projectId: 'public-snapshot-project' })
function Body() { return <div data-model-answer><MarkdownText agent /></div> }
function Text(part: TextMessagePartProps) { return <AnswerText part={part} Text={Body} readOnly={false} /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function Conversation({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState(false)
  const message: ThreadMessage = { id: 'public-model-source', role: 'assistant', content: [{ type: 'text', text: snapshot.text.join('\n\n') }], createdAt: new Date('2026-11-04T00:00:00Z'),
    status: { type: 'complete', reason: 'stop' }, metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [],
      custom: { conversationId: 'public-model-room', sourceMessageId: 'public-model-source' } } }
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: false, onNew: async () => {} })
  return <DesignWorkspace design={open ? { artifactId: snapshot.canvasId, title: snapshot.title } : null} onClose={() => setOpen(false)}>
    <main className="h-full overflow-auto p-8"><h1 className="mb-4 text-xl font-semibold">本对话</h1>
      <button id="open-design" data-design-open-trigger type="button" className="mb-6 rounded border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(true)}>打开本对话 Design</button>
      <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message }} /></AssistantRuntimeProvider>
    </main>
  </DesignWorkspace>
}
function Fixture() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  useEffect(() => { void fetch('/__snapshot').then(response => response.json()).then(setSnapshot) }, [])
  return <div style={{ height: '100vh' }}>{snapshot ? <Conversation snapshot={snapshot} /> : <p role="status">正在读取已保存讲解…</p>}</div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
