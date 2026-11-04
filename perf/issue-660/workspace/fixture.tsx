// Real workspace wrappers, iframe editors and public native Panel API.
// Public documents and capability/IM replies are synthetic in the local driver.
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createRoot } from 'react-dom/client'
import { DesignWorkspace } from '@/features/design/DesignWorkspace'
import { SlidesWorkspace } from '@/features/slides/SlidesWorkspace'
import { SlidesSidebarLayout } from '@/components/shell/SlidesSidebarLayout'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useSidebarWidth } from 'sidebar-width-owner'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useSlides } from '@/features/slides/store'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'
import '@/styles/chat.css'
import '@/features/design/design-workspace.css'

useAuth.setState({ user: { id: 'perf-user', name: 'Public fixture' } as never, activeCompanyId: 'perf-company', authenticated: true, ready: true })
setWorkspaceSession({ companyId: 'perf-company', projectId: 'perf-project' })
useConversations.setState({ list: [{ id: 'perf-conversation', kind: 'group', title: '公共样稿', members: ['perf-user'], readOnly: false } as never], loaded: true })
useSlides.setState({ decks: Array.from({ length: 200 }, (_, n) => ({ id: 'deck-'+n, title: '公共演示文稿 '+n } as never)) })
const kind = new URLSearchParams(location.search).get('kind') ?? 'design'
const storageKey = 'lingxiloop:desktop-layout:sidebar-width:v1'
let writes = 0
const setItem = Storage.prototype.setItem
Storage.prototype.setItem = function (key, value) { if (key === storageKey) writes++; return setItem.call(this, key, value) }
Object.assign(window, { sidebarWrites: () => writes })
function Conversation() {
 return <div style={{ height: '100%', overflow: 'auto', padding: 16 }}><textarea aria-label="消息" defaultValue="保留未发送草稿" />{Array.from({ length: 200 }, (_, n) => <p key={n}>公共长会话 {n}：在同一会话继续编辑，不丢失阅读位置。</p>)}</div>
}
function NativeDesktop() {
 const { width, panelRef, onLayoutChanged, resetWidth } = useSidebarWidth()
 const collapsible = new URLSearchParams(location.search).has('collapse')
 return <ResizablePanelGroup id="desktop-conversation-layout" onLayoutChanged={onLayoutChanged}>
  <ResizablePanel id="conversations" panelRef={panelRef} collapsible={collapsible} collapsedSize={0} defaultSize={width} minSize={260} maxSize={360} groupResizeBehavior="preserve-pixel-size"><div>{Array.from({ length: 200 }, (_, n) => <p key={n}>会话 {n}</p>)}</div></ResizablePanel>
  <ResizableHandle withHandle aria-label="调整侧边栏宽度" onDoubleClick={resetWidth} />
  <ResizablePanel id="workspace" minSize={320}><Conversation /></ResizablePanel>
 </ResizablePanelGroup>
}
function Fixture() {
 const [open, setOpen] = useState(false)
 const [scope, setScope] = useState('a')
 const [retained, setRetained] = useState(false)
 return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
  <nav style={{ display: 'flex', padding: 8, gap: 16 }}>
   <button id="open" type="button" onClick={() => { setRetained(true); setOpen(true) }}>打开</button>
   <button id="close" type="button" onClick={() => setOpen(false)}>收起</button>
   <button id="switch" type="button" onClick={() => { setOpen(false); setRetained(false); setScope(v => v === 'a' ? 'b' : 'a') }}>切换会话</button>
  </nav>
  <div style={{ flex: 1, minHeight: 0 }}>
   {kind === 'desktop' ? <NativeDesktop /> : kind === 'design' ? <DesignWorkspace key={scope} design={open ? { artifactId: 'board-'+scope, title: '公共设计稿' } : null} onClose={() => setOpen(false)}><Conversation /></DesignWorkspace>
    : <SlidesSidebarLayout active={open}>
      {retained ? <div style={{ height: '100%', visibility: open ? 'visible' : 'hidden' }} inert={!open}><SlidesWorkspace key={scope} artifactId={'deck-'+scope} title="公共幻灯片" visible={open} onClose={() => setOpen(false)} /></div> : <p>公共作品列表</p>}
     </SlidesSidebarLayout>}
  </div>
 </div>
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><Fixture /></TooltipProvider>)
