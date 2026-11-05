// Public, disposable browser fixture for the real AnswerText and HTTP client.
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, type TextMessagePartProps, type ThreadMessage } from '@assistant-ui/react'
import { AnswerText } from '@/features/chat/components/AnswerText'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'

const body = '历史正文前半段😀。\n\n::visualize{"path":"/work/public-lesson.html","title":"公共历史讲解"}\n\n历史正文后半段。'
useAuth.setState({ user: { id: 'public-archive-user', name: 'Public archive fixture' } as never,
  activeCompanyId: 'public-archive-company', authenticated: true, ready: true })
setWorkspaceSession({ companyId: 'public-archive-company', projectId: 'public-archive-project' })
const message: ThreadMessage = { id: 'public-source', role: 'assistant', content: [{ type: 'text', text: body }], createdAt: new Date('2026-11-04T00:00:00Z'),
  status: { type: 'complete', reason: 'stop' }, metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [],
    custom: { conversationId: 'public-room', sourceMessageId: 'public-source' } } }
function Body() { return <div data-historical-body><MarkdownText agent /></div> }
function Text(part: TextMessagePartProps) { return <AnswerText part={part} Text={Body} readOnly={false} /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function Fixture() {
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: false, onNew: async () => {} })
  return <main className="mx-auto max-w-3xl p-8"><h1 className="mb-6 text-xl font-semibold">历史讲解</h1>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message }} /></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
