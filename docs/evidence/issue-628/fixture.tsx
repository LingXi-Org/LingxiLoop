// Real layout/page/editor-host components, synthetic services and editor document.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SlidesSidebarLayout } from '@/components/shell/SlidesSidebarLayout'
import { SlidesPage } from '@/features/slides/SlidesPage'
import { useSlides } from '@/features/slides/store'
import { DesignWorkspace } from '@/features/design/DesignWorkspace'
import { artifactsApi } from '@/features/artifacts/api'
import type { ArtifactSummary } from '@/features/artifacts/contracts'
import '@/styles/globals.css'
import '@/features/design/design-workspace.css'
const deck = { id: 'deck', title: '合成演示文稿', kind: 'slides', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' } as ArtifactSummary
artifactsApi.listSlides = async () => [deck]
let workspaceCalls = 0
artifactsApi.slideWorkspace = async () => {
  // Keep chat setup pending, as when IM is slow; #629 lets the editor load independently.
  if (++workspaceCalls === 1) return new Promise(() => {})
  return { artifactId: 'deck', conversationId: 'synthetic-chat', agentId: 'agent', sourceConversationId: null }
}
artifactsApi.editorContext = async (_id, context) => context
artifactsApi.editorGrant = async id => ({ url: `${location.origin}/docs/evidence/issue-628/editor.html?${id}` }) as Awaited<ReturnType<typeof artifactsApi.editorGrant>>
function Fixture() {
  const [module, setModule] = useState('slides')
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  return <TooltipProvider><div className="desktop-openmaus flex h-dvh min-w-0 flex-col overflow-hidden">
    <div className="flex shrink-0 gap-4 p-2 text-sm"><button onClick={() => setModule(value => value === 'slides' ? 'chat' : 'slides')}>切换模块</button><button onClick={() => { setCount(value => value + 1); useSlides.setState({ decks: [{ ...deck, title: `合成演示文稿 ${count + 1}` }] }) }}>更新内容</button><span>{count}</span></div>
    <div className="flex min-h-0 flex-1 overflow-hidden"><nav className="w-16 shrink-0 bg-muted" aria-label="工作区">工作区</nav><div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border">
      {module === 'slides' ? <SlidesSidebarLayout><SlidesPage projectId="synthetic-project" /></SlidesSidebarLayout>
        : <DesignWorkspace design={open ? { artifactId: 'board', title: '合成画板' } : null} onClose={() => setOpen(false)}>
          <main data-fixture-chat className="flex h-full min-w-0 flex-col p-4"><button data-design-open-trigger onClick={() => setOpen(value => !value)}>切换画板</button><p>合成公开聊天内容</p><textarea aria-label="消息" className="min-w-0 border" /><button>发送</button></main>
        </DesignWorkspace>}
    </div></div>
  </div></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
